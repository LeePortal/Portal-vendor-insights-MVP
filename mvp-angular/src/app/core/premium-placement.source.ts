import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { AuthService } from "./auth.service";
import { API_BASE_URL } from "./app-config";

/**
 * Premium Placement data source. Talks to the server-side AdButler proxy (/api/adbutler), which keeps
 * the AdButler key server-side. Spotlight metrics are live from AdButler; Featured Products is pending
 * its data source (callers fold in a 0 placeholder for now). `configured:false` => AdButler key not set.
 */
export interface PpAdvertiser { id: string; name: string; }
export interface PpCampaign { id: string; name: string; advertiserId: string; advertiserName: string; active: boolean; impressions: number; clicks: number; }
/** An ad-item (AdButler image_ad_item) within a campaign — the creative image plus its own metrics. */
export interface PpCreative {
  bannerId: string; name: string; width: number; height: number; imageUrl: string;
  clickUrl: string; createdDate: string; impressions: number; clicks: number; active: boolean;
}
export interface PpCampaignDetail { id: string; name: string; advertiserId: string; advertiserName: string; active: boolean; impressions: number; clicks: number; }

@Injectable({ providedIn: "root" })
export class PremiumPlacementSource {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = API_BASE_URL + "/api/adbutler";
  private hdr(): Record<string, string> { const t = this.auth.token(); return t ? { Authorization: "Bearer " + t } : {}; }

  /** Active (non-archived) AdButler advertisers; the count is the filter-independent "active advertisers". */
  async advertisers(): Promise<{ configured: boolean; advertisers: PpAdvertiser[] }> {
    try {
      const r = await firstValueFrom(this.http.get<{ configured: boolean; advertisers?: PpAdvertiser[] }>(this.base + "?action=advertisers", { headers: this.hdr() }));
      return { configured: !!(r && r.configured), advertisers: (r && r.advertisers) || [] };
    } catch { return { configured: false, advertisers: [] }; }
  }

  /** Spotlight impressions + clicks for the period (one advertiser if given). */
  async summary(from: string, to: string, advertiserId = ""): Promise<{ configured: boolean; impressions: number; clicks: number }> {
    const q = "?action=summary&from=" + from + "&to=" + to + (advertiserId ? "&advertiserId=" + encodeURIComponent(advertiserId) : "");
    try {
      const r = await firstValueFrom(this.http.get<{ configured: boolean; impressions?: number; clicks?: number }>(this.base + q, { headers: this.hdr() }));
      return { configured: !!(r && r.configured), impressions: (r && r.impressions) || 0, clicks: (r && r.clicks) || 0 };
    } catch { return { configured: false, impressions: 0, clicks: 0 }; }
  }

  /** One campaign's detail: meta, period impressions/clicks, and its creative image(s). `debug` carries the raw
   *  AdButler banner/creative when no image URL resolved, so the field can be mapped. */
  async campaign(id: string, from: string, to: string): Promise<{ configured: boolean; campaign: PpCampaignDetail | null; creatives: PpCreative[]; debug?: unknown }> {
    const q = "?action=campaign&campaignId=" + encodeURIComponent(id) + "&from=" + from + "&to=" + to;
    try {
      const r = await firstValueFrom(this.http.get<{ configured: boolean; campaign?: PpCampaignDetail; creatives?: PpCreative[]; debug?: unknown }>(this.base + q, { headers: this.hdr() }));
      return { configured: !!(r && r.configured), campaign: (r && r.campaign) || null, creatives: (r && r.creatives) || [], debug: r && r.debug };
    } catch { return { configured: false, campaign: null, creatives: [] }; }
  }

  /** All Spotlight campaigns (every advertiser) with owning company, active/expired state, and period impressions/clicks. */
  async campaigns(from: string, to: string): Promise<{ configured: boolean; campaigns: PpCampaign[] }> {
    const q = "?action=campaigns&from=" + from + "&to=" + to;
    try {
      const r = await firstValueFrom(this.http.get<{ configured: boolean; campaigns?: PpCampaign[] }>(this.base + q, { headers: this.hdr() }));
      return { configured: !!(r && r.configured), campaigns: (r && r.campaigns) || [] };
    } catch { return { configured: false, campaigns: [] }; }
  }
}
