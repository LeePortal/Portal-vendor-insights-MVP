# Live Redshift Data — Brand Performance Overview

Goal: power the Brand Performance Overview from Redshift directly (Redshift is refreshed nightly upstream, so data is "semi-live"), with every query authenticated and scoped per tenant. No credentials or other tenants' rows ever reach the browser.

## Architecture

```
Browser (Angular SPA)  ──HTTPS──▶  /api/brand-performance  ──IAM/SQL──▶  Redshift (nightly-refreshed)
   sends filter selections          auth → tenant + governance            parameterized, tenant-scoped SQL
   renders BrandPerfPayload         builds scoped SQL, caches result       returns aggregates only
```

- **Host:** move the SPA to **Vercel** so the static app and the `/api` serverless functions live in one project (`vercel.json` is already in `mvp-angular/`, Root Directory = `mvp-angular`). AWS Lambda + API Gateway is the equivalent if you'd rather stay AWS-native.
- **Redshift access:** the scaffold uses the **AWS Redshift Data API** (`@aws-sdk/client-redshift-data`) — HTTP + IAM, no driver, no VPC/port-opening, ideal for serverless. A direct `pg` connection also works if the function runs inside your VPC.
- **Semi-live:** the API queries Redshift directly; a short per-`tenant+filters` cache (3h default, or "until next nightly load") protects the cluster. Freshness = nightly.

## The swap seam (already in the app)

- `src/app/core/brand-performance.contract.ts` — `BrandPerfPayload`, the single shape the dashboard renders.
- `src/app/core/brand-performance.source.ts` — `BrandPerformanceSource.get(filter)`: returns the payload from the in-browser generator (`synthetic`) or the API (`api`).
- `src/app/core/app-config.ts` — flip `DATA_MODE` to `"api"` and set `API_BASE_URL`.

Final wiring step (one change): make `DashboardComponent.rebuild()` `async` and replace the direct `this.an.*` calls with `const p = await this.source.get(f);` then assign `brandRows = p.brandRows`, etc. The synthetic path keeps working for local/offline, so this is safe to land before the backend is live.

## Tenant security (non-negotiable)

The browser sends only **filter selections** (parents, subs, states, date range). The server derives, from the authenticated identity:
- the tenant **brand** (the viewed brand),
- the **visible-brand allow-list**, and
- the **parent-category restriction**,

and injects them into every query (`brand = ANY(:brands)`, `parentcat = ANY(:aparents)`). A vendor sees category aggregates + their own share — never a competitor's raw rows. Use a least-privilege **read-only** Redshift user, statement timeouts, and rate limiting.

## Env / secrets (server-side only)

```
AWS_REGION=us-east-1
REDSHIFT_WORKGROUP=portal-prod        # or REDSHIFT_CLUSTER_ID
REDSHIFT_DATABASE=analytics
REDSHIFT_SECRET_ARN=arn:aws:secretsmanager:...:portal-redshift-readonly
FACT_TABLE=analytics.proposal_parts   # the proposal-line-item fact table
```

Plus IAM permission for `redshift-data:ExecuteStatement|DescribeStatement|GetStatementResult` and `secretsmanager:GetSecretValue`.

## SQL (against the proposal-parts fact table)

Columns confirmed from the production export: `brand, model, quantity, total_sell, sellprice, cost, subcat, parentcat, state, status, dealerid, proposalid, submitted_date, accepteddate, suppliername`. `{SCOPE}` = the tenant + filter WHERE clause built server-side.

**Category Share by Brand** (drives brandRows + KPIs)
```sql
SELECT brand, SUM(total_sell) sales, SUM(quantity) units, COUNT(DISTINCT model) skus
FROM analytics.proposal_parts {SCOPE}
GROUP BY brand ORDER BY sales DESC;
-- sharePct = sales / SUM(sales) over the result (computed in the function)
```

**Category Share by Item**
```sql
SELECT brand, model, MAX(subcat) subcat, SUM(total_sell) sales, SUM(quantity) units,
       SUM(total_sell)/NULLIF(SUM(quantity),0) avg_sell
FROM analytics.proposal_parts {SCOPE}
GROUP BY brand, model ORDER BY sales DESC;
```

**Sub-Category Breakdown**
```sql
SELECT subcat, SUM(total_sell) sales, SUM(quantity) units
FROM analytics.proposal_parts {SCOPE}
GROUP BY subcat ORDER BY sales DESC;
```

**Competitive Index — share over time** (one row per brand per period; pivot to series in code)
```sql
SELECT brand, DATE_TRUNC('month', accepteddate) period, SUM(total_sell) sales
FROM analytics.proposal_parts {SCOPE}
GROUP BY brand, period ORDER BY period;
-- share% per period = brand sales / category sales for that period
```

**Proposal value / funnel** (Submitted vs Accepted; repeat per metric)
```sql
SELECT DATE_TRUNC('month', submitted_date) period,
       SUM(total_sell) FILTER (WHERE status IN ('Submitted','Accepted','Completed')) submitted_val,
       SUM(total_sell) FILTER (WHERE status IN ('Accepted','Completed'))            accepted_val,
       COUNT(DISTINCT proposalid)                                                   proposals
FROM analytics.proposal_parts {SCOPE}
GROUP BY period ORDER BY period;
```

**Competitive displacement** (won vs lost) is computed by comparing, within each `subcat` on a proposal, the tenant brand's line items against competitors' — see the synthetic implementation in `analytics.service.ts` (`displacementWon`/`displacementLost`) for the exact output shape; the SQL is a self-join on `proposalid` + `subcat`.

## Flip-the-switch checklist

1. Deploy the SPA + `api/brand-performance.ts` to Vercel (Root Directory `mvp-angular`); add the env vars above as Vercel secrets.
2. Replace `resolveTenant()` in the function with real auth (Portal SSO/JWT → tenant + governance).
3. Finish the remaining SQL sections in the function (item/subcat/series/proposals/displacement per above).
4. Set `DATA_MODE = "api"` and make `DashboardComponent.rebuild()` await `BrandPerformanceSource.get()`.
5. Confirm a vendor login only ever returns its own scoped rows.
