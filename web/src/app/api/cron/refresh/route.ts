import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { claimRun, sql } from "@/lib/db";
import { executePlan } from "@/lib/pipeline/run";
import type { WorkflowPlan } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// hashed first so both sides have the same length: timingSafeEqual throws otherwise, and length would leak
const sameSecret = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/** Called by Vercel Cron (see vercel.json): refresh watched datasets whose interval has elapsed. */
export async function GET(req: Request) {
  // fail closed: without a secret anyone could trigger refreshes and spend LLM/Firecrawl quota
  const secret = process.env.CRON_SECRET;
  if (!secret || !sameSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The cron runs once a day (Vercel Hobby allows no more), so watch intervals are whole days. The hour of slack
  // keeps a dataset that finished a little after yesterday's run from waiting until the day after.
  // A dataset the user stopped (cancelled) is never restarted by the schedule.
  const due = await sql`SELECT id, plan FROM workflows
    WHERE status IN ('completed', 'failed') AND plan ? 'watch'
      AND COALESCE(finished_at, updated_at) < now() - make_interval(hours => (plan->'watch'->>'every_hours')::int) + interval '1 hour'
    ORDER BY finished_at LIMIT 3`;
  // claimRun, like a manual Refresh: of a cron tick and a click landing together, only one starts a run
  const claimed: typeof due = [];
  for (const w of due) if (await claimRun(w.id, ["completed", "failed"], "queued", 10)) claimed.push(w);
  after(() => Promise.all(claimed.map((w) => executePlan(w.id, w.plan as WorkflowPlan, { refresh: true }))));
  return NextResponse.json({ refreshed: claimed.map((w) => w.id) });
}
