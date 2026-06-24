import { AFilter, BrandShareRow, ItemRow, SubcatRow, ShareSeries, BrandKpis, WonRow, LostRow, DualPoint } from "./analytics.service";

export type ProposalKind = "value" | "count" | "pct" | "avg";
export interface ProposalSeriesResult { kind: ProposalKind; points: DualPoint[]; total: number; yoy: number; hasBrand: boolean; }

/** The single payload the Brand Performance Overview renders. The synthetic source and the
 *  Redshift-backed API both return exactly this shape — that's the swap seam. */
export interface BrandPerfPayload {
  brandRows: BrandShareRow[];
  itemRows: ItemRow[];
  subcatRows: SubcatRow[];
  share: ShareSeries;
  kpis: BrandKpis;
  revByPeriod: { labels: string[]; values: number[]; prior: number[]; category?: number[]; keys?: string[] };
  submitted: ProposalSeriesResult[];
  accepted: ProposalSeriesResult[];
  won: WonRow[];
  lost: LostRow[];
}

export type BrandPerfFilter = AFilter;
