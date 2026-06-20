import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getConnector } from "@/lib/data/connector";
import NavLinks from "@/components/nav-links";

export default function AppLayout({ children }: { children: ReactNode }) {
  const session = getSession();
  if (!session) redirect("/login");

  const scopeLabel =
    session.role === "admin"
      ? "Portal Admin · all brands"
      : getConnector().getVendor(session.vendorId || "")?.name || "Your brand";

  const initials = session.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">P</div>
          <div>
            <div className="brand-name">Portal</div>
            <div className="brand-sub">Vendor Insights</div>
          </div>
        </div>
        <NavLinks role={session.role} />
        <div className="foot">
          MVP prototype · sample data
          <br />
          Periscope replacement
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <b>Vendor Insights</b> &nbsp;·&nbsp; performance analytics for the Portal network
          </div>
          <div className="usermenu">
            <span className={`scope-pill ${session.role === "admin" ? "admin" : ""}`}>{scopeLabel}</span>
            <div className="avatar" title={`${session.name} (${session.email})`}>
              {initials}
            </div>
            <a className="btn" href="/api/auth/logout">
              Sign out
            </a>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
