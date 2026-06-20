import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { AnalyticsService } from "./analytics.service";
import { BrandPerfPayload, BrandPerfFilter, ProposalKind } from "./brand-performance.contract";
import { DATA_MODE, API_BASE_URL } from "./app-config";

const KINDS: ProposalKind[] = ["value", "count", "pct", "avg"];

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

  async get(f: BrandPerfFilter): Promise<BrandPerfPayload> {
    if (DATA_MODE === "api") {
      const params: Record<string, string> = {
        brand: f.brand, agg: f.agg, horizon: f.horizon, normalize: String(f.normalize),
        parents: f.parents.join(","), subs: f.subs.join(","), buyingGroups: f.buyingGroups.join(","), states: f.states.join(","),
      };
      return firstValueFrom(this.http.get<BrandPerfPayload>(API_BASE_URL + "/api/brand-performance", { params }));
    }
    return this.synthetic(f);
  }

  /** Build the exact payload from the in-browser generator (also documents the API contract). */
  private synthetic(f: BrandPerfFilter): BrandPerfPayload {
    return {
      brandRows: this.an.brandShare(f),
      itemRows: this.an.itemShare(f),
      subcatRows: this.an.subcatBreakdown(f),
      share: this.an.shareSeries(f),
      kpis: this.an.brandKpis(f),
      submitted: KINDS.map((k) => ({ kind: k, ...this.an.proposalSeries(f, k, "submitted") })),
      accepted: KINDS.map((k) => ({ kind: k, ...this.an.proposalSeries(f, k, "accepted") })),
      won: this.an.displacementWon(f),
      lost: this.an.displacementLost(f),
    };
  }
}
