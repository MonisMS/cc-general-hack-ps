import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/server";

// Next 16 route protection. App pages need a session; the landing page and sign-in pages are public.
// It runs on every page (not just protected ones) because an OAuth sign-in returns with a one-time
// `neon_auth_session_verifier` code that must be exchanged for the session cookie wherever it lands.
// API routes check the session themselves (they must answer 401 JSON, not redirect).
const PROTECTED = ["/new", "/workflows"];
const OAUTH_VERIFIER = "neon_auth_session_verifier";

export default function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));
  if (!isProtected && !req.nextUrl.searchParams.has(OAUTH_VERIFIER)) return NextResponse.next();
  return getAuth().middleware({ loginUrl: "/auth/sign-in" })(req);
}

export const config = {
  // every page; skip API routes, Next internals and static files
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
