import { CONNECTORS } from "../connectors";
import { assertNotCancelled, CancelledError, logEvent, setStatus, sql } from "../db";
import { friendlyReason, UserFacingError } from "../errors";
import { llmProvider } from "../llm";
import { PAGE_KEYS, type ConnectorId, type DropReasons, type RawItem, type SourceStep, type Workflow, type WorkflowPlan } from "../types";
import { extractAll } from "./extract";
import { planWorkflow } from "./planner";
import { RejectedRequestError } from "./safety";
import { identityField, sourceName, validateAndDedupe, type CleanRow } from "./validate";

// Raw items kept per run; env override for quota-limited runs (eval --lite).
const maxRaw = () => Math.min(Math.max(Number(process.env.MAX_RAW_ITEMS) || 120, 6), 150);

/**
 * Upsert rows by dedupe key so ids (and fetched_at = first seen) stay stable across live batches and refreshes.
 * Existing keys are merged (`old || new`) so AI-column values added later survive. With `prune`, rows no longer in
 * `clean` are removed if this run added them (live batches) or their source is in `prune.sources`; returns how many were.
 */
async function syncRecords(id: string, clean: CleanRow[], prune?: { since: string; sources: string[] }): Promise<number> {
  if (clean.length) {
    await sql`INSERT INTO records (workflow_id, data, source_name, source_url, confidence, dedupe_key)
      SELECT ${id}, x.data, x.source_name, x.source_url, x.confidence, x.dedupe_key
      FROM jsonb_to_recordset(${JSON.stringify(clean)}::jsonb)
        AS x(data jsonb, source_name text, source_url text, confidence real, dedupe_key text)
      ON CONFLICT (workflow_id, dedupe_key) DO UPDATE SET
        -- columns and AI-column answers with their basis survive (||); the per-page keys of the previous run are
        -- replaced, never mixed with the new ones, since they describe one page: the one in source_url
        data = (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) FROM jsonb_each(records.data) AS e(k, v) WHERE NOT (k = ANY(${PAGE_KEYS})))
          || EXCLUDED.data,
        source_name = EXCLUDED.source_name,
        source_url = EXCLUDED.source_url, confidence = EXCLUDED.confidence`;
  }
  if (!prune) return 0;
  const gone = await sql`DELETE FROM records WHERE workflow_id = ${id}
    AND (fetched_at >= ${prune.since}
      OR source_name IN (SELECT jsonb_array_elements_text(${JSON.stringify(prune.sources)}::jsonb)))
    AND dedupe_key NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(clean.map((c) => c.dedupe_key))}::jsonb))
    RETURNING id`;
  return gone.length;
}

// web_search alone can take ~180s; past this a step counts as failed so extraction still gets its time
const STEP_TIMEOUT_MS = 100_000;

