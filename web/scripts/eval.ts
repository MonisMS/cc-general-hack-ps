/**
 * DataPilot evaluation harness.
 *
 *   pnpm eval            run every prompt in eval/prompts.json through the real pipeline (uses LLM quota)
 *   pnpm eval --no-ai    same, with LLM keys ignored (rule-based planner + extractor), costs nothing
 *   pnpm eval --lite     ~4 LLM calls per prompt instead of ~16: 15 items per extraction call, 45 raw items max
 *   pnpm eval --only jobs,crypto
 *   pnpm eval:score eval/out/<run>/labels.csv    precision from a hand-labelled sheet
 *
 * Automatic metrics per prompt: rows, quote-verified rate, field fill rate, rows passing all conditions,
 * failed sources, duration. Precision needs a human: label.csv gets one line per row with an empty
 * `correct` column (y/n). Workflows are kept (id prefix "eval") so they can be inspected in the UI.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { sql } from "../src/lib/db";
import { runWorkflow } from "../src/lib/pipeline/run";
import { CHECKS_KEY, QUOTE_KEY, QUOTE_OK_KEY, WHY_KEY, type Workflow, type WorkflowPlan } from "../src/lib/types";

const args = process.argv.slice(2);
const csvCell = (v: unknown) => {
  const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

async function score(file: string) {
  const lines = readFileSync(file, "utf8").trim().split("\n").slice(1);
  const by = new Map<string, { y: number; n: number; blank: number }>();
  for (const line of lines) {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, ""));
    const [prompt, correct] = [cells[0], (cells[1] ?? "").trim().toLowerCase()];
    const s = by.get(prompt) ?? { y: 0, n: 0, blank: 0 };
    if (correct.startsWith("y")) s.y++;
    else if (correct.startsWith("n")) s.n++;
    else s.blank++;
    by.set(prompt, s);
  }
  let Y = 0, N = 0;
  console.log("prompt".padEnd(12), "precision".padStart(10), "labelled".padStart(9), "unlabelled".padStart(11));
  for (const [p, s] of by) {
    Y += s.y;
    N += s.n;
    console.log(p.padEnd(12), (s.y + s.n ? `${pct(s.y, s.y + s.n)}%` : "—").padStart(10), String(s.y + s.n).padStart(9), String(s.blank).padStart(11));
  }
  console.log("overall".padEnd(12), `${pct(Y, Y + N)}%`.padStart(10), String(Y + N).padStart(9));
}

async function run() {
  if (args.includes("--lite")) {
    process.env.EXTRACT_BATCH = "15";
    process.env.MAX_RAW_ITEMS = "45";
  }
  if (args.includes("--no-ai")) for (const k of ["GEMINI_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) delete process.env[k];
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
  const prompts = (JSON.parse(readFileSync(join(__dirname, "../eval/prompts.json"), "utf8")) as { id: string; prompt: string }[]).filter(
    (p) => !only || only.includes(p.id),
  );
  const out = join(__dirname, "../eval/out", new Date().toISOString().replace(/[:.]/g, "-") + (args.includes("--no-ai") ? "-noai" : "") + (args.includes("--lite") ? "-lite" : ""));
  mkdirSync(out, { recursive: true });

  const summary = [];
  const labels = ["prompt,correct,why_wrong,row,source_url,quote_verified,why_matched"];
  for (const p of prompts) {
    const id = `eval${nanoid(6)}`;
    await sql`INSERT INTO workflows (id, prompt, status) VALUES (${id}, ${p.prompt}, 'queued')`;
    const t0 = Date.now();
    await runWorkflow(id, p.prompt); // sequential on purpose: keeps LLM rate limits happy
    const secs = Math.round((Date.now() - t0) / 1000);
    const [w] = (await sql`SELECT status, plan, stats, error FROM workflows WHERE id = ${id}`) as unknown as (Workflow & { plan: WorkflowPlan })[];
    const rows = await sql`SELECT data, source_name, source_url FROM records WHERE workflow_id = ${id} ORDER BY confidence DESC`;
    const fields = w.plan?.fields.map((f) => f.name) ?? [];
    const filled = rows.reduce((n, r) => n + fields.filter((f) => r.data[f] != null && r.data[f] !== "").length, 0);
    const withQuote = rows.filter((r) => r.data[QUOTE_KEY]).length;
    const verified = rows.filter((r) => r.data[QUOTE_OK_KEY] === true).length;
    const checked = rows.filter((r) => Array.isArray(r.data[CHECKS_KEY]));
    const allMet = checked.filter((r) => (r.data[CHECKS_KEY] as (boolean | null)[]).every((c) => c === true)).length;
    const m = {
      id: p.id,
      workflow: id,
      status: w.status,
      planner: w.plan?.planner ?? "-",
      rows: rows.length,
      quote_verified_pct: pct(verified, withQuote),
      fill_pct: pct(filled, rows.length * fields.length),
      all_conditions_met_pct: checked.length ? pct(allMet, checked.length) : null,
      sources_failed: w.stats?.sources_failed ?? 0,
      secs,
      error: w.error ?? undefined,
    };
    summary.push(m);
    console.log(JSON.stringify(m));
    for (const r of rows) {
      const short = fields.slice(0, 4).map((f) => `${f}=${csvCell(r.data[f]).slice(0, 60)}`).join(" | ");
      labels.push([p.id, "", "", short, r.source_url, r.data[QUOTE_OK_KEY] ?? "", r.data[WHY_KEY] ?? ""].map(csvCell).join(","));
    }
  }
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(out, "labels.csv"), labels.join("\n"));
  console.log(`\nWrote ${join(out, "summary.json")} and labels.csv: fill the "correct" column with y/n, then run pnpm eval:score ${join(out, "labels.csv")}`);
}

(args[0] === "score" ? score(args[1]) : run()).then(() => process.exit(0));
