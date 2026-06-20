import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getConnector } from "@/lib/data/connector";
import { DASHBOARDS } from "@/lib/dashboards";
import { Card, SampleBadge } from "@/components/ui";

export default function DashboardsPage({ searchParams }: { searchParams: { vendor?: string } }) {
  const session = getSession()!;
  const isAdmin = session.role === "admin";
  const conn = getConnector();
  const vendorId = isAdmin ? searchParams.vendor || conn.listVendors()[0].id : session.vendorId!;

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>Dashboards</h1>
          <p>Interactive, tenant-scoped reporting. Filter by date, region, and product category.</p>
        </div>
        <SampleBadge />
      </div>
      <div className="grid cols-3">
        {DASHBOARDS.map((d) => (
          <Link key={d.id} href={isAdmin ? `/dashboards/${d.id}?vendor=${vendorId}` : `/dashboards/${d.id}`}>
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
