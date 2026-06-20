/**
 * /api/brand-performance — tenant-scoped Brand Performance aggregates from Redshift.
 *
 * Plain CommonJS (not TypeScript) on purpose: the Angular project's tsconfig
 * (module: ES2022, moduleResolution: bundler) makes Vercel mis-load a .ts function,
 * so this is authored as a .js Node function that Vercel runs directly.
 *
 * Connection: a DIRECT Postgres-protocol connection to Redshift (the same kind Deepnote uses),
 * reusing your read-only DB credentials. All values come from Vercel env vars — never client code:
 *   REDSHIFT_HOST, REDSHIFT_PORT (default 5439), REDSHIFT_DATABASE, REDSHIFT_USER,
 *   REDSHIFT_PASSWORD, FACT_TABLE (default analytics.proposal_parts)
 *
 * Security: the browser sends only filter selections; the caller's tenant (brand), visible-brand
 * allow-list and parent-category restriction come from resolveTenant() server-side. SQL is parameterized.
 */
const FACT = process.env.FACT_TABLE || "analytics.proposal_parts";

// per-instance cache (swap for Vercel KV in prod; source data refreshes nightly)
const cache = new Map();
const TTL_MS = 1000 * 60 * 60 * 3; // 3h

// TODO: replace with real auth — derive tenant + governance from the verified session/JWT (Portal SSO).
function resolveTenant(_req) {
  return { brand: "Sonos", allowedBrands: ["Sonos"], allowedParents: [] /* [] = all */ };
}

function reqFilters(req) {
  const q = req.query || {};
  const arr = (v) => (v ? String(v).split(",").filter(Boolean) : []);
  return { parents: arr(q.parents), subs: arr(q.subs), buyingGroups: arr(q.buyingGroups), states: arr(q.states) };
}

function scope(t, f) {
  const where = [];
  const vals = [];
  const add = (cond, v) => { vals.push(v); where.push(cond(vals.length)); };
  if (t.allowedBrands.length) add((i) => `brand = ANY($${i})`, t.allowedBrands);
  if (t.allowedParents.length) add((i) => `parentcat = ANY($${i})`, t.allowedParents);
  const parents = t.allowedParents.length ? f.parents.filter((p) => t.allowedParents.includes(p)) : f.parents;
  if (parents.length) add((i) => `parentcat = ANY($${i})`, parents);
  if (f.states.length) add((i) => `state = ANY($${i})`, f.states);
  return { clause: where.length ? "WHERE " + where.join(" AND ") : "", vals };
}

async function withClient(fn) {
  let Client;
  try {
    Client = require("pg").Client;
  } catch (e) {
    throw new Error("Could not load 'pg' module — it is not installed in the deployment. " + ((e && e.message) || e));
  }
  const c = new Client({
    host: process.env.REDSHIFT_HOST,
    port: Number(process.env.REDSHIFT_PORT || 5439),
    database: process.env.REDSHIFT_DATABASE,
    user: process.env.REDSHIFT_USER,
    password: process.env.REDSHIFT_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 15000,
  });
  // 'error' listener prevents an async socket error (e.g. a firewall RST) from crashing the function.
  c.on("error", (err) => console.error("pg client error:", (err && err.message) || err));
  try {
    await c.connect();
    return await fn(c);
  } finally {
    try { await c.end(); } catch (_) { /* ignore */ }
  }
}

module.exports = async (req, res) => {
  try {
    const missing = ["REDSHIFT_HOST", "REDSHIFT_DATABASE", "REDSHIFT_USER", "REDSHIFT_PASSWORD"].filter((k) => !process.env[k]);
    if (missing.length) return res.status(500).json({ error: "Missing environment variables: " + missing.join(", ") });

    const tenant = resolveTenant(req);
    const f = reqFilters(req);
    const key = JSON.stringify({ tenant, f });
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return res.status(200).json(hit.data);

    const s = scope(tenant, f);

    // Brand share of the (tenant-visible) category. Remaining payload sections (item/subcat/
    // share-series/proposals/displacement) follow the same pattern — see
    // 04_Redshift_Live_Data_(Brand_Performance).md.
    const payload = await withClient(async (c) => {
      const br = await c.query(
        `SELECT brand,
                SUM(total_sell)       AS sales,
                SUM(quantity)         AS units,
                COUNT(DISTINCT model) AS skus
         FROM ${FACT} ${s.clause}
         GROUP BY brand
         ORDER BY sales DESC`,
        s.vals,
      );
      const brandRows = br.rows.map((r) => ({
        brand: r.brand, sales: +r.sales, units: +r.units, skus: +r.skus,
        sharePct: 0, unitSharePct: 0, avgSell: +r.units ? +r.sales / +r.units : 0,
      }));
      const totalSales = brandRows.reduce((a, b) => a + b.sales, 0) || 1;
      const totalUnits = brandRows.reduce((a, b) => a + b.units, 0) || 1;
      brandRows.forEach((b) => { b.sharePct = (b.sales / totalSales) * 100; b.unitSharePct = (b.units / totalUnits) * 100; });

      return {
        brandRows,
        itemRows: [],
        subcatRows: [],
        share: { labels: [], rows: brandRows, series: {} },
        kpis: { revenue: ((brandRows.find((b) => b.brand === tenant.brand) || {}).sales) || 0, units: 0, proposals: 0, dealers: 0, revenueYoY: 0, unitsYoY: 0, proposalsYoY: 0, dealersYoY: 0 },
        submitted: [], accepted: [], won: [], lost: [],
      };
    });

    cache.set(key, { at: Date.now(), data: payload });
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
