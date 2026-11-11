import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/access";
import { listKeys } from "@/lib/auth/api-keys";
import { mcpSubscriptionRequired } from "@/lib/mcp/access";

export const dynamic = "force-dynamic";

/** The signed-in user's API keys (never the key itself, only its prefix). */
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return NextResponse.json({ keys: await listKeys(user.id) });
}

// Existing keys remain listable and revocable, but new MCP keys cannot be issued.
export { mcpSubscriptionRequired as POST };
