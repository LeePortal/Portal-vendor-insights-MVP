import { Injectable } from "@angular/core";
import { ActivityEvent, ActivityType, DASHBOARDS } from "./models";
import { VENDORS } from "./data.service";
import { VENDOR_CONTACTS } from "./contacts";

/**
 * ActivityService — first-party usage tracking that powers the Portal admin
 * view. Modeled on Periscope's Usage Data (query_logs + time_on_site_logs +
 * last_login_at), but recorded on our own platform. Seeded deterministically
 * for the demo; in production, persist these to a table and query that.
 */
const DAY = 86_400_000;

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

export interface AdminSummary {
  totalLogins: number;
  activeVendors: number;
  reportsPulled: number;
  csvExports: number;
  avgSessionMin: number;
  timeOnSiteHours: number;
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

@Injectable({ providedIn: "root" })
export class ActivityService {
  private readonly now = Date.now();
  private events: ActivityEvent[] = this.seed();
  private n = 0;

  private seed(): ActivityEvent[] {
    const out: ActivityEvent[] = [];
    let n = 0;
    for (let d = 44; d >= 0; d--) {
      const dayStart = this.now - d * DAY;
      const weekday = new Date(dayStart).getDay();
      const weekendPenalty = weekday === 0 || weekday === 6 ? 0.35 : 1;
      const base = new Date(dayStart);
      const midnight = dayStart - (base.getHours() * 3600 + base.getMinutes() * 60 + base.getSeconds()) * 1000;
      for (const v of VENDORS) {
        const pool = (VENDOR_CONTACTS[v.id] || []).map((c) => c.email);
        const emails = pool.length ? pool : [v.contactEmail];
        const logins = Math.round(ri(`${v.id}-${d}-l`, 0, 5) * weekendPenalty);
        for (let i = 0; i < logins; i++) {
          const userEmail = emails[ri(`${v.id}-${d}-${i}-u`, 0, emails.length - 1)];
          const hour = ri(`${v.id}-${d}-${i}-h`, 8, 19);
          const min = ri(`${v.id}-${d}-${i}-m`, 0, 59);
          const ts = midnight + (hour * 3600 + min * 60) * 1000;
          out.push({ id: `e${n++}`, ts, vendorId: v.id, vendorName: v.name, userEmail, type: "login" });
          const views = ri(`${v.id}-${d}-${i}-v`, 1, 4);
          for (let j = 0; j < views; j++) {
            const dash = DASHBOARDS[ri(`${v.id}-${d}-${i}-${j}-d`, 0, DASHBOARDS.length - 1)];
            const duration = ri(`${v.id}-${d}-${i}-${j}-t`, 45, 1100);
            out.push({ id: `e${n++}`, ts: ts + (j + 1) * 60000, vendorId: v.id, vendorName: v.name, userEmail, type: "dashboard_view", target: dash.name, durationSec: duration });
            if (rng(`${v.id}-${d}-${i}-${j}-rp`) > 0.7) {
              out.push({ id: `e${n++}`, ts: ts + (j + 1) * 60000 + 5000, vendorId: v.id, vendorName: v.name, userEmail, type: "report_pull", target: dash.name });
            }
            if (rng(`${v.id}-${d}-${i}-${j}-cx`) > 0.85) {
              out.push({ id: `e${n++}`, ts: ts + (j + 1) * 60000 + 9000, vendorId: v.id, vendorName: v.name, userEmail, type: "csv_export", target: dash.name });
            }
          }
        }
      }
    }
    this.n = n;
    return out.sort((a, b) => a.ts - b.ts);
  }

  log(e: Omit<ActivityEvent, "id" | "ts"> & { ts?: number }): void {
    this.events.push({ id: `rt${this.n++}`, ts: e.ts ?? Date.now(), ...e });
  }

  private within(days: number): ActivityEvent[] {
    const cutoff = this.now - days * DAY;
    return this.events.filter((e) => e.ts >= cutoff);
  }
  private dayKey(ts: number): string { return new Date(ts).toISOString().slice(0, 10); }

  getSummary(days = 30): AdminSummary {
    const ev = this.within(days);
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

  getActivityByDay(days = 30): { date: string; logins: number; minutes: number }[] {
    const m = new Map<string, { date: string; logins: number; minutes: number }>();
    for (let d = days - 1; d >= 0; d--) {
      const key = this.dayKey(this.now - d * DAY);
      m.set(key, { date: key, logins: 0, minutes: 0 });
    }
    for (const e of this.within(days)) {
      const key = this.dayKey(e.ts);
      const b = m.get(key) || { date: key, logins: 0, minutes: 0 };
      if (e.type === "login") b.logins += 1;
      if (e.type === "dashboard_view") b.minutes += (e.durationSec || 0) / 60;
      m.set(key, b);
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ ...x, minutes: Math.round(x.minutes) }));
  }

  getTopDashboards(days = 30): { name: string; views: number }[] {
    const m = new Map<string, number>();
    for (const e of this.within(days)) if (e.type === "dashboard_view" && e.target) m.set(e.target, (m.get(e.target) || 0) + 1);
    return [...m.entries()].map(([name, views]) => ({ name, views })).sort((a, b) => b.views - a.views);
  }

  getVendorEngagement(days = 30): VendorEngagement[] {
    const m = new Map<string, VendorEngagement>();
    for (const v of VENDORS) {
      m.set(v.id, { vendorId: v.id, vendorName: v.name, logins: 0, views: 0, minutes: 0, reportsPulled: 0, csvExports: 0, lastActive: 0 });
    }
    for (const e of this.within(days)) {
      const r = m.get(e.vendorId);
      if (!r) continue;
      if (e.type === "login") r.logins += 1;
      if (e.type === "dashboard_view") { r.views += 1; r.minutes += (e.durationSec || 0) / 60; }
      if (e.type === "report_pull") r.reportsPulled += 1;
      if (e.type === "csv_export") r.csvExports += 1;
      if (e.ts > r.lastActive) r.lastActive = e.ts;
    }
    return [...m.values()].map((r) => ({ ...r, minutes: Math.round(r.minutes) })).sort((a, b) => b.minutes - a.minutes);
  }

  getRecentEvents(limit = 14): ActivityEvent[] {
    return [...this.events].sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  userBreakdown(emails: string[], days = 30): { email: string; logins: number; views: number; minutes: number; reportsPulled: number; csvExports: number; lastActive: number }[] {
    const ev = this.within(days);
    return emails.map((email) => {
      const mine = ev.filter((e) => e.userEmail.toLowerCase() === email.toLowerCase());
      const views = mine.filter((e) => e.type === "dashboard_view");
      return {
        email,
        logins: mine.filter((e) => e.type === "login").length,
        views: views.length,
        minutes: Math.round(views.reduce((sum, e) => sum + (e.durationSec || 0), 0) / 60),
        reportsPulled: mine.filter((e) => e.type === "report_pull").length,
        csvExports: mine.filter((e) => e.type === "csv_export").length,
        lastActive: mine.reduce((m, e) => Math.max(m, e.ts), 0),
      };
    });
  }
}
