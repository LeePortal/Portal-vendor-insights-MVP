import type { ReactNode } from "react";
import { fmtPct } from "@/lib/format";

export function Card({
  title,
  sub,
  children,
  className = "",
  action,
}: {
  title?: string;
  sub?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            {title && <div className="card-title">{title}</div>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  deltaPct,
  hint,
}: {
  label: string;
  value: string;
  deltaPct?: number;
  hint?: string;
}) {
  let cls = "flat";
  let arrow = "→";
  if (typeof deltaPct === "number") {
    if (deltaPct > 0.05) {
      cls = "up";
      arrow = "▲";
    } else if (deltaPct < -0.05) {
      cls = "down";
      arrow = "▼";
    }
  }
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {typeof deltaPct === "number" ? (
        <div className={`delta ${cls}`}>
          {arrow} {fmtPct(Math.abs(deltaPct))} {hint || "vs prior period"}
        </div>
      ) : (
        hint && <div className="delta flat">{hint}</div>
      )}
    </div>
  );
}

export function SampleBadge() {
  return <span className="badge sample">SAMPLE DATA</span>;
}
