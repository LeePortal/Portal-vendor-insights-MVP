/**
 * /api/brand-performance — Brand Performance Overview from live Redshift data.
 *
 * Plain CommonJS (not TypeScript) on purpose: the Angular tsconfig (module ES2022 / bundler)
 * makes Vercel mis-load a .ts function.
 *
 * Returns the BrandPerfPayload shape the app expects (src/app/core/brand-performance.contract.ts).
 *
 * PERFORMANCE: the 5 aggregate queries run IN PARALLEL on a reused connection pool, so a cold
 * (uncached) query set finishes within the serverless time limit. statement_timeout caps each.
 *
 * DATA SEMANTICS (unfiltered base): only non-user exclusion is `deleted = false`. NO normalization,
 * NO status restriction unless the user picks statuses. User filters: parent/sub/state/status.
 * Competitive model: category-wide brand AGGREGATES only (never competitors' raw line-item detail).
 *
 * LIVE: brand share, sub-categories, items, KPIs (+ real YoY), share-over-time trend, status filter.
 * TODO (needs Portal metric definitions): proposal funnel/value, win/loss displacement.
 *
 * Env: REDSHIFT_HOST, REDSHIFT_PORT(5439), REDSHIFT_DATABASE, REDSHIFT_USER, REDSHIFT_PASSWORD,
 *      FACT_TABLE (e.g. public.portal_mi_data_for_redshift)
 */
const FACT = process.env.FACT_TABLE || "public.portal_mi_data_for_redshift";

const cache = new Map();
const TTL_MS = 1000 * 60 * 60 * 3; // 3h

const AGG = {
  daily: { unit: "day", n: 90 },
  weekly: { unit: "week", n: 26 },
  monthly: { unit: "month", n: 12 },
  quarterly: { unit: "quarter", n: 8 },
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Reused across warm invocations so we don't reconnect to Redshift every request.
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
    max: 8,
    connectionTimeoutMillis: 8000,
    statement_timeout: 9000,
    idleTimeoutMillis: 30000,
  });
  _pool.on("error", (err) => console.error("pg pool error:", (err && err.message) || err));
  return _pool;
}

// TODO: replace with real auth — derive viewed brand from the verified session/JWT (Portal SSO).
function resolveTenant(_req) { return { brand: "Sonos", allowedParents: [] }; }

function reqFilters(req) {
  const q = req.query || {};
  const arr = (v) => (v ? String(v).split(",").filter(Boolean) : []);
  return { parents: arr(q.parents), subs: arr(q.subs), states: arr(q.states), statuses: arr(q.statuses), agg: String(q.agg || "monthly") };
}

/** Category-wide WHERE: deleted hygiene + user/governance category, state, status filters. */
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
  add("status", f.statuses, null); // empty = all statuses (unfiltered)
  return { where: where.join(" AND "), vals };
}

