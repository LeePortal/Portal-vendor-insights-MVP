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
// Date Range lower bounds. Aggregation sets bucket granularity; Date Range sets the window. "All" = no bound.
const HORIZON_START = {
  MTD: "DATE_TRUNC('month', GETDATE())",
  QTD: "DATE_TRUNC('quarter', GETDATE())",
  YTD: "DATE_TRUNC('year', GETDATE())",
};

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
    statement_timeout: 50000,
    idleTimeoutMillis: 30000,
  });
  _pool.on("error", (err) => console.error("pg pool error:", (err && err.message) || err));
  return _pool;
}

// Dedicated pool for the heavier "extras" (displacement self-joins + proposal sections) with a
// SHORT statement_timeout so they fail fast and can never push the function past its time budget.
let _xpool = null;
function xpool() {
  if (_xpool) return _xpool;
  const { Pool } = require("pg");
  _xpool = new Pool({
    host: process.env.REDSHIFT_HOST,
    port: Number(process.env.REDSHIFT_PORT || 5439),
    database: process.env.REDSHIFT_DATABASE,
    user: process.env.REDSHIFT_USER,
    password: process.env.REDSHIFT_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 8000,
    statement_timeout: 18000,
    idleTimeoutMillis: 30000,
  });
  _xpool.on("error", (err) => console.error("pg xpool error:", (err && err.message) || err));
  return _xpool;
}

// TODO: replace with real auth — derive viewed brand from the verified session/JWT (Portal SSO).
function resolveTenant(_req) { return { brand: "Sonos", allowedParents: [] }; }

