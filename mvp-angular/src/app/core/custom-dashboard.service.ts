import { Injectable } from "@angular/core";
import { Measure, Dim } from "./analytics.service";

export type Viz = "kpi" | "bar" | "line" | "table" | "insight";
export type Insight = "new-dealers" | "lost-dealers" | "disp-won" | "disp-lost" | "substitution" | "funnel" | "geo";
export interface BuilderWidget {
  id: string;
  title: string;
  viz: Viz;
  measures: Measure[];
  groupBy: Dim | null;
  insight?: Insight;
  brand?: string;
  parents: string[];
  subs: string[];
  buyingGroups: string[];
  states: string[];
}
export interface DashFilters { parents: string[]; subs: string[]; buyingGroups: string[]; states: string[]; }
export interface CustomDashboard { id: string; name: string; widgets: BuilderWidget[]; filters?: DashFilters; }

const LS = "pvi_custom_dashboards_v1";

@Injectable({ providedIn: "root" })
export class CustomDashboardService {
  private load(): CustomDashboard[] { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; } }
  private persist(list: CustomDashboard[]): void { try { localStorage.setItem(LS, JSON.stringify(list)); } catch { /* ignore */ } }

  list(): CustomDashboard[] { return this.load(); }
  get(id: string): CustomDashboard | undefined { return this.load().find((d) => d.id === id); }
  save(d: CustomDashboard): void {
    const list = this.load();
    const i = list.findIndex((x) => x.id === d.id);
    if (i >= 0) list[i] = d; else list.push(d);
    this.persist(list);
  }
  remove(id: string): void { this.persist(this.load().filter((d) => d.id !== id)); }
  newId(): string { return "cd" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
}
