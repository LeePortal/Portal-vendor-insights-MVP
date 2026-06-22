/**
 * /api/health — lightweight connection/health check for the admin "System status" panel.
 *
 * Returns { ts, checks: [{ id, label, status, detail }] } where status is "up" | "down" | "degraded".
 * Checks: Redshift connectivity (SELECT 1) and that the fact table is reachable. Kept fast via a
 * dedicated short-timeout pool so a hung warehouse can't stall the admin home page.
 */
const FACT = process.env.FACT_TABLE || "public.portal_mi_data_for_redshift";

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
    max: 2,
    connectionTimeoutMillis: 7000,
    statement_timeout: 7000,
    idleTimeoutMillis: 15000,
  });
  _pool.on("error", (err) => console.error("pg health pool error:", (err && err.message) || err));
  return _pool;
}

const msg = (e) => String((e && e.message) || e).slice(0, 140);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  const out = { ts: Date.now(), checks: [] };
  const missing = ["REDSHIFT_HOST", "REDSHIFT_DATABASE", "REDSHIFT_USER", "REDSHIFT_PASSWORD"].filter((k) => !process.env[k]);
  if (missing.length) {
    out.checks.push({ id: "redshift", label: "Live data (Redshift)", status: "down", detail: "Missing configuration: " + missing.join(", ") });
    return res.status(200).json(out);
  }

  try {
    const t0 = Date.now();
    await pool().query("SELECT 1 AS ok");
    out.checks.push({ id: "redshift", label: "Live data (Redshift)", status: "up", detail: "Connected · " + (Date.now() - t0) + "ms" });
    try {
      const t1 = Date.now();
      await pool().query(`SELECT 1 FROM ${FACT} LIMIT 1`);
      out.checks.push({ id: "facttable", label: "Data table", status: "up", detail: "Validated · " + (Date.now() - t1) + "ms" });
    } catch (e) {
      out.checks.push({ id: "facttable", label: "Data table", status: "down", detail: "Not reachable: " + msg(e) });
    }
  } catch (e) {
    out.checks.push({ id: "redshift", label: "Live data (Redshift)", status: "down", detail: "Connection failed: " + msg(e) });
  }

  res.status(200).json(out);
};
