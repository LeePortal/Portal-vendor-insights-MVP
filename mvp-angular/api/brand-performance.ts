/**
 * /api/brand-performance — tenant-scoped Brand Performance aggregates from Redshift.
 *
 * SCAFFOLD. Runs on Vercel Functions. Returns the BrandPerfPayload shape the Angular app
 * expects (see src/app/core/brand-performance.contract.ts).
 *
 * Connection: a DIRECT Postgres-protocol connection to Redshift (the same kind Deepnote uses).
 * Reuses your existing read-only DB credentials. All values come from Vercel env vars — never
 * in client code:
 *   REDSHIFT_HOST, REDSHIFT_PORT (default 5439), REDSHIFT_DATABASE, REDSHIFT_USER,
 *   REDSHIFT_PASSWORD, FACT_TABLE (default analytics.proposal_parts)
 *
 * Network note: Vercel must be allowed to reach the Redshift endpoint (security-group inbound
 * on the DB port). If the first live test times out, that's the firewall — ask the dev team
 * to allow it.
 *
 * Security model: the browser sends only filter *selections*. The caller's tenant (brand),
 * visible-brand allow-list and parent-category restriction come from the AUTHENTICATED
 * identity (resolveTenant), never from the request. All SQL is parameterized.
 */
// pg is loaded dynamically inside the handler (see loadClient) so a missing/failed module
// surfaces as a readable JSON error instead of crashing the whole function at load time.
const FACT = process.env.FACT_TABLE || "analytics.proposal_parts";

// --- naive per-instance cache (swap for Vercel KV in prod; data refreshes nightly) ---
const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 1000 * 60 * 60 * 3; // 3h

interface Tenant { brand: string; allowedBrands: string[]; allowedParents: string[]; }

// TODO: replace with real auth — verify the session/JWT and load the user's tenant + governance
// from your identity store (Portal SSO). Do NOT trust anything from the request for this.
function resolveTenant(_req: any): Tenant {
  return { brand: "Sonos", allowedBrands: ["Sonos"], allowedParents: [] /* [] = all */ };
}

function reqFilters(req: any) {
  const q = req.query || {};
  const arr = (v: any) => (v ? String(v).split(",").filter(Boolean) : []);
  return { parents: arr(q.parents), subs: arr(q.subs), buyingGroups: arr(q.buyingGroups), states: arr(q.states) };
}

/** Tenant-scoped WHERE with $n placeholders: server-applied brand allow-list + parent restriction + request filters. */
function scope(t: Tenant, f: ReturnType<typeof reqFilters>) {
  const where: string[] = [];
  const vals: any[] = [];
  const add = (cond: (i: number) => string, v: any) => { vals.push(v); where.push(cond(vals.length)); };
  if (t.allowedBrands.length) add((i) => `brand = ANY($${i})`, t.allowedBrands);
  if (t.allowedParents.length) add((i) => `parentcat = ANY($${i})`, t.allowedParents);
  const parents = t.allowedParents.length ? f.parents.filter((p) => t.allowedParents.includes(p)) : f.parents;
  if (parents.length) add((i) => `parentcat = ANY($${i})`, parents);
  if (f.states.length) add((i) => `state = ANY($${i})`, f.states);
  return { clause: where.length ? "WHERE " + where.join(" AND ") : "", vals };
}

async function loadClientCtor(): Promise<any> {
  try {
    const pg: any = await import("pg");
    return pg.Client || pg.default?.Client;
  } catch (e: any) {
    throw new Error("Could not load 'pg' module — it is likely not installed in the deployment. " + (e?.message || e));
  }
}

async function withClient<T>(fn: (c: any) => Promise<T>): Promise<T> {
  const Client = await loadClientCtor();
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
  // Without an 'error' listener, an async socket error (e.g. a firewall RST) crashes the whole
  // function (FUNCTION_INVOCATION_FAILED) instead of surfacing as a catchable rejection.
  c.on("error", (err) => console.error("pg client error:", err?.message || err));
  try {
    await c.connect();
    return await fn(c);
  } finally {
    try { await c.end(); } catch { /* ignore */ }
  }
}

export default async function handler(req: any, res: any) {
  try {
    const missing = ["REDSHIFT_HOST", "REDSHIFT_DATABASE", "REDSHIFT_USER", "REDSHIFT_PASSWORD"].filter((k) => !process.env[k]);
    if (missing.length) return res.status(500).json({ error: "Missing environment variables: " + missing.join(", ") });

    const tenant = resolveTenant(req);
    const f = reqFilters(req);
    const key = JSON.stringify({ tenant, f });
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return res.status(200).json(hit.data);

    const s = scope(tenant, f);

    // Brand share of the (tenant-visible) category. Other payload sections follow the same
    // pattern — full SQL for item/subcat/share-series/proposals/displacement is in
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
      const brandRows = br.rows.map((r: any) => ({
        brand: r.brand, sales: +r.sales, units: +r.units, skus: +r.skus,
        sharePct: 0, unitSharePct: 0, avgSell: +r.units ? +r.sales / +r.units : 0,
      }));
      const totalSales = brandRows.reduce((a, b) => a + b.sales, 0) || 1;
      const totalUnits = brandRows.reduce((a, b) => a + b.units, 0) || 1;
      brandRows.forEach((b) => { b.sharePct = (b.sales / totalSales) * 100; b.unitSharePct = (b.units / totalUnits) * 100; });

      return {
        brandRows,
        itemRows: [],   // TODO: GROUP BY brand, model  (see doc)
        subcatRows: [], // TODO: GROUP BY subcat
        share: { labels: [], rows: brandRows, series: {} }, // TODO: date-bucketed share series
        kpis: { revenue: brandRows.find((b) => b.brand === tenant.brand)?.sales || 0, units: 0, proposals: 0, dealers: 0, revenueYoY: 0, unitsYoY: 0, proposalsYoY: 0, dealersYoY: 0 },
        submitted: [], accepted: [], won: [], lost: [], // TODO: proposal funnel/value + displacement (see doc)
      };
    });

    cache.set(key, { at: Date.now(), data: payload });
    res.status(200).json(payload);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
