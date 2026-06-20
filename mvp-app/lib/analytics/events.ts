/**
 * First-party activity tracking — the data behind the Portal admin dashboard.
 *
 * This intentionally mirrors the shape of Periscope's "Usage Data"
 * (query_logs + time_on_site_logs + last_login_at) so the admin view is
 * built on the same concepts we researched, but on OUR own events instead of
 * Periscope's. See 01_Periscope_API_Research.md §7.
 *
 * The store is in-memory and seeded deterministically for the demo. In
 * production, write these events to a durable table (e.g. activity_events in
 * Redshift/Postgres) and query that instead — the function signatures below are
 * the contract the UI depends on.
 */
import { VENDORS } from "../data/seed";
import { DASHBOARDS } from "../dashboards";

export type ActivityType = "login" | "dashboard_view" | "report_pull" | "csv_export";

export interface ActivityEvent {
  id: string;
  ts: number; // epoch ms
  vendorId: string;
  vendorName: string;
  userEmail: string;
  type: ActivityType;
  target?: string; // dashboard / report / chart name
  durationSec?: number; // for dashboard_view (time on site)
}

const DAY = 86_400_000;
const NOW = Date.now();

function rng(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let seed = h >>> 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (s: string, min: number, max: number) => Math.floor(min + rng(s) * (max - min + 1));

function seed(): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  let n = 0;
  for (let d = 44; d >= 0; d--) {
    const dayStart = NOW - d * DAY;
    const weekday = new Date(dayStart).getDay();
    const weekendPenalty = weekday === 0 || weekday === 6 ? 0.35 : 1;
    for (const v of VENDORS) {
      const logins = Math.round(ri(`${v.id}-${d}-l`, 0, 5) * weekendPenalty);
      for (let i = 0; i < logins; i++) {
        const hour = ri(`${v.id}-${d}-${i}-h`, 8, 19);
        const min = ri(`${v.id}-${d}-${i}-m`, 0, 59);
        const ts = dayStart - (new Date(dayStart).getHours() * 3600 + new Date(dayStart).getMinutes() * 60) * 1000 + (hour * 3600 + min * 60) * 1000;
        const email = v.contactEmail;
        out.push({ id: `e${n++}`, ts, vendorId: v.id, vendorName: v.name, userEmail: email, type: "login" });
        const views = ri(`${v.id}-${d}-${i}-v`, 1, 4);
        for (let j = 0; j < views; j++) {
          const dash = DASHBOARDS[ri(`${v.id}-${d}-${i}-${j}-d`, 0, DASHBOARDS.length - 1)];
          const duration = ri(`${v.id}-${d}-${i}-${j}-t`, 45, 1100);
          out.push({
            id: `e${n++}`,
            ts: ts + (j + 1) * 60_000,
            vendorId: v.id,
            vendorName: v.name,
            userEmail: email,
            type: "dashboard_view",
            target: dash.name,
            durationSec: duration,
          });
          if (rng(`${v.id}-${d}-${i}-${j}-rp`) > 0.7) {
            out.push({
              id: `e${n++}`,
              ts: ts + (j + 1) * 60_000 + 5_000,
              vendorId: v.id,
              vendorName: v.name,
              userEmail: email,
              type: "report_pull",
              target: dash.name,
            });
          }
          if (rng(`${v.id}-${d}-${i}-${j}-cx`) > 0.85) {
            out.push({
              id: `e${n++}`,
              ts: ts + (j + 1) * 60_000 + 9_000,
              vendorId: v.id,
              vendorName: v.name,
              userEmail: email,
              type: "csv_export",
              target: dash.name,
            });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

let _events: ActivityEvent[] | null = null;
function store(): ActivityEvent[] {
  if (!_events) _events = seed();
  return _events;
}

/** Append a runtime event (login, view, export, ...). */
export function logEvent(e: Omit<ActivityEvent, "id" | "ts"> & { ts?: number }): void {
  store().push({ id: `rt${Math.random().toString(36).slice(2)}`, ts: e.ts ?? Date.now(), ...e });
}

function within(days: number): ActivityEvent[] {
  const cutoff = NOW - days * DAY;
  return store().filter((e) => e.ts >= cutoff);
}

const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export interface AdminSummary {
  totalLogins: number;
  activeVendors: number;
  reportsPulled: number;
  csvExports: number;
  avgSessionMin: number;
  timeOnSiteHours: number;
}

export function getSummary(days = 30): AdminSummary {
  const ev = within(days);
  const views = ev.filter((e) => e.type === "dashboard_view");
  const totalSec = views.reduce((s, e) => s + (e.durationSec || 0), 0);
  return {
    totalLogins: ev.filter((e) => e.type === "login").length,
    activeVendors: new Set(ev.map((e) => e.vendorId)).size,
    reportsPulled: ev.filter((e) => e.type === "report_pull").length,
    csvExports: ev.filter((e) => e.type === "csv_export").length,
    avgSessionMin: views.length ? totalSec / views.length / 60 : 0,
    timeOnSiteHours: totalSec / 3600,
  };
}

export function getActivityByDay(days = 30): { date: string; logins: number; minutes: number }[] {
  const ev = within(days);
  const m = new Map<string, { date: string; logins: number; minutes: number }>();
  // pre-fill the day buckets so the chart has a continuous axis
  for (let d = days - 1; d >= 0; d--) {
    const key = dayKey(NOW - d * DAY);
    m.set(key, { date: key, logins: 0, minutes: 0 });
  }
  for (const e of ev) {
    const key = dayKey(e.ts);
    const b = m.get(key) || { date: key, logins: 0, minutes: 0 };
    if (e.type === "login") b.logins += 1;
    if (e.type === "dashboard_view") b.minutes += (e.durationSec || 0) / 60;
    m.set(key, b);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ ...x, minutes: Math.round(x.minutes) }));
}

export function getTopDashboards(days = 30): { name: string; views: number }[] {
  const ev = within(days).filter((e) => e.type === "dashboard_view");
  const m = new Map<string, number>();
  for (const e of ev) if (e.target) m.set(e.target, (m.get(e.target) || 0) + 1);
  return [...m.entries()].map(([name, views]) => ({ name, views })).sort((a, b) => b.views - a.views);
}

export interface VendorEngagement {
  vendorId: string;
  vendorName: string;
  logins: number;
  views: number;
  minutes: number;
  reportsPulled: number;
  csvExports: number;
  lastActive: number;
}

export function getVendorEngagement(days = 30): VendorEngagement[] {
  const ev = within(days);
  const m = new Map<string, VendorEngagement>();
  for (const v of VENDORS) {
    m.set(v.id, {
      vendorId: v.id,
      vendorName: v.name,
      logins: 0,
      views: 0,
      minutes: 0,
      reportsPulled: 0,
      csvExports: 0,
      lastActive: 0,
    });
  }
  for (const e of ev) {
    const r = m.get(e.vendorId);
    if (!r) continue;
    if (e.type === "login") r.logins += 1;
    if (e.type === "dashboard_view") {
      r.views += 1;
      r.minutes += (e.durationSec || 0) / 60;
    }
    if (e.type === "report_pull") r.reportsPulled += 1;
    if (e.type === "csv_export") r.csvExports += 1;
    if (e.ts > r.lastActive) r.lastActive = e.ts;
  }
  return [...m.values()].map((r) => ({ ...r, minutes: Math.round(r.minutes) })).sort((a, b) => b.minutes - a.minutes);
}

export function getRecentEvents(limit = 12): ActivityEvent[] {
  return [...store()].sort((a, b) => b.ts - a.ts).slice(0, limit);
}
