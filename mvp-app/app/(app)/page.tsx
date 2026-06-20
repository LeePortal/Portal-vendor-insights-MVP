import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getConnector } from "@/lib/data/connector";
import { defaultRange } from "@/lib/data/seed";
import { DASHBOARDS } from "@/lib/dashboards";
import { getSummary } from "@/lib/analytics/events";
import { Card, KpiCard, SampleBadge } from "@/components/ui";
import { fmtCompact, fmtNumber } from "@/lib/format";

export default function HomePage() {
  const session = getSession()!;
  const conn = getConnector();
  const isAdmin = session.role === "admin";

  const previewVendorId = isAdmin ? conn.listVendors()[0].id : session.vendorId!;
  const vendor = conn.getVendor(previewVendorId)!;
  const range = defaultRange();
  const kpis = conn.getKpis({ vendorId: previewVendorId, start: range.start, end: range.end });

  const summary = getSummary(30);

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>{isAdmin ? "Portal Vendor Insights" : `Welcome, ${vendor.name}`}</h1>
          <p>
            {isAdmin
              ? "Internal staff view. Track brand engagement in Portal View, or open any brand's dashboards below."
              : "Your brand's performance across the Portal network of professional integrators."}
          </p>
        </div>
        <SampleBadge />
      </div>

      {isAdmin ? (
        <div className="grid cols-4" style={{ marginBottom: 22 }}>
          <KpiCard label="Logins (30d)" value={fmtNumber(summary.totalLogins)} hint="across all brands" />
          <KpiCard label="Active brands (30d)" value={fmtNumber(summary.activeVendors)} hint="signed in at least once" />
          <KpiCard label="Reports pulled (30d)" value={fmtNumber(summary.reportsPulled)} hint="dashboard + scheduled" />
          <KpiCard label="CSV extracts (30d)" value={fmtNumber(summary.csvExports)} hint="data downloads" />
        </div>
      ) : (
        <div className="grid cols-4" style={{ marginBottom: 22 }}>
          <KpiCard label="Revenue (12 mo)" value={fmtCompact(kpis.revenue)} deltaPct={kpis.revenueDeltaPct} />
          <KpiCard label="Units sold" value={fmtNumber(kpis.units)} hint="trailing 12 months" />
          <KpiCard label="Proposals incl. your products" value={fmtNumber(kpis.proposals)} hint="trailing 12 months" />
          <KpiCard label="Category index" value={String(Math.round(kpis.categoryIndex))} hint="100 = category average" />
        </div>
      )}

      {isAdmin && (
        <div style={{ marginBottom: 22 }}>
          <Link className="btn primary" href="/admin">
            Open Portal View →
          </Link>
        </div>
      )}

      <div className="page-head">
        <h1 style={{ fontSize: 16 }}>{isAdmin ? "Browse brand dashboards" : "Your dashboards"}</h1>
      </div>
      <div className="grid cols-3">
        {DASHBOARDS.map((d) => (
          <Link key={d.id} href={isAdmin ? `/dashboards/${d.id}?vendor=${previewVendorId}` : `/dashboards/${d.id}`}>
            <Card title={d.name} sub={`${d.widgets.length} widgets`}>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {d.description}
              </p>
              <div style={{ marginTop: 12, color: "var(--accent)", fontWeight: 600, fontSize: 13 }}>Open dashboard →</div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
