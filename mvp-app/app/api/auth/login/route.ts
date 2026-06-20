import { NextResponse } from "next/server";
import { authenticate, encodeSession, SESSION_COOKIE } from "@/lib/auth";
import { logEvent } from "@/lib/analytics/events";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const session = authenticate(body?.email || "", body?.password || "");
  if (!session) {
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }

  // First-party activity logging — a login event (mirrors Periscope last_login_at).
  logEvent({
    vendorId: session.vendorId || "portal",
    vendorName: session.role === "admin" ? "Portal" : session.name,
    userEmail: session.email,
    type: "login",
  });

  const res = NextResponse.json({ ok: true, role: session.role });
  res.cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
