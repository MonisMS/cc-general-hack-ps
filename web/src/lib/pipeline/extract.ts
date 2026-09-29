import { llmJSON } from "../llm";
import type { RawItem, WorkflowPlan } from "../types";

export interface Extracted {
  data: Record<string, unknown>;
  item: RawItem;
  relevance: number; // 0..1
}

const STRUCTURED_TEXT = 400;
const PAGE_TEXT = 2500;
const BATCH = 6;
const CONCURRENCY = 4;

function describeItem(i: number, it: RawItem) {
  const text = it.text?.slice(0, it.fields ? STRUCTURED_TEXT : PAGE_TEXT) ?? "";
  return `### ITEM ${i}\nsource: ${it.source}\nurl: ${it.url}\ntitle: ${it.title}${
    it.fields ? `\nfields: ${JSON.stringify(it.fields).slice(0, 800)}` : ""
  }\ntext: ${text}`;
}

/** LLM extraction: turn raw items into rows matching the plan schema. */
async function llmBatch(plan: WorkflowPlan, items: RawItem[]): Promise<Extracted[] | null> {
  const schema = plan.fields.map((f) => `- ${f.name} (${f.type}${f.required ? ", required" : ""}): ${f.description}`).join("\n");
  const system = `You are the extraction agent of a data platform. Convert raw source items into structured rows.
Target: each row is one "${plan.entity}". User intent: ${plan.intent}
Schema:
${schema}
Constraints: ${plan.filters.length ? plan.filters.join("; ") : "none"}

Rules:
- Only use facts present in the item; never invent values. Use null when unknown.
- A structured item (with fields) usually yields one row. A web page may contain several ${plan.entity}s (e.g. a list of sponsors) - emit one row per real entity found, max 15 per item.
- Skip items/rows that are irrelevant to the intent or clearly violate constraints.
- "relevance" 0-1 = how well the row matches the intent and constraints.
- For url fields prefer the entity's own URL; otherwise the item url.
- Name/title fields must be specific and unique (e.g. "Girls (TV series)", not just "Girls").
- Drop rows about disambiguation pages, navigation pages, or generic words rather than real entities.
Return {"rows": [{"item": <ITEM number>, "relevance": number, "data": {<schema fields>}}]}`;
  const res = await llmJSON<{ rows: { item: number; relevance: number; data: Record<string, unknown> }[] }>(
    system,
    items.map((it, i) => describeItem(i, it)).join("\n\n"),
    2500,
  );
  if (!res) return null;
  return (res.rows ?? [])
    .filter((r) => r && r.data && items[r.item])
    .map((r) => ({ data: r.data, item: items[r.item], relevance: clamp(r.relevance ?? 0.7) }));
}

const clamp = (n: number) => Math.max(0, Math.min(1, Number(n) || 0));

const SYNONYMS: Record<string, string[]> = {
  name: ["name", "title", "full_name", "company"],
  title: ["title", "name"],
  url: ["url", "apply_url", "homepage", "hn_url"],
  website: ["homepage", "url"],
  description: ["description", "summary"],
  company: ["company", "company_name", "owner"],
};

/** Heuristic mapping when no LLM is available. */
function heuristicMap(plan: WorkflowPlan, it: RawItem, kw: string[]): Extracted {
  const src = { ...(it.fields ?? {}), title: it.fields?.title ?? it.title, url: it.fields?.url ?? it.url };
  const data: Record<string, unknown> = {};
  for (const f of plan.fields) {
    const keys = [f.name, ...(SYNONYMS[f.name] ?? [])];
    let v: unknown = null;
    for (const k of keys) if (src[k as keyof typeof src] != null && src[k as keyof typeof src] !== "") { v = src[k as keyof typeof src]; break; }
    if (v == null && f.name === "description") v = it.text?.slice(0, 280) || null;
    if (v == null && f.type === "url") v = it.url;
    data[f.name] = v;
  }
  const hay = `${it.title} ${it.text} ${JSON.stringify(it.fields ?? {})}`.toLowerCase();
  const hits = kw.filter((k) => hay.includes(k)).length;
  return { data, item: it, relevance: kw.length ? 0.4 + 0.6 * (hits / kw.length) : 0.6 };
}

export async function extractAll(
  plan: WorkflowPlan,
  items: RawItem[],
  onProgress: (done: number, total: number, note?: string) => Promise<void>,
): Promise<{ rows: Extracted[]; mode: "llm" | "heuristic" | "mixed" }> {
  const batches: RawItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));
  const kw = plan.intent.toLowerCase().split(/\W+/).filter((w) => w.length > 3).slice(0, 8);

  const rows: Extracted[] = [];
  let llmAvailable = true;
  let llmBatches = 0;
  let done = 0;
  let idx = 0;
  const worker = async () => {
    while (idx < batches.length) {
      const batch = batches[idx++];
      let out: Extracted[] | null = null;
      if (llmAvailable) {
        try {
          out = await llmBatch(plan, batch);
          if (out === null) llmAvailable = false;
          else llmBatches++;
        } catch (e) {
          const msg = (e as Error).message;
          if (/402|credits/i.test(msg)) llmAvailable = false; // don't keep hammering an empty balance
          await onProgress(done, batches.length, `LLM batch failed (${msg.slice(0, 120)}), using heuristic mapping`);
        }
      }
      rows.push(...(out ?? batch.map((it) => heuristicMap(plan, it, kw))));
      done++;
      await onProgress(done, batches.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  const mode = llmBatches === batches.length ? "llm" : llmBatches === 0 ? "heuristic" : "mixed";
  return { rows, mode };
}
