import { NextResponse } from "next/server";
import { deleteIdleWorkflow, failStuckWorkflows, logEvent, sql } from "@/lib/db";
import { authorize } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorize(id, "read");
  if (access instanceof Response) return access;
  await failStuckWorkflows();
  const [workflow] = await sql`SELECT * FROM workflows WHERE id = ${id}`;
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [events, sources, [{ count }]] = await Promise.all([
    // polled every few seconds and the log grows with every refresh: the latest 300 events are plenty
    sql`SELECT * FROM (SELECT id, step, level, message, created_at FROM workflow_events WHERE workflow_id = ${id} ORDER BY id DESC LIMIT 300) e ORDER BY id`,
    sql`SELECT id, connector, query, url, status, items, duration_ms, error, pages FROM sources WHERE workflow_id = ${id} ORDER BY id`,
    sql`SELECT count(*)::int AS count FROM records WHERE workflow_id = ${id}`,
  ]);
  const can_edit = workflow.owner_id === access.user.id; // shared examples (no owner) are read-only
  return NextResponse.json({ workflow: { ...workflow, record_count: count }, events, sources, record_count: count, can_edit });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorize(id, "write");
  if (access instanceof Response) return access;
  if (!(await deleteIdleWorkflow(id)))
    return NextResponse.json({ error: "This workflow is still running. Stop it first, then delete it." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

/** Watch a dataset: refresh it every N hours (0 turns watching off). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorize(id, "write");
  if (access instanceof Response) return access;
  const { watch_hours, pinned } = (await req.json().catch(() => null)) ?? {};
  if (typeof pinned === "boolean") {
    // leaves updated_at alone: failStuckWorkflows reads it
    const [p] = await sql`UPDATE workflows SET pinned_at = ${pinned ? new Date() : null} WHERE id = ${id} RETURNING pinned_at`;
    if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, pinned_at: p.pinned_at });
  }
  const asked = Number(watch_hours);
  if (!Number.isInteger(asked) || asked < 0 || asked > 24 * 30) return NextResponse.json({ error: "watch_hours must be 0–720" }, { status: 400 });
  // the refresh cron runs daily, so a watch is whole days: 6h or 25h would never refresh on time
  const days = Math.ceil(asked / 24);
  const hours = days * 24;
  const [w] = hours
    ? await sql`UPDATE workflows SET plan = jsonb_set(plan, '{watch}', ${JSON.stringify({ every_hours: hours })}::jsonb) WHERE id = ${id} AND plan IS NOT NULL RETURNING id`
    : await sql`UPDATE workflows SET plan = plan - 'watch' WHERE id = ${id} AND plan IS NOT NULL RETURNING id`;
  // authorize() already found the workflow, so no row here means it has no plan yet (still planning)
  if (!w) return NextResponse.json({ error: "Wait for the plan to be ready before watching this workflow." }, { status: 409 });
  await logEvent(id, "watch", hours ? `Watching: auto-refresh every ${days === 1 ? "day" : `${days} days`}` : "Stopped watching");
  return NextResponse.json({ ok: true, every_hours: hours });
}
