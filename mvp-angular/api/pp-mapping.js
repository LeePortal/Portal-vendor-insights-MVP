/**
 * /api/pp-mapping — the admin Premium Placement "Brand mapping" store surface.
 *   GET  -> { configured, map }                         where map = { [advertiserId]: brandName[] }
 *   POST -> body { advertiserId, brands:[] }  upserts one advertiser's Portal-brand list (empty list clears it),
 *           returns { ok, map } (the full, updated map)
 *
 * GATED: admin token only. This map is the explicit advertiser→Portal-brand link that replaces AdButler-name↔
 * Redshift-brand guessing; it's read by /api/adbutler (overview scoping) and the /premium admin Brand picker.
 */
const { authClaims } = require("../lib/auth");
const db = require("../lib/db");

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  return await new Promise((resolve, reject) => {
    let d = ""; req.on("data", (c) => { d += c; }); req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } }); req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!process.env.AUTH_SECRET) return res.status(500).json({ error: "Auth is not configured (AUTH_SECRET is not set)." });
  if (!db.isConfigured()) return res.status(500).json({ error: "Vendor store is not configured (set POSTGRES_URL or DATABASE_URL)." });

  const claims = authClaims(req);
  if (!claims) return res.status(401).json({ error: "Unauthorized" });
  if (claims.role !== "admin") return res.status(403).json({ error: "Admin only" });

  try {
    if (req.method === "GET") {
      return res.status(200).json({ configured: true, map: await db.getPpBrandMap() });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      if (!body || !body.advertiserId) return res.status(400).json({ error: "Expected { advertiserId, brands: [] }" });
      await db.setPpBrandMap(String(body.advertiserId), Array.isArray(body.brands) ? body.brands : []);
      return res.status(200).json({ ok: true, map: await db.getPpBrandMap() });
    }
    return res.status(405).json({ error: "GET or POST only" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
