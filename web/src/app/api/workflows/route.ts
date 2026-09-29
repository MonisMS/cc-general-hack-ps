import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createWorkflow } from "@/lib/workflows";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  const workflows = await sql`
    SELECT w.*, (SELECT count(*)::int FROM records r WHERE r.workflow_id = w.id) AS record_count
    FROM workflows w ORDER BY w.created_at DESC LIMIT 200`;
  return NextResponse.json({ workflows });
}

export async function POST(req: Request) {
  const { prompt } = await req.json().catch(() => ({}));
  if (typeof prompt !== "string" || prompt.trim().length < 5)
    return NextResponse.json({ error: "Describe the data you need (at least a few words)." }, { status: 400 });
  const id = await createWorkflow(prompt.trim().slice(0, 2000));
  return NextResponse.json({ id });
}