const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const yoy = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : 0);
const pkey = (v) => (v instanceof Date ? v.toISOString() : String(v));
function fmtPeriod(v, agg) {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return String(v);
  const yy = "'" + String(d.getUTCFullYear()).slice(2);
  if (agg === "quarterly") return "Q" + (Math.floor(d.getUTCMonth() / 3) + 1) + " " + yy;
  if (agg === "monthly") return MONTHS[d.getUTCMonth()] + " " + yy;
  return (d.getUTCMonth() + 1) + "/" + d.getUTCDate();
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const missing = ["REDSHIFT_HOST", "REDSHIFT_DATABASE", "REDSHIFT_USER", "REDSHIFT_PASSWORD"].filter((k) => !process.env[k]);
    if (missing.length) return res.status(500).json({ error: "Missing environment variables: " + missing.join(", ") });

    const tenant = resolveTenant(req);
    const f = reqFilters(req);
    const agg = AGG[f.agg] ? f.agg : "monthly";
    const key = JSON.stringify({ tenant, f, agg });
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return res.status(200).json(hit.data);

    const fb = baseFilter(tenant, f);
    const u = AGG[agg].unit, n = AGG[agg].n;
    const kvals = fb.vals.slice(); kvals.push(tenant.brand);
    const bp = `$${kvals.length}`;
    const p = pool();

    // run all five aggregates concurrently (separate pooled connections)
    const [brandRes, subRes, itemRes, seriesRes, kpiRes] = await Promise.all([
      p.query(
        `SELECT brand, SUM(total_sell) AS sales, SUM(quantity) AS units, COUNT(DISTINCT model) AS skus
         FROM ${FACT} WHERE ${fb.where} GROUP BY brand ORDER BY sales DESC`, fb.vals),
      p.query(
        `SELECT subcat, SUM(total_sell) AS sales, SUM(quantity) AS units
         FROM ${FACT} WHERE ${fb.where} GROUP BY subcat ORDER BY sales DESC`, fb.vals),
      p.query(
        `SELECT brand, model, LEFT(MAX(name), 90) AS name, SUM(total_sell) AS sales, SUM(quantity) AS units
         FROM ${FACT} WHERE ${fb.where} GROUP BY brand, model ORDER BY sales DESC LIMIT 200`, fb.vals),
      p.query(
        `SELECT brand, DATE_TRUNC('${u}', submitted) AS period, SUM(total_sell) AS sales
         FROM ${FACT} WHERE ${fb.where} AND submitted >= DATEADD(${u}, -${n}, GETDATE())
         GROUP BY brand, DATE_TRUNC('${u}', submitted) ORDER BY period`, fb.vals),
      p.query(
        `SELECT SUM(total_sell) AS rev_all, SUM(quantity) AS un_all,
                COUNT(DISTINCT proposalid) AS prop_all, COUNT(DISTINCT dealerid) AS deal_all,
                SUM(CASE WHEN submitted >= DATEADD(year,-1,GETDATE()) THEN total_sell ELSE 0 END) AS rev_cur,
                SUM(CASE WHEN submitted >= DATEADD(year,-2,GETDATE()) AND submitted < DATEADD(year,-1,GETDATE()) THEN total_sell ELSE 0 END) AS rev_prev,
                SUM(CASE WHEN submitted >= DATEADD(year,-1,GETDATE()) THEN quantity ELSE 0 END) AS un_cur,
                SUM(CASE WHEN submitted >= DATEADD(year,-2,GETDATE()) AND submitted < DATEADD(year,-1,GETDATE()) THEN quantity ELSE 0 END) AS un_prev,
                COUNT(DISTINCT CASE WHEN submitted >= DATEADD(year,-1,GETDATE()) THEN proposalid END) AS prop_cur,
                COUNT(DISTINCT CASE WHEN submitted >= DATEADD(year,-2,GETDATE()) AND submitted < DATEADD(year,-1,GETDATE()) THEN proposalid END) AS prop_prev,
                COUNT(DISTINCT CASE WHEN submitted >= DATEADD(year,-1,GETDATE()) THEN dealerid END) AS deal_cur,
                COUNT(DISTINCT CASE WHEN submitted >= DATEADD(year,-2,GETDATE()) AND submitted < DATEADD(year,-1,GETDATE()) THEN dealerid END) AS deal_prev
         FROM ${FACT} WHERE ${fb.where} AND brand = ${bp}`, kvals),
    ]);

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

    const periodsMap = new Map();
    const cell = new Map();
    for (const r of seriesRes.rows) {
      const k = pkey(r.period);
      if (!periodsMap.has(k)) periodsMap.set(k, { date: r.period, total: 0 });
      periodsMap.get(k).total += num(r.sales);
      cell.set(r.brand + "|" + k, num(r.sales));
    }
    const periodKeys = [...periodsMap.keys()].sort();
    const labels = periodKeys.map((k) => fmtPeriod(periodsMap.get(k).date, agg));
    const series = {};
    for (const b of brandRows) {
      series[b.brand] = periodKeys.map((k) => {
        const tot = periodsMap.get(k).total || 1;
        return Math.round(((cell.get(b.brand + "|" + k) || 0) / tot) * 10000) / 100;
      });
    }

    const k = kpiRes.rows[0] || {};
    const kpis = {
      revenue: num(k.rev_all), units: num(k.un_all), proposals: num(k.prop_all), dealers: num(k.deal_all),
      revenueYoY: yoy(num(k.rev_cur), num(k.rev_prev)),
      unitsYoY: yoy(num(k.un_cur), num(k.un_prev)),
      proposalsYoY: yoy(num(k.prop_cur), num(k.prop_prev)),
      dealersYoY: yoy(num(k.deal_cur), num(k.deal_prev)),
    };

    const payload = {
      brandRows, itemRows, subcatRows,
      share: { labels, rows: brandRows, series },
      kpis,
      submitted: [], accepted: [], won: [], lost: [],
    };
    cache.set(key, { at: Date.now(), data: payload });
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
