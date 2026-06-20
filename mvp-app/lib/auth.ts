/**
 * Mock authentication & session handling.
 *
 * This is a DEMO scheme: the session is a base64-encoded JSON blob in a cookie,
 * and every demo account shares the password "demo". It exists purely to
 * simulate the gated, role-scoped access the real platform will enforce.
 *
 * For production, replace this with real auth (SSO/SCIM per the research doc)
 * and a signed/encrypted session (JWT or an opaque session id + server store).
 */
import { cookies } from "next/headers";
import { VENDORS } from "./data/seed";

export type Role = "vendor" | "admin";

export interface Session {
  email: string;
  name: string;
  role: Role;
  vendorId?: string; // present for vendor users; the tenant scope
}

export interface DemoUser extends Session {
  password: string;
}

export const SESSION_COOKIE = "pvi_session";
const DEMO_PASSWORD = "demo";

/** Portal staff (see all vendors + the admin "Portal view"). */
const ADMINS: DemoUser[] = [
  { email: "lee@portal.io", name: "Lee (Portal)", role: "admin", password: DEMO_PASSWORD },
  { email: "admin@portal.io", name: "Portal Admin", role: "admin", password: DEMO_PASSWORD },
];

/** One vendor login per brand, scoped to that brand's data only. */
const VENDOR_USERS: DemoUser[] = VENDORS.map((v) => ({
  email: v.contactEmail,
  name: `${v.name} Team`,
  role: "vendor" as Role,
  vendorId: v.id,
  password: DEMO_PASSWORD,
}));

export const DEMO_USERS: DemoUser[] = [...ADMINS, ...VENDOR_USERS];

export function authenticate(email: string, password: string): Session | null {
  const u = DEMO_USERS.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!u || password !== u.password) return null;
  return { email: u.email, name: u.name, role: u.role, vendorId: u.vendorId };
}

export function encodeSession(s: Session): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64");
}

export function decodeSession(value: string | undefined): Session | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    if (parsed && typeof parsed.email === "string" && (parsed.role === "vendor" || parsed.role === "admin")) {
      return parsed as Session;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read the current session in a Server Component / Route Handler. */
export function getSession(): Session | null {
  return decodeSession(cookies().get(SESSION_COOKIE)?.value);
}
