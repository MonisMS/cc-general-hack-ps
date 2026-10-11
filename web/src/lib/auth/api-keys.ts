import { createHash, randomBytes } from "node:crypto";
import { sql } from "../db";

// Personal API keys for the MCP server. A key is "dp_" + 32 random base64url chars, shown once at creation; only
// its SHA-256 is stored (high-entropy keys don't need a slow hash). Revoked keys stay listed until deleted.

const PREFIX = "dp_";
const MAX_ACTIVE = 10;
const KEY_SHAPE = /^dp_[A-Za-z0-9_-]{32}$/;

export interface ApiKey {
  id: number;
  name: string;
  prefix: string; // first characters, to tell keys apart in the list
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export async function listKeys(userId: string): Promise<ApiKey[]> {
  return (await sql`SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM api_keys
    WHERE user_id = ${userId} ORDER BY revoked_at IS NOT NULL, created_at DESC LIMIT 50`) as ApiKey[];
}

/** A new key for the user, or an error message when they already have the maximum number of active keys. */
export async function createKey(userId: string, name: string): Promise<{ key: string; record: ApiKey } | { error: string }> {
  const key = PREFIX + randomBytes(24).toString("base64url");
  // the count and the insert are one statement, so two quick clicks can't both pass the cap
  const [record] = (await sql`INSERT INTO api_keys (user_id, name, prefix, key_hash)
    SELECT ${userId}, ${name}, ${key.slice(0, 10)}, ${hash(key)}
    WHERE (SELECT count(*) FROM api_keys WHERE user_id = ${userId} AND revoked_at IS NULL) < ${MAX_ACTIVE}
    RETURNING id, name, prefix, created_at, last_used_at, revoked_at`) as ApiKey[];
  return record ? { key, record } : { error: `You can have up to ${MAX_ACTIVE} active keys. Revoke one first.` };
}

export async function revokeKey(userId: string, id: number): Promise<boolean> {
  const rows = await sql`UPDATE api_keys SET revoked_at = now() WHERE id = ${id} AND user_id = ${userId} AND revoked_at IS NULL RETURNING id`;
  return rows.length > 0;
}

/** The owner of an active key, or null. Records use at most once a minute so a busy client doesn't write every call. */
export async function userForKey(key: string | null | undefined): Promise<{ id: string } | null> {
  if (!key || !KEY_SHAPE.test(key)) return null;
  const [row] = await sql`UPDATE api_keys SET last_used_at = CASE
      WHEN last_used_at IS NULL OR last_used_at < now() - interval '1 minute' THEN now() ELSE last_used_at END
    WHERE key_hash = ${hash(key)} AND revoked_at IS NULL RETURNING user_id`;
  return row ? { id: row.user_id as string } : null;
}
