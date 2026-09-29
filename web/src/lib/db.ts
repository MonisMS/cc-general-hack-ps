import { neon } from "@neondatabase/serverless";
import type { WorkflowEvent, WorkflowStatus } from "./types";

export const sql = neon(process.env.DATABASE_URL!);

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
