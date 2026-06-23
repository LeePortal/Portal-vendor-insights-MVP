/**
 * /api/new-dealers — count of dealers NEW to the caller's brand in the last 30 days.
 *
 * Lists every dealer that SPEC'D the brand (a non-deleted brand line item, by submitted date) in the
 * last 30 days, each flagged isNew = no brand spec in the prior 3 months (days 30-120 before).
 *
 * Brand-locked to the VERIFIED token (a vendor only ever gets their own brand). Deliberately NOT
 * affected by the dashboard filters — it's a fixed 30-day-vs-prior-3-months measure. Admins have no
 * own brand, so they get 0 (the widget is hidden for them anyway). Only dealerid (an internal id) is
 * touched — never the dealer company name.
 *
 * Env: REDSHIFT_HOST, REDSHIFT_PORT(5439), REDSHIFT_DATABASE, REDSHIFT_USER, REDSHIFT_PASSWORD, FACT_TABLE.
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
    statement_timeout: 25000,
    idleTimeoutMillis: 30000,
  });
  _pool.on("error", (err) => console.error("new-dealers pool error:", (err && err.message) || err));
  return _pool;
}

const _cache = new Map(); // brand -> { at, n }
const TTL_MS = 1000 * 60 * 30; // 30 min

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

    const brand = claims.role === "admin" ? "" : String(claims.brand || "");
    if (!brand) return res.status(200).json({ count: 0, newCount: 0, dealers: [] }); // admin / no own brand

    const hit = _cache.get(brand);
    if (hit && Date.now() - hit.at < TTL_MS) return res.status(200).json(hit.data);

    const recentFrom = "DATEADD(day, -30, TRUNC(GETDATE()))";
    const priorFrom = "DATEADD(day, -120, TRUNC(GETDATE()))";
    // The warehouse has `state`; `city` may or may not exist — detect it so the query never breaks.
    const tbl = FACT.includes(".") ? FACT.split(".").pop() : FACT;
    let hasCity = false;
    try { const cc = await pool().query("SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'city' LIMIT 1", [tbl]); hasCity = cc.rows.length > 0; } catch (e) { /* assume no city column */ }
    const cityExpr = hasCity ? "MAX(city)" : "CAST(NULL AS VARCHAR)";
    const sql =
      `WITH recent AS (
         SELECT dealerid, MAX(name) AS dealer, MAX(state) AS state, ${cityExpr} AS city FROM ${FACT}
         WHERE brand = $1 AND COALESCE(deleted, false) = false AND submitted >= ${recentFrom}
         GROUP BY dealerid
       ),
       prior AS (
         SELECT DISTINCT dealerid FROM ${FACT}
         WHERE brand = $1 AND COALESCE(deleted, false) = false
           AND submitted >= ${priorFrom} AND submitted < ${recentFrom}
       )
       SELECT r.dealerid, r.dealer, r.city, r.state, CASE WHEN p.dealerid IS NULL THEN 1 ELSE 0 END AS is_new
       FROM recent r LEFT JOIN prior p ON r.dealerid = p.dealerid
       ORDER BY is_new DESC, r.dealer LIMIT 1000`;
    const r = await pool().query(sql, [brand]);
    const dealers = r.rows.map((row) => ({ id: row.dealerid, name: row.dealer || "Unknown dealer", city: row.city || "", state: row.state || "", isNew: Number(row.is_new) === 1 }));
    const out = { count: dealers.length, newCount: dealers.filter((d) => d.isNew).length, dealers, brand };
    _cache.set(brand, { at: Date.now(), data: out });
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
