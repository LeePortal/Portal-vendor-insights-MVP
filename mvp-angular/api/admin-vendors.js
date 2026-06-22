/**
 * /api/admin-vendors — the admin UI's read/write surface for the vendor store.
 *   GET  -> { companies, users, logos }   (full dataset; the UI hydrates from this)
 *   PUT  -> body { companies, users, logos } replaces the whole dataset (transactional, last-write-wins)
 *
 * GATED: requires a verified token whose role === "admin" (the same signed token /api/session issues).
 * A vendor token is rejected, so brand users can never read or edit the store. Tens of rows, single
 * admin -> a whole-dataset PUT is simplest and robust for the MVP; production would move to granular,
 * audited mutations against admin.portal.io.
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
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
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
      const data = await db.getAll();
      return res.status(200).json(data);
    }
    if (req.method === "PUT") {
      const body = await readBody(req);
      if (!body || !Array.isArray(body.companies) || !Array.isArray(body.users)) {
        return res.status(400).json({ error: "Expected { companies: [], users: [], logos: {} }" });
      }
      await db.replaceAll({ companies: body.companies, users: body.users, logos: body.logos || {} });
      return res.status(200).json({ ok: true, companies: body.companies.length, users: body.users.length });
    }
    return res.status(405).json({ error: "GET or PUT only" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
