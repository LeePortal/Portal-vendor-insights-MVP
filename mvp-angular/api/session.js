/**
 * /api/session — MVP login. Validates demo credentials SERVER-SIDE and issues a signed token
 * carrying the user's role, brand, and allowed categories. The data endpoints verify that token
 * and enforce scope from its claims, so the browser can't grant itself access.
 *
 * MVP SEED: the demo identities below mirror the front-end demo accounts (all password "demo",
 * allowedParents [] = all categories). Production replaces this endpoint + seed with real SSO and
 * the real user store. Requires the AUTH_SECRET env var (the signing key) to be set.
 */
const { sign } = require("../lib/auth");

const DEMO_PASSWORD = "demo";
const ADMINS = ["lee@portal.io", "admin@portal.io"];
const VENDOR_USERS = {
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

    let claims;
    if (ADMINS.includes(e)) claims = { email: e, role: "admin", brand: "", allowedParents: [] };
    else if (VENDOR_USERS[e]) claims = { email: e, role: "vendor", brand: VENDOR_USERS[e], allowedParents: [] };
    else return res.status(401).json({ error: "Invalid email or password." });

    claims.exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12; // 12h
    const token = sign(claims, process.env.AUTH_SECRET);
    res.status(200).json({ token, role: claims.role, brand: claims.brand });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
