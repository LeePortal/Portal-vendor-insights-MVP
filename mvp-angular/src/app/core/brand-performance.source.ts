import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { AnalyticsService } from "./analytics.service";
import { AuthService } from "./auth.service";
import { BrandPerfPayload, BrandPerfFilter, ProposalKind } from "./brand-performance.contract";
import { DATA_MODE, API_BASE_URL } from "./app-config";

const KINDS: ProposalKind[] = ["value", "count", "pct", "avg"];

export interface HealthCheck { id: string; label: string; status: "up" | "down" | "degraded"; detail: string; }
export interface HealthPayload { ts: number; checks: HealthCheck[]; }

/**
 * Single source for the Brand Performance Overview. In 'synthetic' mode it assembles the
 * payload in-browser; in 'api' mode it GETs the same shape from the tenant-scoped backend
 * (which runs the SQL against Redshift). The browser sends only filter *selections* — the
 * tenant, visible-brand allow-list and parent-category restriction are applied server-side.
 */
@Injectable({ providedIn: "root" })
export class BrandPerformanceSource {
  private an = inject(AnalyticsService);
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private authHeader(): Record<string, string> { const t = this.auth.token(); return t ? { Authorization: "Bearer " + t } : {}; }

  async get(f: BrandPerfFilter): Promise<BrandPerfPayload> {
    if (DATA_MODE === "api") {
      const params: Record<string, string> = {
        brand: f.brand, agg: f.agg, horizon: f.horizon, normalize: String(f.normalize),
        from: f.from || "", to: f.to || "",
        parents: f.parents.join(","), subs: f.subs.join(","), buyingGroups: f.buyingGroups.join(","), states: f.states.join(","), statuses: (f.statuses || []).join(","),
      };
      return firstValueFrom(this.http.get<BrandPerfPayload>(API_BASE_URL + "/api/brand-performance", { params, headers: this.authHeader() }));
    }
    return this.synthetic(f);
  }

  /**
   * BY-PROPOSAL raw line-item CSV for the current filters (api mode only). All brands matching the
   * company's category gating; dealerid is an internal id. Returns the CSV text (already UTF-8 BOM'd
   * by the backend) plus the row count and whether the export was capped.
   */
  async exportProposals(f: BrandPerfFilter): Promise<{ csv: string; rows: number; truncated: boolean }> {
    const params: Record<string, string> = {
      parents: f.parents.join(","), subs: f.subs.join(","), states: f.states.join(","),
      statuses: (f.statuses || []).join(","), horizon: f.horizon, from: f.from || "", to: f.to || "",
    };
    const resp = await firstValueFrom(
      this.http.get(API_BASE_URL + "/api/proposal-export", { params, responseType: "text", observe: "response", headers: this.authHeader() }));
    return {
      csv: resp.body || "",
      rows: Number(resp.headers.get("X-Export-Rows") || 0),
      truncated: resp.headers.get("X-Export-Truncated") === "1",
    };
  }

  /**
   * Render a report to PDF. Sends renderer-agnostic HTML (+ per-page header/footer templates) to the
   * generic HTML->PDF endpoint and returns the PDF blob. The endpoint runs headless Chromium on Vercel
   * today; in production the same call can target the WeasyPrint/Gotenberg renderer with only a URL change.
   */
  async renderPdf(payload: { html: string; header?: string; footer?: string }): Promise<Blob> {
    return firstValueFrom(
      this.http.post(API_BASE_URL + "/api/report-pdf", payload, { responseType: "blob", headers: this.authHeader() }));
  }

  /** Admin connection/health check (Redshift connectivity + data-table validation). */
  async health(): Promise<HealthPayload> {
    return firstValueFrom(this.http.get<HealthPayload>(API_BASE_URL + "/api/health"));
  }

  /** Dealers new to the brand in the last 30 days (no brand sales in the prior 3 months). Vendor-only,
   *  brand-locked server-side, filter-independent. */
  async dealersSpeccing(brand: string): Promise<{ count: number; newCount: number; dealers: { name: string; isNew: boolean }[] }> {
    if (DATA_MODE === "api") {
      try {
        const r = await firstValueFrom(this.http.get<{ count: number; newCount: number; dealers: { id: string; name: string; isNew: boolean }[] }>(API_BASE_URL + "/api/new-dealers", { headers: this.authHeader() }));
        const dealers = r && r.dealers ? r.dealers.map((d) => ({ name: d.name, isNew: !!d.isNew })) : [];
        return { count: (r && r.count) || dealers.length, newCount: (r && r.newCount) || 0, dealers };
      } catch { return { count: 0, newCount: 0, dealers: [] }; }
    }
    return this.an.dealersSpeccingSynthetic(brand);
  }

  /** Build the exact payload from the in-browser generator (also documents the API contract). */
  private synthetic(f: BrandPerfFilter): BrandPerfPayload {
    return {
      brandRows: this.an.brandShare(f),
      itemRows: this.an.itemShare(f),
      subcatRows: this.an.subcatBreakdown(f),
      share: this.an.shareSeries(f),
      kpis: this.an.brandKpis(f),
      revByPeriod: this.an.revByPeriod(f),
      submitted: KINDS.map((k) => ({ kind: k, ...this.an.proposalSeries(f, k, "submitted") })),
      accepted: KINDS.map((k) => ({ kind: k, ...this.an.proposalSeries(f, k, "accepted") })),
      won: this.an.displacementWon(f),
      lost: this.an.displacementLost(f),
    };
  }
}
