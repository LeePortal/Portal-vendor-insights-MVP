/**
 * /api/brand-performance — tenant-scoped Brand Performance aggregates from Redshift.
 *
 * SCAFFOLD. Runs on Vercel Functions (or AWS Lambda). Returns the BrandPerfPayload shape
 * the Angular app expects (see src/app/core/brand-performance.contract.ts).
 *
 * Security model: the browser sends only filter *selections*. The caller's tenant (brand),
 * visible-brand allow-list and parent-category restriction come from the AUTHENTICATED
 * identity (resolveTenant), never from the request body. All SQL is parameterized.
 *
 * Setup (env / secrets — never in client code):
 *   AWS_REGION, REDSHIFT_WORKGROUP (or CLUSTER_ID), REDSHIFT_DATABASE, REDSHIFT_SECRET_ARN,
 *   FACT_TABLE (default analytics.proposal_parts)
 * Plus a dependency:  npm i @aws-sdk/client-redshift-data
 */
import { RedshiftDataClient, ExecuteStatementCommand, DescribeStatementCommand, GetStatementResultCommand } from "@aws-sdk/client-redshift-data";

const FACT = process.env.FACT_TABLE || "analytics.proposal_parts";
const rs = new RedshiftDataClient({ region: process.env.AWS_REGION });

// --- naive per-instance cache (swap for Vercel KV / Upstash in prod; data refreshes nightly) ---
const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 1000 * 60 * 60 * 3; // 3h

interface Tenant { brand: string; allowedBrands: string[]; allowedParents: string[]; }

// TODO: replace with real auth — verify the session/JWT and load the user's tenant + governance
// from your identity store (Portal SSO). Do NOT trust anything from the request for this.
function resolveTenant(_req: any): Tenant {
  // e.g. const claims = verifyJwt(req.headers.authorization);
  return { brand: "Sonos", allowedBrands: ["Sonos"], allowedParents: [] /* [] = all */ };
}

function reqFilters(req: any) {
  const q = req.query || {};
  const arr = (v: any) => (v ? String(v).split(",").filter(Boolean) : []);
  return { parents: arr(q.parents), subs: arr(q.subs), buyingGroups: arr(q.buyingGroups), states: arr(q.states) };
}

async function run(sql: string, params: { name: string; value: string }[]): Promise<Record<string, string>[]> {
  const started = await rs.send(new ExecuteStatementCommand({
    WorkgroupName: process.env.REDSHIFT_WORKGROUP, ClusterIdentifier: process.env.REDSHIFT_CLUSTER_ID,
    Database: process.env.REDSHIFT_DATABASE, SecretArn: process.env.REDSHIFT_SECRET_ARN,
    Sql: sql, Parameters: params.map((p) => ({ name: p.name, value: p.value })),
  }));
  const id = started.Id!;
  for (;;) {
    const d = await rs.send(new DescribeStatementCommand({ Id: id }));
    if (d.Status === "FINISHED") break;
    if (d.Status === "FAILED" || d.Status === "ABORTED") throw new Error("Redshift query " + d.Status + ": " + d.Error);
    await new Promise((r) => setTimeout(r, 250));
  }
  const out = await rs.send(new GetStatementResultCommand({ Id: id }));
  const cols = (out.ColumnMetadata || []).map((c) => c.name || "");
  return (out.Records || []).map((row) => Object.fromEntries(row.map((cell, i) => [cols[i], cell.stringValue ?? String(cell.longValue ?? cell.doubleValue ?? "")])));
}

/** Tenant-scoped WHERE: server-applied brand allow-list + parent restriction + request filters. */
function scope(t: Tenant, f: ReturnType<typeof reqFilters>) {
  const where: string[] = [];
  const params: { name: string; value: string }[] = [];
  if (t.allowedBrands.length) { where.push("brand = ANY(:brands)"); params.push({ name: "brands", value: "{" + t.allowedBrands.join(",") + "}" }); }
  const parents = t.allowedParents.length ? f.parents.filter((p) => t.allowedParents.includes(p)) : f.parents;
  if (t.allowedParents.length) { where.push("parentcat = ANY(:aparents)"); params.push({ name: "aparents", value: "{" + t.allowedParents.join(",") + "}" }); }
  if (parents.length) { where.push("parentcat = ANY(:parents)"); params.push({ name: "parents", value: "{" + parents.join(",") + "}" }); }
  if (f.states.length) { where.push("state = ANY(:states)"); params.push({ name: "states", value: "{" + f.states.join(",") + "}" }); }
  return { clause: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

export default async function handler(req: any, res: any) {
  try {
    const tenant = resolveTenant(req);
    const f = reqFilters(req);
    const key = JSON.stringify({ tenant, f });
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return res.status(200).json(hit.data);

    const s = scope(tenant, f);

    // Brand share of the (tenant-visible) category. Other payload sections follow the same
    // pattern — full SQL for share-series, proposals and displacement is in
    // 04_Redshift_Live_Data_(Brand_Performance).md.
    const brandRows = (await run(
      `SELECT brand,
              SUM(total_sell)                AS sales,
              SUM(quantity)                  AS units,
              COUNT(DISTINCT model)          AS skus
       FROM ${FACT} ${s.clause}
       GROUP BY brand
       ORDER BY sales DESC`,
      s.params,
    )).map((r) => ({ brand: r.brand, sales: +r.sales, units: +r.units, skus: +r.skus, sharePct: 0, unitSharePct: 0, avgSell: +r.units ? +r.sales / +r.units : 0 }));
    const totalSales = brandRows.reduce((a, b) => a + b.sales, 0) || 1;
    const totalUnits = brandRows.reduce((a, b) => a + b.units, 0) || 1;
    brandRows.forEach((b) => { b.sharePct = (b.sales / totalSales) * 100; b.unitSharePct = (b.units / totalUnits) * 100; });

    const payload = {
      brandRows,
      itemRows: [],   // TODO: SELECT brand, model, ... GROUP BY brand, model  (see doc)
      subcatRows: [], // TODO: GROUP BY subcat
      share: { labels: [], rows: brandRows, series: {} }, // TODO: date-bucketed share series
      kpis: { revenue: brandRows.find((b) => b.brand === tenant.brand)?.sales || 0, units: 0, proposals: 0, dealers: 0, revenueYoY: 0, unitsYoY: 0, proposalsYoY: 0, dealersYoY: 0 },
      submitted: [], accepted: [], won: [], lost: [], // TODO: proposal funnel/value + displacement (see doc)
    };

    cache.set(key, { at: Date.now(), data: payload });
    res.status(200).json(payload);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
