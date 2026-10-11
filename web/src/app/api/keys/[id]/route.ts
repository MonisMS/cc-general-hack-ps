import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/access";
import { revokeKey } from "@/lib/auth/api-keys";

export const dynamic = "force-dynamic";

/** Revoke one of the user's keys; clients using it get 401 from then on. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0 || !(await revokeKey(user.id, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
