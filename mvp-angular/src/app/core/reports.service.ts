import { Injectable } from "@angular/core";
import { DASHBOARDS } from "./models";

export interface ReportDef { id: string; name: string; }
const LS = "pvi_reports";

@Injectable({ providedIn: "root" })
export class ReportsService {
  private items: ReportDef[] = this.load();
  private load(): ReportDef[] {
    try { const r = localStorage.getItem(LS); if (r) return JSON.parse(r) as ReportDef[]; } catch { /* ignore */ }
    return DASHBOARDS.map((d) => ({ id: d.id, name: d.name }));
  }
  private persist(): void { try { localStorage.setItem(LS, JSON.stringify(this.items)); } catch { /* ignore */ } }
  list(): ReportDef[] { return this.items; }
  rename(id: string, name: string): void { const r = this.items.find((x) => x.id === id); if (r && name.trim()) { r.name = name.trim(); this.persist(); } }
  add(name: string): void { this.items.push({ id: "r" + Math.random().toString(36).slice(2, 8), name: name.trim() || "Untitled report" }); this.persist(); }
}