function reqFilters(req) {
  const q = req.query || {};
  const arr = (v) => (v ? String(v).split(",").filter(Boolean) : []);
  return { parents: arr(q.parents), subs: arr(q.subs), states: arr(q.states), statuses: arr(q.statuses), agg: String(q.agg || "monthly"), horizon: String(q.horizon || "YTD") };
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
    const u = AGG[agg].unit;
    const hz = ["MTD", "QTD", "YTD", "All"].includes(f.horizon) ? f.horizon : "YTD";
    const curStart = HORIZON_START[hz] || null; // null === "All" (no date lower bound)
    const whereH = curStart ? `${fb.where} AND submitted >= ${curStart}` : fb.where;
    const seriesWhere = `${fb.where} AND submitted IS NOT NULL` + (curStart ? ` AND submitted >= ${curStart}` : "");
    const kvals = fb.vals.slice(); kvals.push(tenant.brand);
    const bp = `$${kvals.length}`;

    // KPI window expressions: headline = the Date Range window (all-time for "All");
    // YoY compares that window to the same window one year earlier.
    const headSum = (m) => curStart ? `SUM(CASE WHEN submitted >= ${curStart} THEN ${m} ELSE 0 END)` : `SUM(${m})`;
    const headCnt = (c) => curStart ? `COUNT(DISTINCT CASE WHEN submitted >= ${curStart} THEN ${c} END)` : `COUNT(DISTINCT ${c})`;
    const curSum = (m) => curStart ? `SUM(CASE WHEN submitted >= ${curStart} THEN ${m} ELSE 0 END)` : `SUM(CASE WHEN submitted >= DATEADD(year,-1,GETDATE()) THEN ${m} ELSE 0 END)`;
    const prevSum = (m) => curStart ? `SUM(CASE WHEN submitted >= DATEADD(year,-1,${curStart}) AND submitted < DATEADD(year,-1,GETDATE()) THEN ${m} ELSE 0 END)` : `SUM(CASE WHEN submitted >= DATEADD(year,-2,GETDATE()) AND submitted < DATEADD(year,-1,GETDATE()) THEN ${m} ELSE 0 END)`;
    const curCnt = (c) => curStart ? `COUNT(DISTINCT CASE WHEN submitted >= ${curStart} THEN ${c} END)` : `COUNT(DISTINCT CASE WHEN submitted >= DATEADD(year,-1,GETDATE()) THEN ${c} END)`;
    const prevCnt = (c) => curStart ? `COUNT(DISTINCT CASE WHEN submitted >= DATEADD(year,-1,${curStart}) AND submitted < DATEADD(year,-1,GETDATE()) THEN ${c} END)` : `COUNT(DISTINCT CASE WHEN submitted >= DATEADD(year,-2,GETDATE()) AND submitted < DATEADD(year,-1,GETDATE()) THEN ${c} END)`;
    const p = pool();

    // run all five aggregates concurrently (separate pooled connections)
    const [brandRes, subRes, itemRes, seriesRes, kpiRes] = await Promise.all([
      p.query(
        `SELECT brand, SUM(total_sell) AS sales, SUM(quantity) AS units, COUNT(DISTINCT model) AS skus
         FROM ${FACT} WHERE ${whereH} GROUP BY brand ORDER BY sales DESC`, fb.vals),
      p.query(
        `SELECT subcat, SUM(total_sell) AS sales, SUM(quantity) AS units
         FROM ${FACT} WHERE ${whereH} GROUP BY subcat ORDER BY sales DESC`, fb.vals),
      p.query(
        `SELECT brand, model, LEFT(MAX(name), 90) AS name, SUM(total_sell) AS sales, SUM(quantity) AS units
         FROM ${FACT} WHERE ${whereH} GROUP BY brand, model ORDER BY sales DESC LIMIT 200`, fb.vals),
      p.query(
        `SELECT brand, DATE_TRUNC('${u}', submitted) AS period, SUM(total_sell) AS sales
         FROM ${FACT} WHERE ${seriesWhere}
         GROUP BY brand, DATE_TRUNC('${u}', submitted) ORDER BY period`, fb.vals),
      p.query(
        `SELECT ${headSum("total_sell")} AS rev_all, ${headSum("quantity")} AS un_all,
                ${headCnt("proposalid")} AS prop_all, ${headCnt("dealerid")} AS deal_all,
                ${curSum("total_sell")} AS rev_cur, ${prevSum("total_sell")} AS rev_prev,
                ${curSum("quantity")} AS un_cur, ${prevSum("quantity")} AS un_prev,
                ${curCnt("proposalid")} AS prop_cur, ${prevCnt("proposalid")} AS prop_prev,
                ${curCnt("dealerid")} AS deal_cur, ${prevCnt("dealerid")} AS deal_prev
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
    for (const b of brandRows.slice(0, 40)) {
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

    // --- "Extras": competitive displacement (brand swaps) + the two proposal funnel sections.
    //     Displacement = a removed item (deleted=true) sharing proposalid+area+parentcat with a
    //     surviving item (deleted=false) of a DIFFERENT brand. Proposal sections are stage-defined
    //     (ignore the status selector): Submitted = pipeline by submitted date; Accepted = closed-won
    //     by accepteddate. All run on the short-timeout pool and are fault-isolated — a failure here
    //     leaves these sections empty rather than breaking the core dashboard.
    let won = [], lost = [], submitted = [], accepted = [];
    try {
      const xp = xpool();
      // filter clause builder. alias '' = no prefix; withStatus only for displacement.
      const flt = (alias, start, withStatus) => {
        const w = [], v = [], a = alias ? alias + "." : "";
        const add = (col, list) => { if (list && list.length) { v.push(list); w.push(`${a}${col} = ANY($${start + v.length - 1})`); } };
        add("parentcat", f.parents); add("subcat", f.subs); add("state", f.states);
        if (withStatus) add("status", f.statuses);
        return { clause: w.length ? " AND " + w.join(" AND ") : "", vals: v };
      };
      const swapWin = (a) => (curStart ? ` AND ${a}.submitted >= ${curStart}` : "");
      const subWin = curStart ? ` AND submitted >= ${curStart}` : "";
      const accWin = curStart ? ` AND CAST(accepteddate AS DATE) >= ${curStart}` : "";
      const stCol = f.states.length ? ` AND state = ANY($1)` : "";
      const stVals = f.states.length ? [f.states] : [];
      const wB = flt("b", 2, true), lA = flt("a", 2, true), dA = flt("a", 2, true);
      const sF = flt("", 2, false), aF = flt("", 2, false);

      const [wonRes, lostRes, dispRes, subMain, subDen, accMain, accDen] = await Promise.all([
        xp.query(
          `WITH wi AS (SELECT b.proposalitemid, b.model, b.subcat, MAX(b.quantity) AS qty, MAX(b.total_sell) AS sell, COUNT(DISTINCT a.brand) AS comps
             FROM ${FACT} b JOIN ${FACT} a ON a.proposalid=b.proposalid AND a.area=b.area AND a.parentcat=b.parentcat AND a.deleted=true AND a.brand<>b.brand
             WHERE b.brand=$1 AND b.deleted=false${wB.clause}${swapWin("b")} GROUP BY b.proposalitemid, b.model, b.subcat)
           SELECT model, MAX(subcat) AS subcat, SUM(qty) AS units, SUM(sell) AS sales, SUM(comps) AS competitors_beaten FROM wi GROUP BY model ORDER BY units DESC LIMIT 12`,
          [tenant.brand, ...wB.vals]),
        xp.query(
          `WITH li AS (SELECT a.proposalitemid, a.model, a.parentcat, MAX(a.quantity) AS qty, MAX(a.total_sell) AS sell
             FROM ${FACT} a JOIN ${FACT} b ON a.proposalid=b.proposalid AND a.area=b.area AND a.parentcat=b.parentcat AND b.deleted=false AND b.brand<>a.brand
             WHERE a.brand=$1 AND a.deleted=true${lA.clause}${swapWin("a")} GROUP BY a.proposalitemid, a.model, a.parentcat)
           SELECT model, MAX(parentcat) AS subcat, SUM(qty) AS lost_units, SUM(sell) AS lost_sales FROM li GROUP BY model ORDER BY lost_units DESC LIMIT 12`,
          [tenant.brand, ...lA.vals]),
        xp.query(
          `SELECT a.model AS lost_model, b.brand AS disp_brand, b.model AS disp_model, SUM(b.quantity) AS units
           FROM ${FACT} a JOIN ${FACT} b ON a.proposalid=b.proposalid AND a.area=b.area AND a.parentcat=b.parentcat AND b.deleted=false AND b.brand<>a.brand
           WHERE a.brand=$1 AND a.deleted=true${dA.clause}${swapWin("a")} GROUP BY a.model, b.brand, b.model`,
          [tenant.brand, ...dA.vals]),
        xp.query(
          `SELECT DATE_TRUNC('${u}', submitted) AS period, SUM(total_sell) AS cat_value,
                  SUM(CASE WHEN brand=$1 THEN total_sell ELSE 0 END) AS brand_value,
                  COUNT(DISTINCT proposalid) AS cat_props,
                  COUNT(DISTINCT CASE WHEN brand=$1 THEN proposalid END) AS brand_props
           FROM ${FACT} WHERE deleted=false AND submitted IS NOT NULL${subWin}${sF.clause}
           GROUP BY DATE_TRUNC('${u}', submitted) ORDER BY period`,
          [tenant.brand, ...sF.vals]),
        xp.query(
          `SELECT DATE_TRUNC('${u}', submitted) AS period, COUNT(DISTINCT proposalid) AS all_props
           FROM ${FACT} WHERE deleted=false AND submitted IS NOT NULL${subWin}${stCol}
           GROUP BY DATE_TRUNC('${u}', submitted)`,
          stVals),
        xp.query(
          `SELECT DATE_TRUNC('${u}', CAST(accepteddate AS DATE)) AS period, SUM(total_sell) AS cat_value,
                  SUM(CASE WHEN brand=$1 THEN total_sell ELSE 0 END) AS brand_value,
                  COUNT(DISTINCT proposalid) AS cat_props,
                  COUNT(DISTINCT CASE WHEN brand=$1 THEN proposalid END) AS brand_props
           FROM ${FACT} WHERE deleted=false AND accepteddate IS NOT NULL AND closed_won_flag=true${accWin}${aF.clause}
           GROUP BY DATE_TRUNC('${u}', CAST(accepteddate AS DATE)) ORDER BY period`,
          [tenant.brand, ...aF.vals]),
        xp.query(
          `SELECT DATE_TRUNC('${u}', CAST(accepteddate AS DATE)) AS period, COUNT(DISTINCT proposalid) AS all_props
           FROM ${FACT} WHERE deleted=false AND accepteddate IS NOT NULL AND closed_won_flag=true${accWin}${stCol}
           GROUP BY DATE_TRUNC('${u}', CAST(accepteddate AS DATE))`,
          stVals),
      ]);

      won = wonRes.rows.map((r) => ({ model: r.model, desc: r.subcat || "", brand: tenant.brand, units: num(r.units), sales: num(r.sales), competitorsBeaten: num(r.competitors_beaten) }));
      const dispBy = new Map();
      for (const r of dispRes.rows) { if (!dispBy.has(r.lost_model)) dispBy.set(r.lost_model, []); dispBy.get(r.lost_model).push({ brand: r.disp_brand, model: r.disp_model, units: num(r.units) }); }
      lost = lostRes.rows.map((r) => ({ model: r.model, subcat: r.subcat || "", lostUnits: num(r.lost_units), lostSales: num(r.lost_sales), displacers: (dispBy.get(r.model) || []).sort((x, y) => y.units - x.units).slice(0, 6) }));

      const assemble = (rows, denomRows) => {
        const dm = new Map(); for (const r of denomRows) dm.set(pkey(r.period), num(r.all_props));
        const dn = (r) => dm.get(pkey(r.period)) || 0;
        const mk = (kind, catFn, brFn) => {
          const points = rows.map((r) => ({ label: fmtPeriod(r.period, agg), category: Math.round(catFn(r) * 100) / 100, brand: Math.round(brFn(r) * 100) / 100 }));
          const cats = points.map((pt) => pt.category);
          const total = kind === "pct" ? (cats.length ? cats[cats.length - 1] : 0) : kind === "avg" ? (cats.length ? cats.reduce((a, b) => a + b, 0) / cats.length : 0) : cats.reduce((a, b) => a + b, 0);
          const first = cats.length ? cats[0] : 0, last = cats.length ? cats[cats.length - 1] : 0;
          return { kind, points, total: Math.round(total * 100) / 100, yoy: first > 0 ? Math.round(((last - first) / first) * 100) : 0, hasBrand: true };
        };
        return [
          mk("value", (r) => num(r.cat_value), (r) => num(r.brand_value)),
          mk("count", (r) => num(r.cat_props), (r) => num(r.brand_props)),
          mk("pct", (r) => (dn(r) ? (num(r.cat_props) / dn(r)) * 100 : 0), (r) => (dn(r) ? (num(r.brand_props) / dn(r)) * 100 : 0)),
          mk("avg", (r) => (num(r.cat_props) ? num(r.cat_value) / num(r.cat_props) : 0), (r) => (num(r.brand_props) ? num(r.brand_value) / num(r.brand_props) : 0)),
        ];
      };
      submitted = assemble(subMain.rows, subDen.rows);
      accepted = assemble(accMain.rows, accDen.rows);
    } catch (e) {
      console.error("extras (displacement/proposals) error:", (e && e.message) || e);
      won = []; lost = []; submitted = []; accepted = [];
    }

    const payload = {
      brandRows, itemRows, subcatRows,
      share: { labels, rows: brandRows, series },
      kpis,
      submitted, accepted, won, lost,
    };
    cache.set(key, { at: Date.now(), data: payload });
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
