import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/server";

// Next 16 route protection: app pages need a session; the landing page and sign-in stay public.
// API routes check the session themselves (they must answer 401 JSON, not redirect).
export default function proxy(req: NextRequest) {
  return getAuth().middleware({ loginUrl: "/auth/sign-in" })(req);
}

export const config = {
  matcher: ["/new", "/workflows/:path*"],
};
