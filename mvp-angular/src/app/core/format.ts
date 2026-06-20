export const fmtCurrency = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const fmtCompact = (n: number): string =>
  "$" + n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const fmtNumber = (n: number): string => Math.round(n).toLocaleString("en-US");

export const fmtPct = (n: number, d = 1): string => `${n.toFixed(d)}%`;

export function relativeTime(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
