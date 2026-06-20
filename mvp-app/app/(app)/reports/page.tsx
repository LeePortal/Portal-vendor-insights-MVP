import { getSession } from "@/lib/auth";
import { getConnector } from "@/lib/data/connector";
import { DASHBOARDS } from "@/lib/dashboards";
import { Card, SampleBadge } from "@/components/ui";

export default function ReportsPage({ searchParams }: { searchParams: { vendor?: string } }) {
  const session = getSession()!;
  const isAdmin = session.role === "admin";
  const conn = getConnector();
  const vendorId = isAdmin ? searchParams.vendor || conn.listVendors()[0].id : session.vendorId!;

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>Reports</h1>
          <p>Download a snapshot of any dashboard as CSV, or pull a packaged report.</p>
        </div>
        <SampleBadge />
      </div>

      <Card title="Available reports" sub="Exports respect your access scope — you only ever receive your own brand's data.">
        <table className="tbl">
          <thead>
            <tr>
              <th>Report</th>
              <th>Contents</th>
              <th className="num" style={{ width: 220 }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {DASHBOARDS.map((d) => {
              const base = `/api/export?dashboard=${d.id}${isAdmin ? `&vendor=${vendorId}` : ""}`;
              return (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.name}</td>
                  <td className="muted">{d.description}</td>
                  <td className="num">
                    <a className="btn" href={`${base}&format=csv`} style={{ marginRight: 6 }}>
                      ⬇ CSV
                    </a>
                    <a className="btn primary" href={`${base}&format=report`}>
                      Pull report
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <Card title="Scheduled email reports" sub="Periscope parity — planned for the production build">
          <p className="muted" style={{ marginTop: 0 }}>
            In the live platform, vendors will be able to subscribe to a recurring PDF/CSV of any dashboard, delivered on
            a schedule. This mirrors Periscope&apos;s Scheduled Reports and is logged the same way as on-demand pulls.
          </p>
        </Card>
        <Card title="How exports are tracked" sub="Every download is recorded">
          <p className="muted" style={{ marginTop: 0 }}>
            Each CSV download and report pull writes a first-party activity event (who, which brand, which dashboard,
            when). Portal staff can see this in <b>Portal View</b> — the same usage signals Periscope captures in its
            Usage Data, but on our own platform.
          </p>
        </Card>
      </div>
    </>
  );
}
