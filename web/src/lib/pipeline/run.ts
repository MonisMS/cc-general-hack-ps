import { CONNECTORS } from "../connectors";
import { logEvent, setStatus, sql } from "../db";
import { llmProvider } from "../llm";
import type { RawItem, WorkflowPlan } from "../types";
import { extractAll } from "./extract";
import { planWorkflow } from "./planner";
import { validateAndDedupe } from "./validate";

const MAX_RAW = 90;

/** End-to-end workflow: understand → plan → collect → extract → validate/dedupe → store. */
export async function runWorkflow(id: string, prompt: string) {
  const stats: Record<string, number> = {};
  try {
    // 1. Understand + plan
    await setStatus(id, "planning", 5);
    const provider = llmProvider();
    await logEvent(id, "understand", provider ? `Analyzing request with ${provider} planning agent…` : "No LLM key configured — using rule-based planner");
    const plan: WorkflowPlan = await planWorkflow(prompt);
    await setStatus(id, "collecting", 15, { plan, title: plan.title });
    await logEvent(id, "plan", `Planned "${plan.title}": ${plan.fields.length} fields, ${plan.sources.length} source steps (${plan.planner} planner)`, "success");
    await logEvent(id, "plan", `Schema: ${plan.fields.map((f) => f.name).join(", ")}`);

    // 2. Collect (all sources in parallel)
    const results = await Promise.all(
      plan.sources.map(async (step) => {
        const c = CONNECTORS[step.connector];
        const t0 = Date.now();
        await logEvent(id, "collect", `→ ${c.label}: "${step.query}"`);
        try {
          const r = await c.run(step.query, step.limit ?? 20);
          const ms = Date.now() - t0;
          await sql`INSERT INTO sources (workflow_id, connector, query, url, status, items, duration_ms)
                    VALUES (${id}, ${step.connector}, ${step.query}, ${r.url ?? null}, 'ok', ${r.items.length}, ${ms})`;
          await logEvent(id, "collect", `✓ ${c.label} returned ${r.items.length} items in ${(ms / 1000).toFixed(1)}s`, r.items.length ? "success" : "warn");
          return r.items;
        } catch (e) {
          const msg = (e as Error).message.slice(0, 300);
          await sql`INSERT INTO sources (workflow_id, connector, query, status, duration_ms, error)
                    VALUES (${id}, ${step.connector}, ${step.query}, 'failed', ${Date.now() - t0}, ${msg})`;
          await logEvent(id, "collect", `✗ ${c.label} failed: ${msg}`, "error");
          return [] as RawItem[];
        }
      }),
    );
    stats.sources_ok = results.filter((r) => r.length).length;
    stats.sources_failed = plan.sources.length - stats.sources_ok;

    // interleave sources so a cap doesn't starve any one of them; drop exact-URL repeats
    const seen = new Set<string>();
    const raw: RawItem[] = [];
    for (let i = 0; raw.length < MAX_RAW && results.some((r) => r[i]); i++)
      for (const r of results)
        if (r[i] && !seen.has(r[i].url) && raw.length < MAX_RAW) {
          seen.add(r[i].url);
          raw.push(r[i]);
        }
    stats.raw = raw.length;
    if (!raw.length) throw new Error("No data could be collected from any source. Try rephrasing the request.");
    await logEvent(id, "collect", `Collected ${raw.length} raw items from ${stats.sources_ok} sources`, "success");

    // 3. Extract / structure
    await setStatus(id, "processing", 45, { stats });
    await logEvent(id, "extract", `Extracting structured "${plan.entity}" rows…`);
    const { rows, mode } = await extractAll(plan, raw, async (done, total, note) => {
      if (note) await logEvent(id, "extract", note, "warn");
      await sql`UPDATE workflows SET progress = ${45 + Math.round((done / total) * 40)}, updated_at = now() WHERE id = ${id}`;
    });
    stats.extracted = rows.length;
    await logEvent(id, "extract", `Extracted ${rows.length} candidate rows (${mode} extraction)`, "success");

    // 4. Validate + dedupe
    const { clean, invalid, duplicates } = validateAndDedupe(plan, rows);
    Object.assign(stats, { invalid, duplicates, valid: clean.length });
    await logEvent(id, "validate", `Validation: ${invalid} rows dropped (missing required fields / low relevance), ${duplicates} duplicates merged`);

    // 5. Store
    await sql`DELETE FROM records WHERE workflow_id = ${id}`;
    if (clean.length) {
      await sql`INSERT INTO records (workflow_id, data, source_name, source_url, confidence, dedupe_key)
        SELECT ${id}, x.data, x.source_name, x.source_url, x.confidence, x.dedupe_key
        FROM jsonb_to_recordset(${JSON.stringify(clean)}::jsonb)
          AS x(data jsonb, source_name text, source_url text, confidence real, dedupe_key text)
        ON CONFLICT DO NOTHING`;
    }
    stats.stored = clean.length;
    if (!clean.length)
      await logEvent(id, "validate", "No records matched the request. Try being more specific: say what kind of entity, where, and which details you need (e.g. \"female tennis players ranked by WTA points\").", "warn");
    await setStatus(id, "completed", 100, { stats });
    await logEvent(id, "store", `Dataset ready: ${clean.length} clean, source-backed records`, "success");
  } catch (e) {
    const msg = (e as Error).message;
    await setStatus(id, "failed", 100, { stats, error: msg });
    await logEvent(id, "error", msg, "error");
  }
}
