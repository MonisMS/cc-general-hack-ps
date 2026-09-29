import { sql } from "@/lib/db";
import type { WorkflowPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "csv";
  const [w] = await sql`SELECT title, prompt, plan FROM workflows WHERE id = ${id}`;
  if (!w) return new Response("Not found", { status: 404 });
  const records = await sql`SELECT data, source_name, source_url, confidence, fetched_at
    FROM records WHERE workflow_id = ${id} ORDER BY confidence DESC, id`;
  const slug = String(w.title || "dataset").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
  const plan = w.plan as WorkflowPlan | null;
  const cols = plan?.fields.map((f) => f.name) ?? [...new Set(records.flatMap((r) => Object.keys(r.data)))];

  if (format === "json") {
    const body = JSON.stringify({ title: w.title, prompt: w.prompt, schema: plan?.fields, count: records.length,
      records: records.map((r) => ({ ...r.data, _source: r.source_name, _source_url: r.source_url, _confidence: r.confidence, _fetched_at: r.fetched_at })) }, null, 2);
    return new Response(body, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${slug}.json"` } });
  }
  const header = [...cols, "source", "source_url", "confidence", "fetched_at"];
  const lines = [header.join(","), ...records.map((r) =>
    [...cols.map((c) => r.data[c]), r.source_name, r.source_url, r.confidence, new Date(r.fetched_at).toISOString()].map(csvCell).join(","))];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="${slug}.csv"` } });
}
