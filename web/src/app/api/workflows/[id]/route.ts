import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [workflow] = await sql`SELECT * FROM workflows WHERE id = ${id}`;
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [events, sources, [{ count }]] = await Promise.all([
    sql`SELECT id, step, level, message, created_at FROM workflow_events WHERE workflow_id = ${id} ORDER BY id`,
    sql`SELECT id, connector, query, url, status, items, duration_ms, error FROM sources WHERE workflow_id = ${id} ORDER BY id`,
    sql`SELECT count(*)::int AS count FROM records WHERE workflow_id = ${id}`,
  ]);
  return NextResponse.json({ workflow: { ...workflow, record_count: count }, events, sources, record_count: count });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM workflows WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
