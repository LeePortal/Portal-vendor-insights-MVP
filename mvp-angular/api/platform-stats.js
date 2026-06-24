/**
 * /api/platform-stats — network-wide proposal activity for the Home page. Returns DISTINCT proposal
 * counts for Submitted / Accepted / Completed across the whole Portal network (trailing 12 months)
 * plus YoY vs the prior 12 months.
 *
 * This is AGGREGATE, non-brand, non-dealer data — "general platform information" — so it's available
 * to ANY authenticated user, including free-signup accounts. No brand scoping, no dealer identities.
 *
 * Env: REDSHIFT_HOST, REDSHIFT_PORT(5439), REDSHIFT_DATABASE, REDSHIFT_USER, REDSHIFT_PASSWORD,
 *      FACT_TABLE (e.g. public.portal_mi_data_for_redshift). Missing env => { configured:false }.
 */
const FACT = process.env.FACT_TABLE || "public.portal_mi_data_for_redshift";
const { authClaims } = require("../lib/auth");

const STATUSES = ["Submitted", "Accepted", "Completed"];
let _cache = null;
const TTL_MS = 1000 * 60 * 60; // 1h — same for every user, so cache hard

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
    max: 4,
    connectionTimeoutMillis: 8000,
    statement_timeout: 30000,
    idleTimeoutMillis: 30000,
  });
  _pool.on("error", (err) => console.error("platform-stats pool error:", (err && err.message) || err));
  return _pool;
}

const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const yoy = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : 0);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const claims = authClaims(req);
    if (!claims) return res.status(401).json({ error: "Unauthorized" });

    const missing = ["REDSHIFT_HOST", "REDSHIFT_DATABASE", "REDSHIFT_USER", "REDSHIFT_PASSWORD"].filter((k) => !process.env[k]);
    if (missing.length) return res.status(200).json({ configured: false, statuses: [] });

    if (_cache && Date.now() - _cache.at < TTL_MS) return res.status(200).json(_cache.data);

    // Current window = trailing 12 months through end of today; prior = the 12 months before that.
    const cur = `submitted >= DATEADD(year,-1, TRUNC(GETDATE())) AND submitted < DATEADD(day,1, TRUNC(GETDATE()))`;
    const prev = `submitted >= DATEADD(year,-2, TRUNC(GETDATE())) AND submitted < DATEADD(year,-1, DATEADD(day,1, TRUNC(GETDATE())))`;
    const r = await pool().query(
      `SELECT status,
              COUNT(DISTINCT CASE WHEN ${cur} THEN proposalid END) AS cur,
              COUNT(DISTINCT CASE WHEN ${prev} THEN proposalid END) AS prev
       FROM ${FACT}
       WHERE COALESCE(deleted, false) = false AND status IN ('Submitted','Accepted','Completed')
       GROUP BY status`);

    const by = {};
    for (const row of r.rows) by[String(row.status)] = { cur: num(row.cur), prev: num(row.prev) };
    const statuses = STATUSES.map((s) => {
      const e = by[s] || { cur: 0, prev: 0 };
      return { key: s, count: e.cur, yoy: yoy(e.cur, e.prev) };
    });

    const data = { configured: true, statuses };
    _cache = { at: Date.now(), data };
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
