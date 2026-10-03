import { NextResponse } from "next/server";
import { logEvent, sql } from "@/lib/db";
import { authorize } from "@/lib/auth/access";

/** Stop a running (or awaiting-review) workflow. The pipeline notices at its next checkpoint and stops spending LLM calls. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorize(id, "write");
  if (access instanceof Response) return access;
  const [w] = await sql`UPDATE workflows SET status = 'cancelled', finished_at = now(), updated_at = now(), error = 'Stopped by user'
    WHERE id = ${id} AND status IN ('queued', 'planning', 'review', 'collecting', 'processing') RETURNING id`;
  if (!w) return NextResponse.json({ error: "This workflow isn't running." }, { status: 409 });
  await logEvent(id, "cancel", "Stop requested. Finishing the current step, then stopping.", "warn");
  return NextResponse.json({ ok: true });
}
