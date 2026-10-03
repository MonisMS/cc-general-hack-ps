import { NextResponse } from "next/server";
import { sql } from "../db";
import { currentUser, type AppUser } from "./server";

// Ownership rules: a workflow belongs to the user who created it. Workflows with no owner (created before
// sign-in existed, or by the eval script) are shared read-only examples.

export const unauthorized = () => NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function requireUser(): Promise<AppUser | NextResponse> {
  return (await currentUser()) ?? unauthorized();
}

/**
 * Resolve the user and check access to workflow `id`. "read" allows own + shared examples; "write" only own.
 * Returns a NextResponse to send back when access is denied.
 */
export async function authorize(id: string, mode: "read" | "write"): Promise<{ user: AppUser } | NextResponse> {
  const user = await currentUser();
  if (!user) return unauthorized();
  const [w] = await sql`SELECT owner_id FROM workflows WHERE id = ${id}`;
  if (!w) return notFound();
  if (w.owner_id === user.id) return { user };
  if (w.owner_id == null && mode === "read") return { user };
  // don't reveal that someone else's workflow exists
  return w.owner_id == null ? NextResponse.json({ error: "Examples are read-only. Rerun it to get your own copy." }, { status: 403 }) : notFound();
}
