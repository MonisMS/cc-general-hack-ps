import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createWorkflow } from "@/lib/workflows";
import { authorize } from "@/lib/auth/access";
import { blockedReason } from "@/lib/pipeline/safety";

export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorize(id, "read");
  if (access instanceof Response) return access;
  const [w] = await sql`SELECT prompt FROM workflows WHERE id = ${id}`;
  if (!w) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const blocked = blockedReason(w.prompt as string);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });
  return NextResponse.json({ id: await createWorkflow(w.prompt as string, { ownerId: access.user.id }) });
}
