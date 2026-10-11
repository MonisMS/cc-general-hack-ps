import { NextResponse } from "next/server";
import { overUsageLimit } from "@/lib/db";
import { answer, askRows } from "@/lib/ask";
import { authorize } from "@/lib/auth/access";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // room for every configured LLM provider to try once (25s each)

/** Answer a question about one workflow's dataset, citing the record ids it used. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorize(id, "read");
  if (access instanceof Response) return access;
  const { question } = ((await req.json().catch(() => null)) ?? {}) as { question?: unknown };
  if (typeof question !== "string" || question.trim().length < 3)
    return NextResponse.json({ error: "Ask a question about this dataset." }, { status: 400 });

  const ctx = await askRows(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ctx.records.length) return NextResponse.json({ error: "This dataset has no records yet." }, { status: 400 });
  const limited = await overUsageLimit(access.user.id, "ai");
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  const res = await answer(ctx, question);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ answer: res.answer, record_ids: res.record_ids, rows_considered: res.rows_considered });
}