/** Run one source step, recording it in `sources` and the activity log. Failures return no items. */
async function collectStep(id: string, step: SourceStep, timeoutMs = STEP_TIMEOUT_MS): Promise<RawItem[]> {
  const c = CONNECTORS[step.connector];
  const t0 = Date.now();
  await logEvent(id, "collect", `→ ${c.label}: "${step.query}"`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // connectors take no abort signal: a step that runs over is abandoned, and its fetches end with the function
    const r = await Promise.race([
      c.run(step.query, step.limit ?? 20),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new UserFacingError(`took longer than ${timeoutMs / 1000}s, so it was skipped`)), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
    const ms = Date.now() - t0;
    for (const w of r.warnings ?? []) await logEvent(id, "collect", w, "warn");
    // "empty" rather than "ok" so a search that silently found nothing stands out in the Sources tab
    const pages = [...new Set(r.items.map((it) => it.url).filter((u) => /^https?:\/\//.test(u)))].slice(0, 40);
    await sql`INSERT INTO sources (workflow_id, connector, query, url, status, items, duration_ms, pages)
              VALUES (${id}, ${step.connector}, ${step.query}, ${r.url ?? null}, ${r.items.length ? "ok" : "empty"}, ${r.items.length}, ${ms}, ${JSON.stringify(pages)}::jsonb)`;
    if (r.items.length && r.items.every((it) => it.source === "wikipedia") && step.connector === "web_search")
      await logEvent(id, "collect", `Web search engines returned nothing for "${step.query}", so these results come from Wikipedia search and may only mention the topic`, "warn");
    await logEvent(id, "collect", r.items.length ? `✓ ${c.label} returned ${r.items.length} items in ${(ms / 1000).toFixed(1)}s` : `${c.label} found nothing for "${step.query}"`, r.items.length ? "success" : "warn");
    return r.items;
  } catch (e) {
    console.error(`${step.connector} failed for "${step.query}"`, e);
    for (const w of (e as { warnings?: string[] }).warnings ?? []) await logEvent(id, "collect", w, "warn");
    const msg = friendlyReason(e);
    await sql`INSERT INTO sources (workflow_id, connector, query, status, duration_ms, error)
              VALUES (${id}, ${step.connector}, ${step.query}, 'failed', ${Date.now() - t0}, ${msg})`;
    await logEvent(id, "collect", `✗ ${c.label} failed: ${msg}`, "error");
    return [];
  }
}

const SEARCH_SOURCES = new Set<string>(["web_search", "wikipedia"]);

/**
 * Source names a refresh may prune: those from connectors whose every step returned items this run. A step that
 * failed or found nothing says nothing about whether its old rows are gone.
 */
function prunableSources(collected: { connector: ConnectorId; items: RawItem[] }[]) {
  const down = new Set<string>(collected.filter((c) => !c.items.length).map((c) => c.connector));
  // fallbacks store rows under another name, so a down connector may own those rows too
  if (down.has("web_search")) down.add("wikipedia");
  if (down.has("coingecko")) down.add("coinpaprika");
  const ok = new Set<string>();
  for (const c of collected)
    if (!down.has(c.connector))
      for (const it of c.items) {
        const name = sourceName(it);
        // search results shift from run to run: a page missing from this search isn't gone, so its rows (and their
        // AI-column answers) stay. API lists (jobs, coins, repos) are complete, so a missing row really was removed.
        if (!down.has(name) && !SEARCH_SOURCES.has(name)) ok.add(name);
      }
  return { ok: [...ok], down: [...down] };
}

/** Text for a failed run: our own wording as-is, anything else reduced to a plain reason (raw error to the log). */
function runFailure(id: string, e: unknown) {
  if (e instanceof UserFacingError) return e.message;
  console.error(`workflow ${id} failed`, e);
  return `This run failed (${friendlyReason(e)}). Try again.`;
}

/** Extraction notes end with "(<raw provider error>), ..."; swap that for a plain reason before it reaches the log. */
function tidyNote(note: string) {
  return note.replace(/\(([\s\S]+)\)(?=,|$)/, (_, raw: string) => {
    console.error("extraction:", raw);
    return `(${friendlyReason(raw)})`;
  });
}

/** One line per drop reason, e.g. `3 had no title · 5 failed "located in Uttar Pradesh"`. */
function describeDrops(r: DropReasons, idField: string) {
  return [
    r.no_name && `${r.no_name} had no ${idField.replace(/_/g, " ")}`,
    r.irrelevant && `${r.irrelevant} didn't match the request`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Stage 1: understand + plan. With `review`, stop so the user can edit the plan before running it. */
export async function runWorkflow(id: string, prompt: string, opts: { review?: boolean } = {}) {
  const startedAt = Date.now();
  let plan: WorkflowPlan;
  try {
    await setStatus(id, "planning", 5);
    const provider = llmProvider();
    await logEvent(id, "understand", provider ? `Analyzing request with ${provider} planning agent…` : "No LLM key configured, so the rule-based planner is used");
    plan = await planWorkflow(prompt);
    await assertNotCancelled(id);
    await logEvent(id, "plan", `Planned "${plan.title}": ${plan.fields.length} fields, ${plan.sources.length} source steps (${plan.planner} planner)`, "success");
    await logEvent(id, "plan", `Schema: ${plan.fields.map((f) => f.name).join(", ")}`);
    if (opts.review) {
      await setStatus(id, "review", 15, { plan, title: plan.title });
      await logEvent(id, "plan", "Plan ready for review: edit columns, sources and filters, then run it");
      return;
    }
    await setStatus(id, "collecting", 15, { plan, title: plan.title });
  } catch (e) {
    await (async () => {
      if (e instanceof CancelledError) return void (e.superseded || (await logEvent(id, "cancel", "Stopped by you before collection started", "warn")));
      if (e instanceof RejectedRequestError) {
        await setStatus(id, "failed", 100, { error: e.message, title: "Request not supported" });
        return void (await logEvent(id, "plan", `Refused: ${e.message}`, "warn"));
      }
      const msg = runFailure(id, e);
      await setStatus(id, "failed", 100, { error: msg });
      await logEvent(id, "error", msg, "error");
    })().catch(unrecorded(id));
    return;
  }
  await executePlan(id, plan, { startedAt });
}

// Recording a failure needs the DB too. If that also fails, log it (not an unhandled rejection inside after());
// failStuckWorkflows marks the run failed a few minutes later.
const unrecorded = (id: string) => (err: unknown) => console.error(`workflow ${id}: couldn't record how the run ended`, err);

/** A refresh keeps the previous run's sources until it succeeds; afterwards only one run's sources remain. */
async function keepSources(id: string, since: string, which: "new" | "old") {
  if (which === "new") await sql`DELETE FROM sources WHERE workflow_id = ${id} AND created_at < ${since}`;
  else await sql`DELETE FROM sources WHERE workflow_id = ${id} AND created_at >= ${since}`;
}

/** Stage 2: collect → extract → validate/dedupe → store. Also used to refresh a dataset with its saved plan. */
// Runs live in an after() with maxDuration 300s: stop asking the AI at ~230s (counted from when the request started)
// and finish with keyword matching, so the run completes instead of being killed mid-way.
const RUN_BUDGET_MS = 230_000;
// the top-up search + its extraction need this much of the budget left, or they would push the run past 300s
const TOP_UP_MIN_MS = 60_000;

export async function executePlan(id: string, plan: WorkflowPlan, opts: { refresh?: boolean; startedAt?: number } = {}) {
  const deadline = (opts.startedAt ?? Date.now()) + RUN_BUDGET_MS;
  const stats: Workflow["stats"] = {};
  let startedAt = "";
  // AI columns are filled on demand, not extracted from sources; keep their stored values untouched.
  const work: WorkflowPlan = { ...plan, fields: plan.fields.filter((f) => !f.ai) };
  try {
    const [prev] = await sql`SELECT stats, now() AS started FROM workflows WHERE id = ${id}`;
    const prevStats = (prev?.stats ?? {}) as Workflow["stats"];
    const prevRuns = prevStats.runs ?? 0;
    const runs = (opts.refresh ? Math.max(prevRuns, 1) : prevRuns) + 1; // datasets from before run counting still refresh as #2
    // DB clock, so it compares cleanly with records.fetched_at (default now()) for NEW badges
    startedAt = new Date(prev.started).toISOString();
    Object.assign(stats, { runs, run_started_at: startedAt });
    if (opts.refresh) await logEvent(id, "refresh", `Refresh #${runs - 1}: re-collecting with the saved plan (no planning call needed)`);
    await setStatus(id, "collecting", 15, { stats });

    // Collect (all sources in parallel)
    const results = await Promise.all(work.sources.map((step) => collectStep(id, step)));
    const collected = work.sources.map((s, i) => ({ connector: s.connector, items: results[i] }));
    stats.sources_ok = results.filter((r) => r.length).length;
    stats.sources_failed = work.sources.length - stats.sources_ok;

    // interleave sources so a cap doesn't starve any one of them; drop exact-URL repeats
    const seen = new Set<string>();
    const raw: RawItem[] = [];
    const MAX_RAW = maxRaw();
    for (let i = 0; raw.length < MAX_RAW && results.some((r) => r[i]); i++)
      for (const r of results)
        if (r[i] && !seen.has(r[i].url) && raw.length < MAX_RAW) {
          seen.add(r[i].url);
          raw.push(r[i]);
        }
    stats.raw = raw.length;
    await assertNotCancelled(id, stats.run_started_at);
    if (!raw.length) {
      const [{ has }] = opts.refresh ? await sql`SELECT EXISTS (SELECT 1 FROM records WHERE workflow_id = ${id}) AS has` : [{ has: false }];
      if (!has) throw new UserFacingError("No data could be collected from any source. Try rephrasing the request.");
      // a refresh that reached nothing says nothing about the dataset: keep it, its stats and its sources as they were
      await keepSources(id, startedAt, "old");
      await logEvent(id, "refresh", "Every source failed or found nothing this time, so the previous data was kept", "warn");
      await setStatus(id, "completed", 100, { stats: { ...prevStats, runs, run_started_at: startedAt } });
      return;
    }
    await logEvent(id, "collect", `Collected ${raw.length} raw items from ${stats.sources_ok} sources`, "success");

    // Extract, streaming validated rows into the table after every batch
    await setStatus(id, "processing", 45, { stats });
    await logEvent(id, "extract", `Extracting structured "${work.entity}" rows…`);
    let sync = Promise.resolve(); // batches finish concurrently; apply their snapshots in order
    let lastLive = 0;
    const { rows, mode, keywordItems } = await extractAll(work, raw, async (done, total, note, rowsSoFar) => {
      await assertNotCancelled(id, stats.run_started_at); // throwing here stops the remaining batches
      if (note) await logEvent(id, "extract", tidyNote(note), "warn");
      await sql`UPDATE workflows SET progress = ${45 + Math.round((done / total) * 40)}, updated_at = now()
        WHERE id = ${id} AND stats->>'run_started_at' = ${startedAt}`; // never a newer run's progress bar
      if (!rowsSoFar || done === total) return; // the final sync happens after validation below
      const snapshot = validateAndDedupe(work, [...rowsSoFar]).clean;
      sync = sync
        .then(async () => {
          await syncRecords(id, snapshot);
          if (snapshot.length > lastLive) {
            await logEvent(id, "stream", `${snapshot.length} validated rows live (batch ${done}/${total})`);
            lastLive = snapshot.length;
          }
        })
        .catch((e) => console.error("live sync failed", e));
      await sync;
    }, deadline);
    let llmOnly = mode === "llm";
    let keywordPages = keywordItems;
    stats.extracted = rows.length;
    await logEvent(id, "extract", `Extracted ${rows.length} candidate rows (${mode} extraction)`, "success");

    // Validate + dedupe
    let { clean, invalid, duplicates, reasons, relaxed } = validateAndDedupe(work, rows);

    // Thin result: one extra web search phrased from the dataset title, then validate everything again
    const want = Math.min(20, work.max_results);
    const topUpQuery = work.title.slice(0, 120);
    if (
      clean.length < want &&
      deadline - Date.now() > TOP_UP_MIN_MS &&
      !work.sources.some((s) => s.connector === "web_search" && s.query.toLowerCase() === topUpQuery.toLowerCase())
    ) {
      await assertNotCancelled(id, stats.run_started_at);
      await logEvent(id, "collect", `Only ${clean.length} row${clean.length === 1 ? "" : "s"} so far, so running one extra web search`);
      const topUp = await collectStep(id, { connector: "web_search", query: topUpQuery, limit: 10 }, 45_000);
      collected.push({ connector: "web_search", items: topUp });
      // the extra search is a source step too, so it belongs in the sources ok / failed counts
      if (topUp.length) stats.sources_ok = (stats.sources_ok ?? 0) + 1;
      else stats.sources_failed = (stats.sources_failed ?? 0) + 1;
      const fresh = topUp.filter((it) => !seen.has(it.url));
      if (fresh.length) {
        fresh.forEach((it) => seen.add(it.url));
        stats.raw = (stats.raw ?? 0) + fresh.length;
        const more = await extractAll(work, fresh, async (_d, _t, note) => {
          await assertNotCancelled(id, stats.run_started_at);
          if (note) await logEvent(id, "extract", tidyNote(note), "warn");
        }, deadline);
        llmOnly &&= more.mode === "llm";
        keywordPages += more.keywordItems;
        rows.push(...more.rows);
        ({ clean, invalid, duplicates, reasons, relaxed } = validateAndDedupe(work, rows));
        await logEvent(id, "extract", `Extra search added ${more.rows.length} candidate rows`, "success");
      }
    }
    stats.extracted = rows.length;
    // saved for the UI's "AI was unavailable for N pages" notice; the log line alone was easy to miss
    stats.keyword_pages = keywordPages;
    stats.extraction = keywordPages === 0 ? "llm" : keywordPages >= (stats.raw ?? 0) ? "heuristic" : "mixed";
    Object.assign(stats, { invalid, duplicates, valid: clean.length, dropped: reasons });
    const drops = describeDrops(reasons, identityField(work));
    const flagged = Object.entries(reasons.failed_filters).map(([f, n]) => `${n} marked ✗ for "${f}"`).join(" · ");
    if (relaxed) await logEvent(id, "validate", `Kept rows that miss a filter, ranked lower and marked ✗: ${flagged}`, "warn");
    await logEvent(id, "validate", `Validation: kept ${clean.length}, dropped ${invalid}${drops ? ` (${drops})` : ""}, merged ${duplicates} duplicates`);

    // Store the final snapshot; live batches already inserted most rows
    await sync;
    await assertNotCancelled(id, stats.run_started_at);
    // A bad run (nothing kept, AI fell back to keywords, a source down) must not delete rows it couldn't re-check
    const { ok, down } = prunableSources(collected);
    const skipPrune = !clean.length ? "no rows passed validation" : !llmOnly ? "AI extraction was unavailable for some pages" : null;
    const removed = await syncRecords(id, clean, { since: startedAt, sources: skipPrune ? [] : ok });
    if (runs > 1 && skipPrune) await logEvent(id, "refresh", `Kept previous data: ${skipPrune}, so older rows were not removed`, "warn");
    else if (runs > 1 && down.length) await logEvent(id, "refresh", `Kept previous data from ${down.join(", ")} (failed or found nothing this time)`, "warn");
    stats.stored = clean.length;
    if (runs > 1) {
      // counted, not derived from clean.length: rows a skipped prune kept are "still there" too
      const [{ added, kept }] = await sql`SELECT count(*) FILTER (WHERE fetched_at >= ${startedAt})::int AS added,
          count(*) FILTER (WHERE fetched_at < ${startedAt})::int AS kept FROM records WHERE workflow_id = ${id}`;
      Object.assign(stats, { added, removed });
      await logEvent(id, "refresh", `What changed: +${added} new, ${removed} no longer listed, ${kept} still there`, "success");
    }
    if (!clean.length)
      await logEvent(id, "validate", `No records matched the request${drops ? `: ${drops}` : ""}. Try loosening a filter in the plan, or say what kind of entity, where, and which details you need.`, "warn");
    if (opts.refresh) await keepSources(id, startedAt, "new");
    await setStatus(id, "completed", 100, { stats });
    await logEvent(id, "store", `Dataset ready: ${clean.length} clean, source-backed records`, "success");
  } catch (e) {
    await (async () => {
      if (e instanceof CancelledError) {
        if (e.superseded) return;
        const [{ c }] = await sql`SELECT count(*)::int AS c FROM records WHERE workflow_id = ${id}`;
        return void (await logEvent(id, "cancel", `Stopped by you. ${c} rows collected so far were kept.`, "warn"));
      }
      if (opts.refresh && startedAt) await keepSources(id, startedAt, "old");
      const msg = runFailure(id, e);
      await setStatus(id, "failed", 100, { stats, error: msg });
      await logEvent(id, "error", msg, "error");
    })().catch(unrecorded(id));
  }
}
