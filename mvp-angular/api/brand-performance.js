/**
 * /api/brand-performance — Brand Performance Overview from live Redshift data.
 *
 * Plain CommonJS (not TypeScript) on purpose: the Angular project's tsconfig
 * (module: ES2022, moduleResolution: bundler) makes Vercel mis-load a .ts function.
 *
 * Returns the BrandPerfPayload shape the app expects (src/app/core/brand-performance.contract.ts).
 * Direct `pg` connection to Redshift; all config from Vercel env vars:
 *   REDSHIFT_HOST, REDSHIFT_PORT (default 5439), REDSHIFT_DATABASE, REDSHIFT_USER,
 *   REDSHIFT_PASSWORD, FACT_TABLE (e.g. public.portal_mi_data_for_redshift)
 *
 * Competitive model: category-wide brand AGGREGATES are returned (so the viewed brand sees its
 * real share vs competitors) — only brand-level totals, never competitors' raw line-item detail.
 * The viewed brand (tenant) is used to compute its own headline KPIs and is flagged for the UI.
 *
 * IMPLEMENTED (live): brand share, sub-category breakdown, item share, KPIs (+ real YoY).
 * TODO (next step): share-over-time series, proposal funnel/value, win/loss displacement.
 */
const FACT = process.env.FACT_TABLE || "public.portal_mi_data_for_redshift";

const cache = new Map();
const TTL_MS = 1000 * 60 * 60 * 3; // 3h

// TODO: replace with real auth — derive the viewed brand from the verified session/JWT (Portal SSO).
function resolveTenant(_req) {
  return { brand: "Sonos", allowedParents: [] /* [] = all categories */ };
}

function reqFilters(req) {
  const q = req.query || {};
  const arr = (v) => (v ? String(v).split(",").filter(Boolean) : []);
  return { parents: arr(q.parents), subs: arr(q.subs), states: arr(q.states) };
}

/** Category-wide WHERE (no brand restriction): request filters + tenant category governance. */
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
  return { where: where.join(" AND "), vals };
}

async function withClient(fn) {
  let Client;
  try { Client = require("pg").Client; }
  catch (e) { throw new Error("Could not load 'pg' module. " + ((e && e.message) || e)); }
  const c = new Client({
    host: process.env.REDSHIFT_HOST,
    port: Number(process.env.REDSHIFT_PORT || 5439),
    database: process.env.REDSHIFT_DATABASE,
    user: process.env.REDSHIFT_USER,
    password: process.env.REDSHIFT_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 20000,
  });
  c.on("error", (err) => console.error("pg client error:", (err && err.message) || err));
  try { await c.connect(); return await fn(c); }
  finally { try { await c.end(); } catch (_) { /* ignore */ } }
}

