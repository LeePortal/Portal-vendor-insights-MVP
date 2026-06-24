/**
 * /api/signup — self-serve account creation. Anyone with the Portal web address can create a free
 * account (no subscription) and land on the teaser Home. These are flagged free_signup=true in the
 * vendor store so the front-end shows the limited/teaser view.
 *
 * EMAIL VERIFICATION is a placeholder for now — the real flow (send a verification link, gate access
 * until clicked) is wired by devs later. For the MVP this endpoint creates the account and issues a
 * token immediately so the signup can be demoed end-to-end.
 *
 * Mirrors /api/session's token shape so the front-end establishes the same session. Requires
 * AUTH_SECRET (signing key) and a configured vendor store (POSTGRES_URL / DATABASE_URL).
 */
const { sign } = require("../lib/auth");
const db = require("../lib/db");

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  return await new Promise((resolve, reject) => {
    let d = ""; req.on("data", (c) => { d += c; }); req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } }); req.on("error", reject);
  });
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.AUTH_SECRET) return res.status(500).json({ error: "Auth is not configured (AUTH_SECRET is not set)." });
  if (!db.isConfigured()) return res.status(500).json({ error: "Account store is not configured." });

  try {
    const body = await readBody(req);
    const firstName = String((body && body.firstName) || "").trim();
    const lastName = String((body && body.lastName) || "").trim();
    const company = String((body && body.company) || "").trim();
    const email = String((body && body.email) || "").trim().toLowerCase();
    if (!firstName || !lastName) return res.status(400).json({ error: "First and last name are required." });
    if (!company) return res.status(400).json({ error: "Company is required." });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });

    const result = await db.createSignupUser({ email, firstName, lastName, company });
    if (!result.created) {
      // An account already exists for this email — don't clobber it; point them to sign in.
      return res.status(409).json({ error: "An account already exists for this email. Please sign in instead." });
    }

    // TODO(devs): send a verification email and gate access until the link is clicked. For now we
    // issue the token immediately so the flow is demoable end-to-end.
    const claims = {
      email, role: "vendor", brand: company, freeSignup: true,
      allowedParents: [], allowedSubs: [], allowedStates: [], allowedBrands: [], perms: {},
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12, // 12h
    };
    const token = sign(claims, process.env.AUTH_SECRET);
    await db.recordLogin(email).catch(() => {});

    res.status(200).json({
      token, role: "vendor", brand: company,
      allowedParents: [], allowedSubs: [], allowedStates: [], allowedBrands: [], perms: {},
      logo: "", subStart: "", subEnd: "", suspended: false, freeSignup: true,
      name: result.name,
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
