import { NextResponse } from "next/server";
import { sql } from "../db";
import { currentUser, type AppUser } from "./server";

// Ownership rules: a workflow belongs to the user who created it. Workflows with no owner (created before
// sign-in existed, or by the eval script) are shared read-only examples.

export const unauthorized = () => NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** The signed-in user, null, or a 503 when Neon Auth can't be reached (instead of a bare 500 on every route). */
async function sessionUser(): Promise<AppUser | null | NextResponse> {
  try {
    return await currentUser();
  } catch (e) {
    console.error("Neon Auth unavailable", e);
    return NextResponse.json({ error: "Sign-in is unavailable right now. Try again in a minute." }, { status: 503 });
  }
}

export async function requireUser(): Promise<AppUser | NextResponse> {
  return (await sessionUser()) ?? unauthorized();
}

/**
 * Resolve the user and check access to workflow `id`. "read" allows own + shared examples; "write" only own.
 * Returns a NextResponse to send back when access is denied.
 */
export async function authorize(id: string, mode: "read" | "write"): Promise<{ user: AppUser } | NextResponse> {
  const user = await sessionUser();
  if (!user) return unauthorized();
  if (user instanceof NextResponse) return user;
  const access = await accessFor(user.id, id, mode);
  if (access === "ok") return { user };
  return access === "read_only" ? NextResponse.json({ error: READ_ONLY }, { status: 403 }) : notFound();
}

export const READ_ONLY = "Examples are read-only. Rerun it to get your own copy.";

/** The same rules for any caller (session or API key). Someone else's workflow is "not_found", so it isn't revealed. */
export async function accessFor(userId: string, id: string, mode: "read" | "write"): Promise<"ok" | "read_only" | "not_found"> {
  const [w] = await sql`SELECT owner_id FROM workflows WHERE id = ${id}`;
  if (!w) return "not_found";
  if (w.owner_id === userId) return "ok";
  if (w.owner_id == null) return mode === "read" ? "ok" : "read_only";
  return "not_found";
}
