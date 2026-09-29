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
  const done = status === "completed" || status === "failed";
  await sql`UPDATE workflows SET
      status = ${status},
      progress = ${progress},
      plan = COALESCE(${extra.plan ? JSON.stringify(extra.plan) : null}::jsonb, plan),
      title = COALESCE(${extra.title ?? null}, title),
      stats = COALESCE(${extra.stats ? JSON.stringify(extra.stats) : null}::jsonb, stats),
      error = ${extra.error ?? null},
      updated_at = now(),
      finished_at = ${done ? new Date().toISOString() : null}
    WHERE id = ${workflowId}`;
}
