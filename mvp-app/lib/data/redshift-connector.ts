/**
 * RedshiftConnector — the production seam (STUB).
 *
 * This is where the dev team replaces synthetic data with Portal's real
 * warehouse. The recommended migration path (see 01_Periscope_API_Research.md):
 *   1. Pull each Periscope chart's SQL from the Usage Data `charts.sql` column.
 *   2. Parameterize it (tenant / date range / region / category) and run it here.
 *   3. Return the same shapes the MockConnector returns — the UI is unchanged.
 *
 * To wire it up:
 *   - `npm install pg` (or use @aws-sdk/client-redshift-data for IAM auth)
 *   - set DATA_SOURCE=redshift and the REDSHIFT_* vars in .env.local
 *   - implement each method below using the reference SQL in REFERENCE_SQL.
 *
 * IMPORTANT: every query MUST be scoped by vendor_id (the tenant). Never trust
 * a vendor_id from the client — derive it from the authenticated session.
 */
import type { Filters, Vendor } from "./seed";
import type {
  CategoryRow,
  DataConnector,
  DealerRow,
  KpiSet,
  RegionRow,
  SharePoint,
  TrendPoint,
} from "./connector";

const NOT_IMPLEMENTED = (method: string) =>
  new Error(
    `RedshiftConnector.${method}() is not implemented yet. ` +
      `Set DATA_SOURCE=mock to use synthetic data, or implement this method ` +
      `against Redshift using REFERENCE_SQL.${method}.`,
  );

/** Parameterized reference queries (psql/Redshift dialect). $1=vendor, $2=start, $3=end. */
export const REFERENCE_SQL = {
  getKpis: `
    SELECT sum(revenue)   AS revenue,
           sum(units)     AS units,
           sum(proposals) AS proposals
    FROM   fact_vendor_sales
    WHERE  vendor_id = $1
      AND  sale_month BETWEEN $2 AND $3
      -- AND region = ANY($4) / category = ANY($5) when filters are present
  `,
  getRevenueTrend: `
    SELECT date_trunc('month', sale_month) AS period,
           sum(revenue) AS revenue, sum(units) AS units, sum(proposals) AS proposals
    FROM   fact_vendor_sales
    WHERE  vendor_id = $1 AND sale_month BETWEEN $2 AND $3
    GROUP  BY 1 ORDER BY 1
  `,
  getCategoryBreakdown: `
    SELECT category, sum(revenue) AS revenue, sum(units) AS units, sum(proposals) AS proposals
    FROM   fact_vendor_sales
    WHERE  vendor_id = $1 AND sale_month BETWEEN $2 AND $3
    GROUP  BY category ORDER BY revenue DESC
  `,
  getRegionBreakdown: `
    SELECT region, sum(revenue) AS revenue
    FROM   fact_vendor_sales
    WHERE  vendor_id = $1 AND sale_month BETWEEN $2 AND $3
    GROUP  BY region ORDER BY revenue DESC
  `,
  getTopDealers: `
    SELECT dealer_name, region, sum(revenue) AS revenue, sum(proposals) AS proposals
    FROM   fact_vendor_sales_by_dealer
    WHERE  vendor_id = $1 AND sale_month BETWEEN $2 AND $3
    GROUP  BY dealer_name, region ORDER BY revenue DESC LIMIT 10
  `,
  getShareVsCategory: `
    -- brand revenue vs the average vendor in the same category, per period
    WITH per_vendor AS (
      SELECT date_trunc('month', sale_month) AS period, vendor_id, sum(revenue) AS rev
      FROM fact_vendor_sales
      WHERE category = (SELECT primary_category FROM dim_vendor WHERE vendor_id = $1)
        AND sale_month BETWEEN $2 AND $3
      GROUP BY 1, 2
    )
    SELECT period,
           sum(rev) FILTER (WHERE vendor_id = $1) AS brand_revenue,
           avg(rev) AS category_avg
    FROM per_vendor GROUP BY period ORDER BY period
  `,
};

export class RedshiftConnector implements DataConnector {
  listVendors(): Vendor[] {
    throw NOT_IMPLEMENTED("listVendors");
  }
  getVendor(_id: string): Vendor | undefined {
    throw NOT_IMPLEMENTED("getVendor");
  }
  getKpis(_f: Filters): KpiSet {
    throw NOT_IMPLEMENTED("getKpis");
  }
  getRevenueTrend(_f: Filters): TrendPoint[] {
    throw NOT_IMPLEMENTED("getRevenueTrend");
  }
  getCategoryBreakdown(_f: Filters): CategoryRow[] {
    throw NOT_IMPLEMENTED("getCategoryBreakdown");
  }
  getRegionBreakdown(_f: Filters): RegionRow[] {
    throw NOT_IMPLEMENTED("getRegionBreakdown");
  }
  getTopDealers(_f: Filters, _limit?: number): DealerRow[] {
    throw NOT_IMPLEMENTED("getTopDealers");
  }
  getShareVsCategory(_f: Filters): SharePoint[] {
    throw NOT_IMPLEMENTED("getShareVsCategory");
  }
}
