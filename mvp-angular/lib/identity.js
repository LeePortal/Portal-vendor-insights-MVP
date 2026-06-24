/**
 * Shared identity / claim-building for token issuers (the OAuth endpoints use this).
 *
 * DEMO-GRADE: the credential check is the single shared password, and admins come from a hardcoded
 * allowlist — mirroring /api/session. Production swaps `authenticate()` for Portal SSO / a real IdP;
 * `buildClaims()` (what scope a user gets) stays.
 *
 * NOTE: ADMINS / LEGACY_VENDORS / DEMO_PASSWORD are intentionally duplicated from api/session.js to
 * avoid editing that working login path — keep the two in sync until both move behind the real IdP.
 */
const db = require("./db");

const DEMO_PASSWORD = "demo";
const ADMINS = ["lee@portal.io", "admin@portal.io"];
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

/** Build a user's token claims (role, brand, scope, perms, freeSignup) — or null if the user is unknown. */
async function buildClaims(email) {
  const e = String(email || "").trim().toLowerCase();
  if (ADMINS.includes(e)) {
    return { email: e, role: "admin", brand: "", allowedParents: [], allowedSubs: [], allowedStates: [], allowedBrands: [], perms: {}, freeSignup: false };
  }
  if (db.isConfigured()) {
    try {
      const found = await db.getUserForLogin(e);
      if (found) {
        const eff = db.effective(found.user, found.company);
        return { email: e, role: "vendor", brand: eff.brand, allowedParents: eff.allowedParents, allowedSubs: eff.allowedSubs, allowedStates: eff.allowedStates, allowedBrands: eff.allowedBrands, perms: eff.perms, freeSignup: !!found.user.freeSignup };
      }
    } catch (err) { console.error("identity.buildClaims:", (err && err.message) || err); }
  }
  if (LEGACY_VENDORS[e]) {
    return { email: e, role: "vendor", brand: LEGACY_VENDORS[e], allowedParents: [], allowedSubs: [], allowedStates: [], allowedBrands: [], perms: {}, freeSignup: false };
  }
  return null;
}

/** Verify credentials (demo password) and return claims, or null. Production replaces this with the IdP. */
async function authenticate(email, password) {
  if (password !== DEMO_PASSWORD) return null;
  return buildClaims(email);
}

module.exports = { buildClaims, authenticate, DEMO_PASSWORD };
