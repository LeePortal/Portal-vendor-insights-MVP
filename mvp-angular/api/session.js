/**
 * /api/session — MVP login. Validates credentials SERVER-SIDE and issues a signed token carrying
 * the user's role, brand, and effective category/sub/state restrictions. The data endpoints verify
 * that token and enforce scope from its claims, so the browser can't grant itself access.
 *
 * Identity sources:
 *   - ADMINS: external admin allowlist (stands in for admin.portal.io / SSO). Full visibility.
 *   - Vendor users: the Postgres vendor store (lib/db.js), managed in the admin UI. Their effective
 *     restriction (user override -> company default -> all) is baked into the token at login.
 *   - Fallback: if the store isn't configured/seeded yet, the legacy 10-vendor map still logs in
 *     (all categories), so the demo never hard-breaks.
 *
 * MVP credential model: a single shared password ("demo") — there is no per-user secret yet.
 * Production replaces this endpoint with real SSO + the real user store; the verify+enforce shape
 * downstream stays identical. Requires AUTH_SECRET (signing key).
 */
const { sign } = require("../lib/auth");
const db = require("../lib/db");

const DEMO_PASSWORD = "demo";
const ADMINS = ["lee@portal.io", "admin@portal.io"];

// Legacy fallback (used only if the vendor store is unconfigured or a lookup fails): email -> brand.
const LEGACY_VENDORS = {
  "casey.clemens@sonos.com": "Sonos",
  "rburnish@lutron.com": "Lutron",
  "kathleen.thomas@sony.com": "Sony Professional",
  "neal.grennan@sea.samsung.com": "Samsung VXT",
  "gabriel.johnson@masimo.com": "Denon",
  "jacob.tzegaegbe@snapone.com": "Control4",
  "craig.wojtala@ui.com": "Ubiquiti",
  "rj.snyder@masimo.com": "Klipsch",
  "camdyn.lee@snapone.com": "Araknis Networks",
  "wilson.eng@snapone.com": "Luma Surveillance",
};

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  return await new Promise((resolve, reject) => {
    let d = ""; req.on("data", (c) => { d += c; }); req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } }); req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.AUTH_SECRET) return res.status(500).json({ error: "Auth is not configured (AUTH_SECRET is not set)." });

  try {
    const { email, password } = await readBody(req);
    const e = String(email || "").trim().toLowerCase();
    if (password !== DEMO_PASSWORD) return res.status(401).json({ error: "Invalid email or password." });

    let claims = null;

    if (ADMINS.includes(e)) {
      claims = { email: e, role: "admin", brand: "", allowedParents: [], allowedSubs: [], allowedStates: [], allowedBrands: [], perms: {} };
    } else {
      // Preferred path: the vendor store (carries effective restrictions, read from the user account only).
      if (db.isConfigured()) {
        try {
          const found = await db.getUserForLogin(e);
          if (found) {
            const eff = db.effective(found.user, found.company);
            claims = { email: e, role: "vendor", brand: eff.brand, allowedParents: eff.allowedParents, allowedSubs: eff.allowedSubs, allowedStates: eff.allowedStates, allowedBrands: eff.allowedBrands, perms: eff.perms };
          }
        } catch (err) {
          console.error("session: vendor store lookup failed, trying legacy:", (err && err.message) || err);
        }
      }
      // Fallback: legacy 10-vendor map (all categories, all brands).
      if (!claims && LEGACY_VENDORS[e]) {
        claims = { email: e, role: "vendor", brand: LEGACY_VENDORS[e], allowedParents: [], allowedSubs: [], allowedStates: [], allowedBrands: [], perms: {} };
      }
    }

    if (!claims) return res.status(401).json({ error: "Invalid email or password." });

    claims.exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12; // 12h
    const token = sign(claims, process.env.AUTH_SECRET);
    res.status(200).json({ token, role: claims.role, brand: claims.brand, allowedParents: claims.allowedParents, allowedSubs: claims.allowedSubs, allowedStates: claims.allowedStates, allowedBrands: claims.allowedBrands, perms: claims.perms });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
