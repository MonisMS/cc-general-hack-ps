import { after } from "next/server";
import { nanoid } from "nanoid";
import { sql } from "./db";
import { runWorkflow } from "./pipeline/run";

/** Insert a workflow row and run the pipeline in the background after the response is sent. */
export async function createWorkflow(prompt: string) {
  const id = nanoid(10);
  await sql`INSERT INTO workflows (id, prompt, status) VALUES (${id}, ${prompt}, 'queued')`;
  await sql`INSERT INTO workflow_events (workflow_id, step, message) VALUES (${id}, 'queued', 'Workflow created')`;
  after(() => runWorkflow(id, prompt));
  return id;
}