const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const yoy = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : 0);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const missing = ["REDSHIFT_HOST", "REDSHIFT_DATABASE", "REDSHIFT_USER", "REDSHIFT_PASSWORD"].filter((k) => !process.env[k]);
    if (missing.length) return res.status(500).json({ error: "Missing environment variables: " + missing.join(", ") });

    const tenant = resolveTenant(req);
    const f = reqFilters(req);
    const key = JSON.stringify({ tenant, f });
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return res.status(200).json(hit.data);

    const fb = baseFilter(tenant, f);

    const payload = await withClient(async (c) => {
      // --- category-wide brand aggregates (competitive share) ---
      const brandRes = await c.query(
        `SELECT brand, SUM(total_sell) AS sales, SUM(quantity) AS units, COUNT(DISTINCT model) AS skus
         FROM ${FACT} WHERE ${fb.where}
         GROUP BY brand ORDER BY sales DESC`, fb.vals);

      // --- sub-category breakdown ---
      const subRes = await c.query(
        `SELECT subcat, SUM(total_sell) AS sales, SUM(quantity) AS units
         FROM ${FACT} WHERE ${fb.where}
         GROUP BY subcat ORDER BY sales DESC`, fb.vals);

      // --- top items (brand + model) ---
      const itemRes = await c.query(
        `SELECT brand, model, LEFT(MAX(name), 90) AS name,
                SUM(total_sell) AS sales, SUM(quantity) AS units
         FROM ${FACT} WHERE ${fb.where}
         GROUP BY brand, model ORDER BY sales DESC LIMIT 200`, fb.vals);

      // --- headline KPIs for the viewed brand (+ real YoY by submitted date) ---
      const kvals = fb.vals.slice(); kvals.push(tenant.brand);
      const bp = `$${kvals.length}`;
      const kpiRes = await c.query(
        `SELECT
           SUM(total_sell) AS rev_all,
           SUM(quantity)   AS un_all,
           COUNT(DISTINCT proposalid) AS prop_all,
           COUNT(DISTINCT dealerid)   AS deal_all,
           SUM(CASE WHEN submitted >= DATEADD(year,-1,GETDATE()) THEN total_sell ELSE 0 END) AS rev_cur,
           SUM(CASE WHEN submitted >= DATEADD(year,-2,GETDATE()) AND submitted < DATEADD(year,-1,GETDATE()) THEN total_sell ELSE 0 END) AS rev_prev,
           SUM(CASE WHEN submitted >= DATEADD(year,-1,GETDATE()) THEN quantity ELSE 0 END) AS un_cur,
           SUM(CASE WHEN submitted >= DATEADD(year,-2,GETDATE()) AND submitted < DATEADD(year,-1,GETDATE()) THEN quantity ELSE 0 END) AS un_prev,
           COUNT(DISTINCT CASE WHEN submitted >= DATEADD(year,-1,GETDATE()) THEN proposalid END) AS prop_cur,
           COUNT(DISTINCT CASE WHEN submitted >= DATEADD(year,-2,GETDATE()) AND submitted < DATEADD(year,-1,GETDATE()) THEN proposalid END) AS prop_prev,
           COUNT(DISTINCT CASE WHEN submitted >= DATEADD(year,-1,GETDATE()) THEN dealerid END) AS deal_cur,
           COUNT(DISTINCT CASE WHEN submitted >= DATEADD(year,-2,GETDATE()) AND submitted < DATEADD(year,-1,GETDATE()) THEN dealerid END) AS deal_prev
         FROM ${FACT} WHERE ${fb.where} AND brand = ${bp}`, kvals);

      // --- shape to the contract ---
      const brandRows = brandRes.rows.map((r) => ({
        brand: r.brand, sales: num(r.sales), units: num(r.units), skus: num(r.skus),
        sharePct: 0, unitSharePct: 0, avgSell: num(r.units) ? num(r.sales) / num(r.units) : 0,
      }));
      const totalSales = brandRows.reduce((a, b) => a + b.sales, 0) || 1;
      const totalUnits = brandRows.reduce((a, b) => a + b.units, 0) || 1;
      brandRows.forEach((b) => { b.sharePct = (b.sales / totalSales) * 100; b.unitSharePct = (b.units / totalUnits) * 100; });

      const itemRows = itemRes.rows.map((r) => ({
        brand: r.brand, model: r.model, desc: r.name || r.model,
        sales: num(r.sales), units: num(r.units),
        sharePct: (num(r.sales) / totalSales) * 100, unitSharePct: (num(r.units) / totalUnits) * 100,
        avgSell: num(r.units) ? num(r.sales) / num(r.units) : 0,
      }));

      const subcatRows = subRes.rows.map((r) => ({
        subcat: r.subcat, sales: num(r.sales), units: num(r.units),
        pctOfCat: (num(r.sales) / totalSales) * 100, unitPctOfCat: (num(r.units) / totalUnits) * 100,
        avgSell: num(r.units) ? num(r.sales) / num(r.units) : 0,
      }));

      const k = kpiRes.rows[0] || {};
      const kpis = {
        revenue: num(k.rev_all), units: num(k.un_all), proposals: num(k.prop_all), dealers: num(k.deal_all),
        revenueYoY: yoy(num(k.rev_cur), num(k.rev_prev)),
        unitsYoY: yoy(num(k.un_cur), num(k.un_prev)),
        proposalsYoY: yoy(num(k.prop_cur), num(k.prop_prev)),
        dealersYoY: yoy(num(k.deal_cur), num(k.deal_prev)),
      };

      return {
        brandRows, itemRows, subcatRows,
        share: { labels: [], rows: brandRows, series: {} }, // TODO: real monthly share series
        kpis,
        submitted: [], accepted: [], won: [], lost: [],     // TODO: proposal funnel + displacement
      };
    });

    cache.set(key, { at: Date.now(), data: payload });
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
