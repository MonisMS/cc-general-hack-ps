import { NextResponse } from "next/server";
import { overUsageLimit, refundUsage, sql } from "@/lib/db";
import { llmJSON, llmProviders } from "@/lib/llm";
import { WHY_KEY, type FieldSpec, type DataRecord, type WorkflowPlan } from "@/lib/types";
import { UNTRUSTED_RULE, untrusted } from "@/lib/pipeline/untrusted";
import { rankRows } from "@/lib/pipeline/validate";
import { authorize } from "@/lib/auth/access";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // batches run in parallel; each LLM attempt is capped at 25s so failover fits

const MAX_ROWS = 60;
const MAX_AI_COLUMNS = 6; // each one is a paid LLM pass over the table
const BATCH = 30; // ≤ 2 LLM calls per column
const clip = (v: unknown) => {
  const s = Array.isArray(v) ? v.join(", ") : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 120 ? s.slice(0, 119) + "…" : s;
};

const host = (u: unknown) => {
  try { return new URL(String(u)).hostname; } catch { return ""; }
};

function columnName(question: string, taken: Set<string>) {
  const words = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w && !/^(is|are|does|do|the|a|an|this|it|its|of|for|to|in|on|what|which|how|has|have|they|their)$/.test(w));
  const base = words.slice(0, 4).join("_").slice(0, 40) || "ai_column";
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base}_${i}`;
  return name;
}

/** "Add AI column": answer one question for every row, store it as a new plan field. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorize(id, "write");
  if (access instanceof Response) return access;
  const { question } = (await req.json().catch(() => null)) ?? {};
  if (typeof question !== "string" || question.trim().length < 3)
    return NextResponse.json({ error: "Describe what the new column should contain." }, { status: 400 });
  const q = question.trim().slice(0, 200);

  const [w] = await sql`SELECT prompt, plan, status FROM workflows WHERE id = ${id}`;
  if (!w) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["completed", "failed", "cancelled"].includes(w.status)) return NextResponse.json({ error: "Wait for the workflow to finish first." }, { status: 409 });
  const plan = w.plan as WorkflowPlan | null;
  if (!plan) return NextResponse.json({ error: "This workflow has no plan." }, { status: 400 });

  // fill the rows the table shows first, in the plan's order
  const all = rankRows(
    plan,
    (await sql`SELECT id, data, source_url, confidence FROM records WHERE workflow_id = ${id} ORDER BY confidence DESC, id`) as DataRecord[],
  );
  const records = all.slice(0, MAX_ROWS);
  if (!records.length) return NextResponse.json({ error: "No records to enrich." }, { status: 409 });
  if (plan.fields.filter((f) => f.ai).length >= MAX_AI_COLUMNS)
    return NextResponse.json({ error: `A dataset can have up to ${MAX_AI_COLUMNS} AI columns.` }, { status: 409 });
  // before the usage check, so a server with no AI configured never spends anyone's hourly questions
  if (!llmProviders().length) return NextResponse.json({ error: "No LLM key configured, so AI columns can't be filled." }, { status: 503 });
  const limited = await overUsageLimit(access.user.id, "ai");
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  // Reserve the column before any AI work, in one conditional statement: of two requests landing together (a
  // double click, two tabs), only one gets the name, so they can't both append a column or write into one.
  const name = columnName(q, new Set(plan.fields.map((f) => f.name)));
  const field: FieldSpec = { name, type: "string", description: q, ai: true };
  const [reserved] = await sql`UPDATE workflows SET plan = jsonb_set(plan, '{fields}', (plan->'fields') || ${JSON.stringify([field])}::jsonb)
    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(plan->'fields') f WHERE f->>'name' = ${name} OR (f->>'ai' = 'true' AND f->>'description' = ${q}))
      AND (SELECT count(*) FROM jsonb_array_elements(plan->'fields') f WHERE f->>'ai' = 'true') < ${MAX_AI_COLUMNS}
    RETURNING id`;
  if (!reserved) {
    await refundUsage(access.user.id, "ai");
    return NextResponse.json({ error: "This dataset already has that column, or it is being added right now." }, { status: 409 });
  }
  const cols = plan.fields.map((f) => f.name);
  const system = `You are the enrichment agent of a data platform. For every row, answer this question as a new spreadsheet column:
"${q}"
Dataset purpose: "${w.prompt}". Each row is one ${plan.entity}.
Rules:
- ${UNTRUSTED_RULE}
- Use ONLY the row's own values. Do not use outside or remembered knowledge, even about famous entities. If the row doesn't contain the answer, value is null.
- "value": the cell content, max 12 words. Start yes/no questions with "Yes" or "No". Use null if it can't be determined.
- "basis": max 15 words naming which of the row's values the answer is based on.
Return {"answers": [{"id": number, "value": string|null, "basis": string}]}`;

  const batches: (typeof records)[] = [];
  for (let i = 0; i < records.length; i += BATCH) batches.push(records.slice(i, i + BATCH));
  const answers = new Map<number, { value: string | null; basis: string }>();
  let failed = 0;
  await Promise.all(
    batches.map(async (rows) => {
      const lines = rows.map((r) => `id=${r.id} | ` + [...cols.map((c) => `${c}: ${clip(r.data[c])}`), `why_matched: ${clip(r.data[WHY_KEY])}`, `source: ${host(r.source_url)}`].join(" | "));
      try {
        const res = await llmJSON<{ answers?: { id: number; value: unknown; basis?: unknown }[] }>(system, untrusted(lines.join("\n")), 2000, { timeoutMs: 25_000 });
        if (!res) throw new Error("No LLM key configured");
        for (const a of res.answers ?? [])
          if (rows.some((r) => Number(r.id) === Number(a.id)))
            answers.set(Number(a.id), { value: a.value == null || a.value === "" ? null : String(a.value).slice(0, 160), basis: String(a.basis ?? "").slice(0, 160) });
      } catch (e) {
        failed++;
        console.error("AI column batch failed", e);
      }
    }),
  );
  if (!answers.size) {
    await sql`UPDATE workflows SET plan = jsonb_set(plan, '{fields}',
      (SELECT COALESCE(jsonb_agg(f), '[]'::jsonb) FROM jsonb_array_elements(plan->'fields') f WHERE f->>'name' <> ${name})) WHERE id = ${id}`;
    await refundUsage(access.user.id, "ai");
    return NextResponse.json({ error: "The AI couldn't fill this column right now. Try again in a minute." }, { status: 502 });
  }

  const updates = [...answers].map(([rid, a]) => ({ id: rid, patch: { [name]: a.value, [`_basis_${name}`]: a.basis } }));
  await sql`UPDATE records r SET data = r.data || u.patch
    FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS u(id bigint, patch jsonb)
    WHERE r.id = u.id AND r.workflow_id = ${id}`;
  await sql`UPDATE workflows SET updated_at = now() WHERE id = ${id}`;
  await sql`INSERT INTO workflow_events (workflow_id, step, level, message)
    VALUES (${id}, 'enrich', 'success', ${`AI column "${q}" filled for ${answers.size} of ${records.length}${all.length > records.length ? ` top rows (of ${all.length})` : " rows"}${failed ? ` (${failed} batch${failed > 1 ? "es" : ""} failed)` : ""}`})`;
  return NextResponse.json({ field, filled: answers.size, total: records.length, rows_total: all.length });
}
