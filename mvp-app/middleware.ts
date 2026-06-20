import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Kept inline (not imported from lib/auth) so the edge middleware bundle stays
// tiny and free of Node-only APIs.
const SESSION_COOKIE = "pvi_session";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isAuthEndpoint = pathname.startsWith("/api/auth");
  const isLogin = pathname === "/login";

  // Allow the login page and auth endpoints through unauthenticated.
  if (isLogin || isAuthEndpoint) {
    // If already signed in, bounce away from the login screen.
    if (hasSession && isLogin) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Everything else requires a session.
  if (!hasSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)).*)"],
};
