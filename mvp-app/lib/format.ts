export function fmtCurrency(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtCompact(n: number): string {
  return "$" + n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

export function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct(n: number, digits = 1): string {
  return `${n >= 0 ? "" : ""}${n.toFixed(digits)}%`;
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}
