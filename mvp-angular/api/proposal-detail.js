/**
 * /api/proposal-detail — proposal LINE-ITEM detail (Market Insights), including deleted/replaced rows.
 *
 * Powers the MCP `query_proposal_detail` tool. POLICY (per Lee, 2026-06-25): cross-brand sales data is
 * NOT sensitive — an assistant may read all brands, categories, and states. The ONLY thing protected is
 * dealer/customer identity. So security here rests on ONE hard guardrail plus a cap:
 *
 *   • COLUMN ALLOW-LIST — dealer/customer identity is NEVER selected (no `name`, no `dealerid`). Only the
 *     fields in the SELECT below are returned. (Note: the dealer-company `name` column DOES exist in the
 *     fact table, so this exclusion is what protects it — not its absence.)
 *   • Hard row cap (500).
 *
 * SCOPING: the MCP mints a signed `mcpUnscoped` token → all brands/categories/states open, with brand /
 * category / state / status acting only as OPTIONAL narrowing filters. A direct (non-MCP) vendor token
 * has no such flag and falls back to the caller's own brand + their allowed categories/states, so the
 * endpoint is safe even if hit outside the MCP. Deleted/replaced rows are included by default.
 *
 * Env: REDSHIFT_HOST/PORT/DATABASE/USER/PASSWORD, FACT_TABLE.
 */
const FACT = process.env.FACT_TABLE || "public.portal_mi_data_for_redshift";
const { authClaims } = require("../lib/auth");

const ROW_CAP = 500;
const arr = (v) => (Array.isArray(v) ? v : []);
const list = (v) => (v ? String(v).split(",").filter(Boolean) : []);
const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v));

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
    statement_timeout: 30000,
    idleTimeoutMillis: 30000,
  });
  _pool.on("error", (err) => console.error("proposal-detail pool error:", (err && err.message) || err));
  return _pool;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  const miss = ["REDSHIFT_HOST", "REDSHIFT_DATABASE", "REDSHIFT_USER", "REDSHIFT_PASSWORD"].filter((k) => !process.env[k]);
  if (miss.length) return res.status(500).json({ error: "Missing environment variables: " + miss.join(", ") });

  const claims = authClaims(req);
  if (!claims) return res.status(401).json({ error: "Unauthorized" });
  if (claims.freeSignup) return res.status(403).json({ error: "A Market Insights subscription is required." });

  const q = req.query || {};
  const unscoped = claims.mcpUnscoped === true || claims.role === "admin"; // MCP (or admin) = all brands open
  const where = [];
  const vals = [];
  const addAny = (col, items) => { if (items && items.length) { vals.push(items); where.push(`${col} = ANY($${vals.length})`); } };
  const eff = (reqd, allowed) => (allowed.length ? (reqd.length ? reqd.filter((x) => allowed.includes(x)) : allowed) : reqd);

  const reqParents = list(q.parents), reqSubs = list(q.subs), reqStates = list(q.states), statuses = list(q.statuses);

  if (unscoped) {
    // Open: brand/category/state are optional narrowing filters only.
    if (q.brand) { vals.push(String(q.brand)); where.push(`brand = $${vals.length}`); }
    addAny("parentcat", reqParents);
    addAny("subcat", reqSubs);
    addAny("state", reqStates);
  } else {
    // Scoped fallback (direct vendor call): lock to own/allowed brand + intersect filters with allowed sets.
    const allowedBrands = arr(claims.allowedBrands);
    let brand = q.brand ? String(q.brand) : "";
    if (allowedBrands.length) { if (!brand || !allowedBrands.includes(brand)) brand = claims.brand || allowedBrands[0]; }
    else brand = claims.brand;
    if (!brand) return res.status(403).json({ error: "No brand is associated with this account." });
    vals.push(brand); where.push(`brand = $${vals.length}`);
    addAny("parentcat", eff(reqParents, arr(claims.allowedParents)));
    addAny("subcat", eff(reqSubs, arr(claims.allowedSubs)));
    addAny("state", eff(reqStates, arr(claims.allowedStates)));
  }
  addAny("status", statuses); // optional in both modes

  const includeReplaced = q.includeReplaced !== "false"; // default: include deleted/replaced rows
  if (!includeReplaced) where.push("COALESCE(deleted, false) = false");

  // Date window on `submitted` (mirrors brand-performance: presets or validated Custom dates; default YTD).
  const hz = ["MTD", "QTD", "YTD", "Custom"].includes(String(q.horizon)) ? String(q.horizon) : "YTD";
  const DRE = /^\d{4}-\d{2}-\d{2}$/;
  let startSql, endSql;
  if (hz === "Custom" && DRE.test(q.from || "") && DRE.test(q.to || "")) {
    const fromV = q.from < "2022-01-01" ? "2022-01-01" : q.from; // data floor
    startSql = `CAST('${fromV}' AS DATE)`;
    endSql = `DATEADD(day, 1, CAST('${q.to}' AS DATE))`;
  } else {
    startSql = ({ MTD: "DATE_TRUNC('month', GETDATE())", QTD: "DATE_TRUNC('quarter', GETDATE())", YTD: "DATE_TRUNC('year', GETDATE())" })[hz] || "DATE_TRUNC('year', GETDATE())";
    endSql = "DATEADD(day, 1, TRUNC(GETDATE()))";
  }
  where.push(`submitted >= ${startSql} AND submitted < ${endSql}`);

  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 200, 1), ROW_CAP);

  // Column allow-list. NO `name` / `dealerid` (dealer identity) — that is the one thing we protect.
  const sql =
    `SELECT proposalid, submitted, accepteddate, parentcat, subcat, model, brand,
            quantity, total_sell, status, state,
            COALESCE(deleted, false) AS deleted, closed_won_flag
     FROM ${FACT}
     WHERE ${where.join(" AND ")}
     ORDER BY submitted DESC
     LIMIT ${limit + 1}`; // one extra row to detect truncation

  try {
    const r = await pool().query(sql, vals);
    const truncated = r.rows.length > limit;
    const rows = (truncated ? r.rows.slice(0, limit) : r.rows).map((x) => ({
      proposalId: x.proposalid,
      submitted: x.submitted,
      acceptedDate: x.accepteddate,
      parentCategory: x.parentcat,
      subcategory: x.subcat,
      brand: x.brand,
      model: x.model,
      units: num(x.quantity),
      value: num(x.total_sell),
      status: x.status,
      state: x.state,
      replaced: !!x.deleted,   // true = this line item was removed/replaced on the proposal
      closedWon: !!x.closed_won_flag,
    }));
    return res.status(200).json({ brand: q.brand ? String(q.brand) : "", scope: unscoped ? "all" : "own-brand", includeReplaced, rows, count: rows.length, truncated });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
