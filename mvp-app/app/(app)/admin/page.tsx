import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getActivityByDay,
  getRecentEvents,
  getSummary,
  getTopDashboards,
  getVendorEngagement,
} from "@/lib/analytics/events";
import { AdminActivityChart, TopDashboardsBar } from "@/components/charts";
import { Card, KpiCard } from "@/components/ui";
import { fmtDate, fmtNumber, relativeTime } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  login: "Login",
  dashboard_view: "Viewed",
  report_pull: "Report",
  csv_export: "CSV",
};

export default function AdminPage() {
  const session = getSession()!;
  if (session.role !== "admin") redirect("/");

  const days = 30;
  const summary = getSummary(days);
  const byDay = getActivityByDay(days);
  const topDash = getTopDashboards(days);
  const engagement = getVendorEngagement(days);
  const recent = getRecentEvents(14);

  return (
    <>
      <div className="page-head">
        <h1>Portal View — Vendor Engagement</h1>
        <p>
          How brands and manufacturers are using Vendor Insights. Last {days} days · first-party activity tracking
          (modeled on Periscope Usage Data).
        </p>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <KpiCard label="Total logins" value={fmtNumber(summary.totalLogins)} hint={`last ${days} days`} />
        <KpiCard label="Active brands" value={fmtNumber(summary.activeVendors)} hint="signed in ≥ 1 time" />
        <KpiCard label="Reports pulled" value={fmtNumber(summary.reportsPulled)} hint="on-demand + scheduled" />
        <KpiCard label="CSV extracts" value={fmtNumber(summary.csvExports)} hint="data downloads" />
      </div>
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <KpiCard label="Time on site" value={`${summary.timeOnSiteHours.toFixed(1)} h`} hint="total across all brands" />
        <KpiCard label="Avg session" value={`${summary.avgSessionMin.toFixed(1)} min`} hint="per dashboard view" />
      </div>

      <div className="grid cols-2">
        <Card className="span-2" title="Daily activity" sub="Logins (bars) and minutes on site (line)">
          <AdminActivityChart data={byDay} />
        </Card>

        <Card title="Most-viewed dashboards" sub="By number of views">
          <TopDashboardsBar data={topDash} />
        </Card>

        <Card title="Recent activity" sub="Live event feed">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recent.map((e) => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                  <span className={`tag-type t-${e.type}`}>{TYPE_LABEL[e.type]}</span>
                  <span style={{ fontWeight: 600 }}>{e.vendorName}</span>
                  {e.target && <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {e.target}</span>}
                </div>
                <span className="muted" title={fmtDate(e.ts)} style={{ flexShrink: 0 }}>
                  {relativeTime(e.ts)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="span-2" title="Brand engagement" sub="Per-brand usage over the period">
          <table className="tbl">
            <thead>
              <tr>
                <th>Brand</th>
                <th className="num">Logins</th>
                <th className="num">Dashboard views</th>
                <th className="num">Minutes on site</th>
                <th className="num">Reports</th>
                <th className="num">CSV extracts</th>
                <th className="num">Last active</th>
              </tr>
            </thead>
            <tbody>
              {engagement.map((v) => (
                <tr key={v.vendorId}>
                  <td style={{ fontWeight: 600 }}>{v.vendorName}</td>
                  <td className="num">{fmtNumber(v.logins)}</td>
                  <td className="num">{fmtNumber(v.views)}</td>
                  <td className="num">{fmtNumber(v.minutes)}</td>
                  <td className="num">{fmtNumber(v.reportsPulled)}</td>
                  <td className="num">{fmtNumber(v.csvExports)}</td>
                  <td className="num muted">{v.lastActive ? relativeTime(v.lastActive) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
