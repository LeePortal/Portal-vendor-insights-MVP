/**
 * Shared auth helper for the API functions (required by /api/*; not itself a route).
 *
 * Issues and verifies a compact signed token (JWT-style, HMAC-SHA256) using the server-only
 * AUTH_SECRET env var. The MVP login (/api/session) signs a token with the user's role, brand,
 * and allowed categories; the data endpoints verify it and derive the tenant from the *verified*
 * claims — never from client input — so a vendor can't request another brand's data or forge admin.
 *
 * Production swaps the token ISSUER (real SSO) but keeps this verify + enforcement shape.
 */
const crypto = require("crypto");

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlJson(obj) { return b64url(Buffer.from(JSON.stringify(obj))); }
function fromB64url(s) { return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64"); }

function sign(payload, secret) {
  const data = b64urlJson({ alg: "HS256", typ: "JWT" }) + "." + b64urlJson(payload);
  const sig = b64url(crypto.createHmac("sha256", secret).update(data).digest());
  return data + "." + sig;
}

/** Verify signature + expiry. Returns the claims object, or null if missing/invalid/expired. */
function verify(token, secret) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const data = parts[0] + "." + parts[1];
  const expected = b64url(crypto.createHmac("sha256", secret).update(data).digest());
  const a = Buffer.from(parts[2]), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(fromB64url(parts[1]).toString("utf8")); } catch { return null; }
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;
  return payload;
}

function bearer(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? m[1] : "";
}

/** Verify the request's bearer token. Returns claims or null. Returns null if AUTH_SECRET is unset. */
function authClaims(req) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return verify(bearer(req), secret);
}

module.exports = { sign, verify, bearer, authClaims };
