import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getConnector } from "@/lib/data/connector";
import type { Filters as FilterType } from "@/lib/data/seed";
import { getDashboard } from "@/lib/dashboards";
import Filters from "@/components/Filters";
import { Card, KpiCard, SampleBadge } from "@/components/ui";
import {
  CategoryBarChart,
  RegionBarChart,
  RevenueTrendChart,
  ShareIndexChart,
} from "@/components/charts";
import { fmtCompact, fmtCurrency, fmtNumber } from "@/lib/format";

interface SP {
  vendor?: string;
  start?: string;
  end?: string;
  regions?: string;
  categories?: string;
  agg?: string;
}

export default function DashboardPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SP;
}) {
  const dash = getDashboard(params.id);
  if (!dash) notFound();

  const session = getSession()!;
  const conn = getConnector();
  const isAdmin = session.role === "admin";

  // Tenant security: vendor users are ALWAYS scoped to their own brand.
  // Only Portal admins may inspect another brand via ?vendor=.
  const vendorId = isAdmin ? searchParams.vendor || conn.listVendors()[0].id : session.vendorId!;
  const vendor = conn.getVendor(vendorId);
  if (!vendor) notFound();

  const filters: FilterType = {
    vendorId,
    start: searchParams.start,
    end: searchParams.end,
    regions: searchParams.regions ? searchParams.regions.split(",").filter(Boolean) : undefined,
    categories: searchParams.categories ? searchParams.categories.split(",").filter(Boolean) : undefined,
    aggregation: searchParams.agg === "quarterly" ? "quarterly" : "monthly",
  };

  // Build the export query string from the active filters.
  const qs = new URLSearchParams();
  qs.set("dashboard", dash.id);
  for (const [k, v] of Object.entries(searchParams)) if (v) qs.set(k, String(v));

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>{dash.name}</h1>
          <p>
            {dash.description} {isAdmin && <span className="muted">· viewing {vendor.name}</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <SampleBadge />
          <a className="btn" href={`/api/export?${qs.toString()}&format=csv`}>
            ⬇ Export CSV
          </a>
          <a className="btn primary" href={`/api/export?${qs.toString()}&format=report`}>
            Pull report
          </a>
        </div>
      </div>

      <Filters vendors={isAdmin ? conn.listVendors().map((v) => ({ id: v.id, name: v.name })) : undefined} />

      {/* KPI row, shown whenever the dashboard includes the kpis widget */}
      {dash.widgets.includes("kpis") &&
        (() => {
          const k = conn.getKpis(filters);
          return (
            <div className="grid cols-4" style={{ marginBottom: 16 }}>
              <KpiCard label="Revenue" value={fmtCompact(k.revenue)} deltaPct={k.revenueDeltaPct} />
              <KpiCard label="Units sold" value={fmtNumber(k.units)} hint="in selected period" />
              <KpiCard label="Active dealers" value={fmtNumber(k.activeDealers)} hint="selling your products" />
              <KpiCard label="Category index" value={String(Math.round(k.categoryIndex))} hint="100 = category average" />
            </div>
          );
        })()}

      <div className="grid cols-2">
        {dash.widgets
          .filter((w) => w !== "kpis")
          .map((w) => {
            switch (w) {
              case "revenueTrend": {
                const t = conn.getRevenueTrend(filters);
                return (
                  <Card key={w} className="span-2" title="Revenue trend" sub={`By ${filters.aggregation} period`}>
                    <RevenueTrendChart data={t.map((p) => ({ label: p.label, revenue: p.revenue, units: p.units }))} />
                  </Card>
                );
              }
              case "shareVsCategory": {
                const s = conn.getShareVsCategory(filters);
                return (
                  <Card key={w} className="span-2" title="Competitive index vs category" sub="Your revenue indexed to the average brand in your category (100 = parity)">
                    <ShareIndexChart data={s.map((p) => ({ label: p.label, index: p.index, brandRevenue: p.brandRevenue, categoryAvg: p.categoryAvg }))} />
                  </Card>
                );
              }
              case "categoryBreakdown": {
                const c = conn.getCategoryBreakdown(filters);
                return (
                  <Card key={w} title="Revenue by category" sub="Across selected period">
                    <CategoryBarChart data={c.map((x) => ({ category: x.category, revenue: x.revenue }))} />
                  </Card>
                );
              }
              case "regionBreakdown": {
                const r = conn.getRegionBreakdown(filters);
                return (
                  <Card key={w} title="Revenue by region">
                    <RegionBarChart data={r} />
                  </Card>
                );
              }
              case "topDealers": {
                const d = conn.getTopDealers(filters, 10);
                const max = Math.max(...d.map((x) => x.revenue), 1);
                return (
                  <Card key={w} className="span-2" title="Top dealers" sub="Integrators selling the most of your products">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Dealer</th>
                          <th>Region</th>
                          <th className="num">Proposals</th>
                          <th className="num" style={{ width: 220 }}>
                            Revenue
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.map((row) => (
                          <tr key={row.dealer}>
                            <td>{row.dealer}</td>
                            <td className="muted">{row.region}</td>
                            <td className="num">{fmtNumber(row.proposals)}</td>
                            <td className="num bar-cell">
                              <span className="fill" style={{ width: `${(row.revenue / max) * 100}%` }} />
                              <span>{fmtCurrency(row.revenue)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                );
              }
              default:
                return null;
            }
          })}
      </div>
    </>
  );
}
