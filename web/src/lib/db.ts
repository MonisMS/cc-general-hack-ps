import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { WorkflowEvent, WorkflowStatus } from "./types";

// Connect lazily so `next build` works without DATABASE_URL; it's only needed at request time.
let client: NeonQueryFunction<false, false> | undefined;
export const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  client ??= neon(process.env.DATABASE_URL);
  return client(strings, ...values);
}) as NeonQueryFunction<false, false>;

export async function logEvent(
  workflowId: string,
  step: string,
  message: string,
  level: WorkflowEvent["level"] = "info",
) {
  await sql`INSERT INTO workflow_events (workflow_id, step, level, message)
            VALUES (${workflowId}, ${step}, ${level}, ${message})`;
}

export async function setStatus(
  workflowId: string,
  status: WorkflowStatus,
  progress: number,
  extra: { plan?: unknown; title?: string; stats?: unknown; error?: string } = {},
) {
  const done = status === "completed" || status === "failed" || status === "cancelled";
  await sql`UPDATE workflows SET
      status = ${status},
      progress = ${progress},
      plan = COALESCE(${extra.plan ? JSON.stringify(extra.plan) : null}::jsonb, plan),
      title = COALESCE(${extra.title ?? null}, title),
      stats = COALESCE(${extra.stats ? JSON.stringify(extra.stats) : null}::jsonb, stats),
      error = ${extra.error ?? null},
      updated_at = now(),
      finished_at = ${done ? new Date().toISOString() : null}
    WHERE id = ${workflowId} AND (status <> 'cancelled' OR ${status} = 'queued')`;
}

export class CancelledError extends Error {
  constructor() {
    super("Stopped by user");
  }
}

/**
 * Throw if the user stopped this workflow, or (with `runStartedAt`) if a newer run of it has started since,
 * e.g. Resume pressed while a stopped run was still finishing a step. Checked between stages and batches.
 */
export async function assertNotCancelled(workflowId: string, runStartedAt?: string) {
  const [w] = await sql`SELECT status, stats->>'run_started_at' AS run FROM workflows WHERE id = ${workflowId}`;
  if (!w || w.status === "cancelled" || (runStartedAt && w.run && w.run !== runStartedAt)) throw new CancelledError();
}

const RUNNING = ["queued", "planning", "collecting", "processing"];
/** Runs execute inside a serverless request; if it dies, nothing else would ever finish them. */
export async function failStuckWorkflows(minutes = 8) {
  await sql`UPDATE workflows SET status = 'failed', progress = 100, finished_at = now(), updated_at = now(),
      error = 'This run was interrupted (the server restarted or timed out). Use Rerun or Refresh to try again.'
    WHERE status = ANY(${RUNNING}) AND updated_at < now() - make_interval(mins => ${minutes})`;
}
