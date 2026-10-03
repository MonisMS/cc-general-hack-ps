import { createNeonAuth } from "@neondatabase/auth/next/server";

// Managed Better Auth (Neon Auth). Created lazily, like the DB client, so `next build` works without the env vars.
let instance: ReturnType<typeof createNeonAuth> | undefined;

export function getAuth() {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET)
    throw new Error("NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET must be set");
  instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET, sameSite: "lax" },
  });
  return instance;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/** The signed-in user, or null. */
export async function currentUser(): Promise<AppUser | null> {
  const { data } = await getAuth().getSession();
  const u = data?.user;
  return u ? { id: u.id, name: u.name || u.email, email: u.email, image: u.image } : null;
}
