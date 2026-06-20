import { getSession } from "@/lib/auth";
import { getConnector } from "@/lib/data/connector";
import type { Filters } from "@/lib/data/seed";
import { getDashboard } from "@/lib/dashboards";
import { logEvent } from "@/lib/analytics/events";

export async function GET(req: Request) {
  const session = getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const dashId = url.searchParams.get("dashboard") || "overview";
  const format = url.searchParams.get("format") === "report" ? "report" : "csv";
  const dash = getDashboard(dashId);
  const conn = getConnector();

  // Tenant security: vendor users export ONLY their own brand's data.
  const vendorId =
    session.role === "admin"
      ? url.searchParams.get("vendor") || conn.listVendors()[0].id
      : session.vendorId!;
  const vendor = conn.getVendor(vendorId);
  if (!vendor) return new Response("Not found", { status: 404 });

  const filters: Filters = {
    vendorId,
    start: url.searchParams.get("start") || undefined,
    end: url.searchParams.get("end") || undefined,
    regions: url.searchParams.get("regions")?.split(",").filter(Boolean),
    categories: url.searchParams.get("categories")?.split(",").filter(Boolean),
    aggregation: url.searchParams.get("agg") === "quarterly" ? "quarterly" : "monthly",
  };

  const kpis = conn.getKpis(filters);
  const categories = conn.getCategoryBreakdown(filters);
  const trend = conn.getRevenueTrend(filters);

  const lines: string[] = [];
  lines.push(`Portal Vendor Insights export`);
  lines.push(`Brand,${vendor.name}`);
  lines.push(`Dashboard,${dash?.name || dashId}`);
  lines.push(`Period,${filters.start || "default"} to ${filters.end || "default"}`);
  lines.push("");
  lines.push("KPI,Value");
  lines.push(`Revenue,${Math.round(kpis.revenue)}`);
  lines.push(`Units,${kpis.units}`);
  lines.push(`Proposals,${kpis.proposals}`);
  lines.push(`Active dealers,${kpis.activeDealers}`);
  lines.push(`Category index,${Math.round(kpis.categoryIndex)}`);
  lines.push("");
  lines.push("Category,Revenue,Units,Proposals");
  for (const c of categories) lines.push(`${c.category},${Math.round(c.revenue)},${c.units},${c.proposals}`);
  lines.push("");
  lines.push("Period,Revenue,Units,Proposals");
  for (const t of trend) lines.push(`${t.label},${Math.round(t.revenue)},${t.units},${t.proposals}`);

  // First-party activity logging.
  logEvent({
    vendorId,
    vendorName: vendor.name,
    userEmail: session.email,
    type: format === "report" ? "report_pull" : "csv_export",
    target: dash?.name || dashId,
  });

  const filename = `${vendor.id}-${dashId}-${format}.csv`;
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
