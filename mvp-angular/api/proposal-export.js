/**
 * /api/proposal-export — BY-PROPOSAL raw line-item extract (CSV) from live Redshift.
 *
 * Unlike /api/brand-performance (which returns aggregates), this returns one row per
 * proposal line item for EVERY brand matching the company's category gating + the applied
 * filters. dealerid is an internal Portal id (not dealer-identifying), so it is included.
 *
 * Scope: same governance as the dashboard — allowedParents (server-side) intersected with the
 * user's parent/sub/state/status selections + the Date Range window (on `submitted`). Only
 * `deleted = false` line items. Capped at MAX_ROWS to stay within the serverless response limit;
 * truncation is signalled via the X-Export-Truncated / X-Export-Rows headers.
 *
 * Returns: text/csv (UTF-8, with BOM) so Excel opens it cleanly.
 *
 * Env: REDSHIFT_HOST, REDSHIFT_PORT(5439), REDSHIFT_DATABASE, REDSHIFT_USER, REDSHIFT_PASSWORD,
 *      FACT_TABLE (e.g. public.portal_mi_data_for_redshift)
 */
const FACT = process.env.FACT_TABLE || "public.portal_mi_data_for_redshift";
const MAX_ROWS = 25000; // keeps the CSV under Vercel's ~4.5MB response cap
const { authClaims } = require("../lib/auth");

const HORIZON_START = {
  MTD: "DATE_TRUNC('month', GETDATE())",
  QTD: "DATE_TRUNC('quarter', GETDATE())",
  YTD: "DATE_TRUNC('year', GETDATE())",
};

// Source column -> CSV header (Lee's spec; suppliername omitted — not a column in the fact table).
const COLUMNS = [
  ["dealerid", "dealerid"],
  ["proposalid", "proposalid"],
  ["brand", "brand"],
  ["model", "model"],
  ["quantity", "quantity"],
  ["cost", "cost"],
  ["sellprice", "sellprice"],
  ["total_sell", "total_sell"],
  ["supplierid", "supplierid"],
  ["zip", "zip"],
  ["state", "state"],
  ["submitted", "submitted_date"],
  ["accepteddate", "accepteddate"],
  ["created", "proposal_created"],
  ["part_added", "part_added"],
  ["totalproposalcost", "totalproposalcost"],
  ["subcat", "subcat"],
  ["parentcat", "parentcat"],
  ["status", "status"],
];

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
    max: 6,
    connectionTimeoutMillis: 8000,
    statement_timeout: 55000,
    idleTimeoutMillis: 30000,
  });
  _pool.on("error", (err) => console.error("pg pool error:", (err && err.message) || err));
  return _pool;
}

// Allowed categories come from the VERIFIED token (never client input). Admins see all.
function resolveTenant(claims) {
  return { allowedParents: claims.role === "admin" ? [] : (Array.isArray(claims.allowedParents) ? claims.allowedParents : []) };
}

function reqFilters(req) {
  const q = req.query || {};
  const arr = (v) => (v ? String(v).split(",").filter(Boolean) : []);
  return { parents: arr(q.parents), subs: arr(q.subs), states: arr(q.states), statuses: arr(q.statuses), horizon: String(q.horizon || "YTD"), from: String(q.from || ""), to: String(q.to || "") };
}

/** deleted hygiene + governance category + user category/state/status filters. */
function baseFilter(t, f) {
  const where = ["COALESCE(deleted, false) = false"];
  const vals = [];
  const add = (col, listA, listB) => {
    const list = listB && listB.length ? (listA.length ? listA.filter((x) => listB.includes(x)) : listB) : listA;
    if (list && list.length) { vals.push(list); where.push(`${col} = ANY($${vals.length})`); }
  };
  add("parentcat", f.parents, t.allowedParents);
  add("subcat", f.subs, null);
  add("state", f.states, null);
  add("status", f.statuses, null); // empty = all statuses
  return { where: where.join(" AND "), vals };
}

// CSV-safe value. Dates -> YYYY-MM-DD; everything else stringified and quoted when needed.
function cell(v) {
  if (v === null || v === undefined) return "";
  let s;
  if (v instanceof Date) s = isNaN(v) ? "" : v.toISOString().slice(0, 10);
  else s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "X-Export-Rows, X-Export-Truncated");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const missing = ["REDSHIFT_HOST", "REDSHIFT_DATABASE", "REDSHIFT_USER", "REDSHIFT_PASSWORD"].filter((k) => !process.env[k]);
    if (missing.length) return res.status(500).json({ error: "Missing environment variables: " + missing.join(", ") });

    const claims = authClaims(req);
    if (!claims) return res.status(401).json({ error: "Unauthorized" });
    const tenant = resolveTenant(claims);
    const f = reqFilters(req);
    const fb = baseFilter(tenant, f);
    const hz = ["MTD", "QTD", "YTD", "Custom"].includes(f.horizon) ? f.horizon : "YTD";
    const DRE = /^\d{4}-\d{2}-\d{2}$/;
    let startSql, endSql;
    if (hz === "Custom" && DRE.test(f.from) && DRE.test(f.to)) {
      const fromV = f.from < "2022-01-01" ? "2022-01-01" : f.from; // data floor: nothing reliable before 2022
      startSql = `CAST('${fromV}' AS DATE)`;
      endSql = `DATEADD(day, 1, CAST('${f.to}' AS DATE))`;
    } else {
      startSql = HORIZON_START[hz] || HORIZON_START.YTD;
      endSql = "DATEADD(day, 1, TRUNC(GETDATE()))";
    }
    const where = `${fb.where} AND submitted >= ${startSql} AND submitted < ${endSql}`;
    const cols = COLUMNS.map(([src]) => src).join(", ");

    const r = await pool().query(
      `SELECT ${cols} FROM ${FACT} WHERE ${where} ORDER BY proposalid, brand, model LIMIT ${MAX_ROWS + 1}`,
      fb.vals);

    const truncated = r.rows.length > MAX_ROWS;
    const rows = truncated ? r.rows.slice(0, MAX_ROWS) : r.rows;

    const header = COLUMNS.map(([, label]) => label).join(",");
    const lines = [header];
    for (const row of rows) lines.push(COLUMNS.map(([src]) => cell(row[src])).join(","));

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("X-Export-Rows", String(rows.length));
    res.setHeader("X-Export-Truncated", truncated ? "1" : "0");
    const BOM = String.fromCharCode(0xfeff); // makes Excel read the file as UTF-8
    res.status(200).send(BOM + lines.join("\r\n") + "\r\n");
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
