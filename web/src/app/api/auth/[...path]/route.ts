import { getAuth } from "@/lib/auth/server";

// Proxies sign-in, sign-up, OAuth callbacks and session calls to Neon Auth.
type Handler = ReturnType<ReturnType<typeof getAuth>["handler"]>;
export const GET: Handler["GET"] = (...args) => getAuth().handler().GET(...args);
export const POST: Handler["POST"] = (...args) => getAuth().handler().POST(...args);
