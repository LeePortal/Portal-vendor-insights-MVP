/**
 * /api/platform-stats — network-wide "general platform information" for the Home page (shown to every
 * authenticated user, including free-signup accounts). AGGREGATE only — no brand scoping, no dealer
 * identities. Across ALL proposal statuses, trailing 12 months, with YoY vs the prior 12 months:
 *   - proposals: distinct proposal count
 *   - revenue:   SUM(total_sell)  (dealer revenue across the network)
 *   - brands:    distinct brand count ("brands tracked")
 *   - revByMonth: monthly revenue, this year + last year (last year aligned to the same buckets)
 *
 * Env: REDSHIFT_HOST, REDSHIFT_PORT(5439), REDSHIFT_DATABASE, REDSHIFT_USER, REDSHIFT_PASSWORD,
 *      FACT_TABLE. Missing env => { configured:false }.
 */
const FACT = process.env.FACT_TABLE || "public.portal_mi_data_for_redshift";
const { authClaims } = require("../lib/auth");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let _cache = null;
const TTL_MS = 1000 * 60 * 60; // 1h — same for every user

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
    statement_timeout: 40000,
    idleTimeoutMillis: 30000,
  });
  _pool.on("error", (err) => console.error("platform-stats pool error:", (err && err.message) || err));
  return _pool;
}

const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const yoy = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : 0);
const pkey = (v) => (v instanceof Date ? v.toISOString() : String(v));
function fmtMonth(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return String(v);
  return MONTHS[d.getUTCMonth()] + " '" + String(d.getUTCFullYear()).slice(2);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const claims = authClaims(req);
    if (!claims) return res.status(401).json({ error: "Unauthorized" });

    const missing = ["REDSHIFT_HOST", "REDSHIFT_DATABASE", "REDSHIFT_USER", "REDSHIFT_PASSWORD"].filter((k) => !process.env[k]);
    if (missing.length) return res.status(200).json({ configured: false });

    if (_cache && Date.now() - _cache.at < TTL_MS) return res.status(200).json(_cache.data);

    // Current = trailing 12 months through end of today; prior = the 12 months before that.
    const cur = `submitted >= DATEADD(year,-1, TRUNC(GETDATE())) AND submitted < DATEADD(day,1, TRUNC(GETDATE()))`;
    const prev = `submitted >= DATEADD(year,-2, TRUNC(GETDATE())) AND submitted < DATEADD(year,-1, DATEADD(day,1, TRUNC(GETDATE())))`;
    const p = pool();

    const [kpiRes, curRes, prevRes] = await Promise.all([
      p.query(
        `SELECT
           COUNT(DISTINCT CASE WHEN ${cur} THEN proposalid END) AS prop_cur,
           COUNT(DISTINCT CASE WHEN ${prev} THEN proposalid END) AS prop_prev,
           SUM(CASE WHEN ${cur} THEN total_sell ELSE 0 END) AS rev_cur,
           SUM(CASE WHEN ${prev} THEN total_sell ELSE 0 END) AS rev_prev,
           COUNT(DISTINCT CASE WHEN ${cur} THEN brand END) AS brand_cur,
           COUNT(DISTINCT CASE WHEN ${prev} THEN brand END) AS brand_prev
         FROM ${FACT} WHERE COALESCE(deleted, false) = false`),
      p.query(
        `SELECT DATE_TRUNC('month', submitted) AS period, SUM(total_sell) AS sales
         FROM ${FACT} WHERE COALESCE(deleted, false) = false AND submitted IS NOT NULL AND ${cur}
         GROUP BY 1 ORDER BY 1`),
      p.query(
        // prior-year revenue, shifted +1yr so it DATE_TRUNCs into the same month buckets as the current window
        `SELECT DATE_TRUNC('month', DATEADD(year, 1, submitted)) AS period, SUM(total_sell) AS sales
         FROM ${FACT} WHERE COALESCE(deleted, false) = false AND submitted IS NOT NULL AND ${prev}
         GROUP BY 1 ORDER BY 1`),
    ]);

    const k = kpiRes.rows[0] || {};
    const curMap = new Map();
    for (const r of curRes.rows) curMap.set(pkey(r.period), { date: r.period, sales: num(r.sales) });
    const prevMap = new Map();
    for (const r of prevRes.rows) prevMap.set(pkey(r.period), num(r.sales));
    const keys = [...curMap.keys()].sort();

    const data = {
      configured: true,
      proposals: { count: num(k.prop_cur), yoy: yoy(num(k.prop_cur), num(k.prop_prev)) },
      revenue: { value: num(k.rev_cur), yoy: yoy(num(k.rev_cur), num(k.rev_prev)) },
      brands: { count: num(k.brand_cur), yoy: yoy(num(k.brand_cur), num(k.brand_prev)) },
      revByMonth: {
        labels: keys.map((key) => fmtMonth(curMap.get(key).date)),
        thisYear: keys.map((key) => curMap.get(key).sales),
        lastYear: keys.map((key) => prevMap.get(key) || 0),
      },
    };
    _cache = { at: Date.now(), data };
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
