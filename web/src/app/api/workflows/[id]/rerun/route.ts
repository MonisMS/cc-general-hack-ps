import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createWorkflow } from "@/lib/workflows";

export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [w] = await sql`SELECT prompt FROM workflows WHERE id = ${id}`;
  if (!w) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id: await createWorkflow(w.prompt as string) });
}
