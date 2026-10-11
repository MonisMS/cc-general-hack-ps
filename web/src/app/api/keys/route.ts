import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/access";
import { createKey, listKeys } from "@/lib/auth/api-keys";

export const dynamic = "force-dynamic";

/** The signed-in user's API keys (never the key itself, only its prefix). */
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return NextResponse.json({ keys: await listKeys(user.id) });
}

/** Create a key. The full key is in this response only; it can't be shown again. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { name } = ((await req.json().catch(() => null)) ?? {}) as { name?: unknown };
  const label = typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : "MCP key";
  const res = await createKey(user.id, label);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 409 });
  return NextResponse.json(res);
}
