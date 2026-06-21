# Scaling to production — a pre-aggregated serving layer

Status: **roadmap item.** The MVP currently queries Redshift live on every request, which is fine for a demo and a handful of users. This note explains why that pattern won't scale cleanly to a wide multi-vendor launch, and the change to make before then. Nothing in the current build is throwaway — this is an infrastructure swap *behind the same API*.

## What we hit, and what it signals

While wiring live data we ran into two Redshift/hosting limits:

- **`APPROXIMATE COUNT(DISTINCT)` max 3 per query** — a SQL quirk; worked around immediately (regular `COUNT(DISTINCT)` where the slice is small, approximate where it's large).
- **Query/function timeouts on cold full-table aggregations** — partly Vercel's function time cap, partly Redshift latency on ~11M-row scans.

Both are individually minor and already handled. But they're symptoms of one underlying fact: **Redshift is an analytical data warehouse, not a low-latency application database.** It's built for large scans and nightly batch work, not for answering many small interactive queries per second.

## Why live-querying Redshift per click doesn't scale

- **Latency.** Every filter change recomputes aggregates over millions of rows. Cold, that's seconds — the reason the dashboard needs loading spinners. It will never feel instant.
- **Concurrency (the real constraint).** Redshift runs only a handful of queries concurrently before they queue. One user is fine; dozens of vendors clicking filters at once — each firing several parallel queries — can saturate the warehouse and slow or error for everyone. Concurrency Scaling helps but adds cost and isn't instant.
- **Cost & coupling.** Every interaction consumes warehouse compute and competes with the nightly ETL pipelines (the data is loaded via Airbyte into `public.portal_mi_data_for_redshift`).

For one to a few users this is invisible. For a multi-tenant product it gets shaky.

## The fix: pre-aggregate once per night into a fast serving layer

The data only refreshes **nightly**, so there is no reason to recompute it live on every click. Compute the aggregates the dashboard needs once after each nightly load, store them in a fast read layer, and have the API read pre-chewed results. Result: sub-second loads, high concurrency, low cost, and the warehouse is left alone for analytics/ETL.

Options for the serving layer (any one works):

1. **Redshift materialized views / rollup tables** — least new infrastructure. Create summary tables (brand × period × category × status aggregates) refreshed nightly; the API selects from those small tables instead of scanning the fact table. Good first step.
2. **A low-latency store** — push the nightly rollups into Postgres/RDS, ClickHouse, or DuckDB. Millisecond reads, easy high concurrency, isolated from the warehouse.
3. **A cache layer** — Redis/Upstash or Vercel KV in front of the API, keyed by tenant+filters, warmed nightly. Simplest to bolt on; pairs well with (1).

Recommended: start with **(1) rollup tables in Redshift** (smallest change, reuses existing infra), and add **(3) a shared cache** so repeated views are instant and the warehouse is barely touched. Move to a dedicated store (2) only if concurrency demands it.

## What changes vs. what stays

- **Stays:** the Angular dashboard, the `BrandPerfPayload` contract, all filters, the `/api/brand-performance` endpoint, the loading states.
- **Changes:** only *what the API reads from* — pre-aggregated rollups/cache instead of raw `SELECT … GROUP BY` scans over the 11M-row fact table. The current parameterized SQL becomes the definition of the nightly rollup jobs.

## Rough migration steps

1. Define the rollup grain the dashboard needs (brand × parentcat × subcat × state × status × period), driven by the queries already in `api/brand-performance.js`.
2. Create nightly jobs (dbt / scheduled SQL / materialized views) that populate rollup tables right after the Airbyte load.
3. Point the API at the rollup tables; add a shared cache (KV/Redis) keyed by tenant+filters.
4. Move per-vendor authorization into this layer (ties in with the real-auth work).
5. Load-test concurrent vendors; enable Redshift Concurrency Scaling only if still needed.

## When to do it

After the dashboards are finished and before a wide multi-vendor rollout. The live-Redshift version is the right thing to ship for the MVP and to validate the product; the serving layer is the "harden for scale" step.
