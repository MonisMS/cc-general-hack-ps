import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const records = await sql`SELECT id, data, source_name, source_url, confidence, fetched_at
    FROM records WHERE workflow_id = ${id} ORDER BY confidence DESC, id`;
  return NextResponse.json({ records });
}
