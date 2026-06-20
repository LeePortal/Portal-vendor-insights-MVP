"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const VENDOR_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/dashboards", label: "Dashboards", icon: "▦" },
  { href: "/reports", label: "Reports", icon: "⬇" },
];

const ADMIN_NAV: NavItem[] = [{ href: "/admin", label: "Portal View", icon: "◎" }];

export default function NavLinks({ role }: { role: "vendor" | "admin" }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <div className="nav-section">
        <div className="nav-label">Insights</div>
        {VENDOR_NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`nav-link ${isActive(n.href) ? "active" : ""}`}>
            <span className="ico">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </div>
      {role === "admin" && (
        <div className="nav-section">
          <div className="nav-label">Portal Admin</div>
          {ADMIN_NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-link ${isActive(n.href) ? "active" : ""}`}>
              <span className="ico">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
