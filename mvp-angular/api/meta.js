/**
 * /api/meta — live filter option lists, straight from Redshift (so dropdowns match the real data).
 *
 * Returns DISTINCT values actually present in the fact table:
 *   { parents: string[], subcats: [{name, parent}], states: string[] }
 *
 * These are global taxonomy lists (not tenant-scoped): the dashboard limits parent options to the
 * user's allowed categories client-side, and every data query is still enforced server-side from the
 * token. Values are returned RAW (exactly as stored) — the client maps state codes to friendly names
 * for display only, and queries with the raw value.
 *
 * Cached in-process (24h) because the taxonomy changes rarely and DISTINCT scans aren't free.
 * Token-gated (any valid signed token). Env: REDSHIFT_* + FACT_TABLE.
 */
const FACT = process.env.FACT_TABLE || "public.portal_mi_data_for_redshift";
const { authClaims } = require("../lib/auth");

let _pool = null;
function pool() {
  if (_pool) return _pool;
  const { Pool } = require("pg");
  _pool = new Pool({
    host: process.env.REDSHIFT_HOST,
    port: Number(process.env.REDSHIFT_PORT || 5439),
    database: process.env.REDSHIFT_DATABASE,
    user: process.env.REDSHIFT_USER,
    password: process.env.REDSHIFT_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 8000,
    statement_timeout: 30000,
    idleTimeoutMillis: 30000,
  });
  _pool.on("error", (err) => console.error("meta pool error:", (err && err.message) || err));
  return _pool;
}

let _cache = null; // { at, data }
const TTL_MS = 1000 * 60 * 60 * 24; // 24h

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const missing = ["REDSHIFT_HOST", "REDSHIFT_DATABASE", "REDSHIFT_USER", "REDSHIFT_PASSWORD"].filter((k) => !process.env[k]);
    if (missing.length) return res.status(500).json({ error: "Missing environment variables: " + missing.join(", ") });

    const claims = authClaims(req);
    if (!claims) return res.status(401).json({ error: "Unauthorized" });

    if (_cache && Date.now() - _cache.at < TTL_MS) return res.status(200).json(_cache.data);

    const hygiene = "COALESCE(deleted, false) = false";
    const p = pool();
    const [pc, sc, st, br] = await Promise.all([
      p.query(`SELECT DISTINCT parentcat FROM ${FACT} WHERE parentcat IS NOT NULL AND parentcat <> '' AND ${hygiene} ORDER BY parentcat`),
      p.query(`SELECT DISTINCT parentcat, subcat FROM ${FACT} WHERE subcat IS NOT NULL AND subcat <> '' AND ${hygiene} ORDER BY parentcat, subcat`),
      p.query(`SELECT DISTINCT state FROM ${FACT} WHERE state IS NOT NULL AND state <> '' AND ${hygiene} ORDER BY state`),
      p.query(`SELECT DISTINCT brand FROM ${FACT} WHERE brand IS NOT NULL AND brand <> '' AND ${hygiene} ORDER BY brand`),
    ]);

    const data = {
      parents: pc.rows.map((r) => r.parentcat),
      subcats: sc.rows.map((r) => ({ name: r.subcat, parent: r.parentcat })),
      states: st.rows.map((r) => r.state),
      brands: br.rows.map((r) => r.brand),
    };
    _cache = { at: Date.now(), data };
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
