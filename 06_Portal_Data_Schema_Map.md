# Portal.io Sales Data Schema Map
## Market Intelligence Reference Document

Authoritative spec for all SQL/metric work against the Portal.io dataset. Source of truth — load before generating any query or metric. (Provided by Lee, from the `portalio/analytics` market_intelligence docs.)

## Table
**Redshift table:** `public.portal_mi_data_for_redshift` — flat export, one row per proposal line item (`proposalitemid`). Multiple rows share a `proposalid`.

Source filters already applied at the table level (do NOT re-apply): proposal status in 2–8 (excludes 1), test/sample proposals excluded, test dealers excluded (dealer 1862 blocked), catalog items only (`itemtype=1`), quantity>0 and sellprice≥0, US only, submitted/accepted after 2019-01-01, area/area-option active & non-deleted.

## Key columns
- `proposalitemid` (PK line item), `proposalid` (proposal; dedup before summing proposal-level fields), `dealerid` (safe aggregation key), `name` (dealer company — **never** in vendor-facing output), `area` (room within a proposal — used for swap analysis), `brand`, `model`, `quantity`, `cost`, `msrp`, `sellprice`, `total_sell` (=sellprice×quantity, line-item).
- `deleted` (boolean — false=active, true=removed; **removed items are the swap signal**).
- `zip`, `state` (project location, not dealer location).
- `created`, `part_added`, `submitted`, `accepteddate` (lifecycle: created→part_added→submitted→accepteddate).
- `accepteddate` is a **STRING**, null unless Accepted/Completed → always `WHERE accepteddate IS NOT NULL` and `CAST(accepteddate AS DATE)`.
- `status` (4→Accepted, 7→Completed, 8→Declined, 2/3/5/6→Submitted, else Other).
- `closed_won_flag` (true for Accepted+Completed — **preferred filter for all closed-won/sales metrics**).
- `includes_non_closed_flag` (true for non-closed — use for pipeline/demand-signal).
- `totalproposalcost` (full project value incl. labor/services; repeats per row — **dedup by proposalid before summing**).
- `discount_percentage`, `discount_amount`, `proposal_cycle_days`, `time_to_submission_days`, `submission_to_close_days` (all pre-calculated).
- `subcat` (granular), `parentcat` (broad — use for top-level reporting).

## Critical business rules

1. **Closed-won vs pipeline must never be mixed without a visible label.**
   - Sales / market share / revenue / SKU rankings / category: `closed_won_flag = true`, event date = `accepteddate`, `deleted = false`.
   - Pipeline / demand signal: `includes_non_closed_flag = true`, event date = `submitted`. Any section including non-closed proposals must carry: *"Includes proposals not yet closed. Not representative of completed sales."*

2. **Two volume metrics — use the right one:**
   - Catalog product sales (brand share, category, SKU): `SUM(total_sell)` line-item, `deleted=false`. (Catalog only — excludes labor/services, so it won't equal `totalproposalcost`.)
   - Total project value (platform KPIs, market size): SUM of ONE `totalproposalcost` per unique `proposalid` (dedup first). Never sum raw.

3. **Deleted item / competitive swap logic** (the "where are you losing/winning" feature):
   - A `deleted=true` item in the same `proposalid + area + parentcat` as a `deleted=false` item of a *different* brand = a brand swap. Removed brand lost; non-deleted brand won.
   ```sql
   SELECT a.proposalid, a.area, a.parentcat,
          a.brand AS removed_brand, b.brand AS winning_brand
   FROM public.portal_mi_data_for_redshift a
   JOIN public.portal_mi_data_for_redshift b
     ON a.proposalid = b.proposalid AND a.area = b.area AND a.parentcat = b.parentcat
   WHERE a.deleted = true AND b.deleted = false AND a.brand != b.brand;
   ```
   (Scope to `closed_won_flag = true`. Viewed brand as `removed_brand` = "you lost"; as `winning_brand` = "you won".)

4. **Timestamps:** closed-won time series → `accepteddate`; pipeline/demand → `submitted`; never mix timestamp types in one metric. Use the pre-calculated `*_days` fields; don't recompute.

5. **Geography** (`zip`/`state`) = project location; label "by project location."

6. **Confidentiality:** aggregate by `dealerid`; never show `name`; **minimum 5 unique dealer IDs** for any reported metric (no reverse-identification).

## Core metric formulas
- Sales volume $ = `SUM(total_sell)` where `deleted=false AND closed_won_flag=true`.
- Units sold = `SUM(quantity)` same filters.
- Proposal count = `COUNT(DISTINCT proposalid)` (never count rows).
- Proposal volume $ = SUM of one `totalproposalcost` per unique `proposalid`.
- Brand market share % = brand sales / total category sales (within category + period).
- Acceptance rate = closed-won proposals / total submitted proposals.
- Avg proposal value = proposal volume / proposal count.

## In-scope categories (filter ALL queries to these `parentcat` values)
TVs, Projectors & Screens, Mounting Brackets, Receivers & Amplifiers, Speakers, A/V Sources & Media Players, Control Systems, Lighting Controls, Networking, Signal Distribution, Multi-Room Audio, Surveillance, Doorbells & Intercom, Access Control, Power Management, Lighting Fixtures, Interconnect Cables, Low Voltage Wire & Cable, Connectors & Adapters, Structured Cabling, Wall Trim Plates, Equipment Racks, Furniture & Stands, Headphones, Acoustic Treatment, Window Treatments, Central Vac, Telephone Systems, Satellite & Cable, Installation Tools, Installation Supplies, Warranties & Service Plans, Intrusion Detection, Fire & Life Safety, Mechanical Locks Keys & Safes.

Out of scope (exclude): General Uncategorized, Misc Items, Plumbing, HVAC, Generators, Printers & Scanners, EV Charging Equipment, Solar Equipment, Mobile Electronics, Recording, Studio Equipment, Live Sound Equipment, Digital Signage, Video Conference, Pro Speakers, Amplifiers, Computers, Signal Processing, Microphones, Electrical Distribution, Power Walls & Battery, Thermal Management, Electrical Wire & Cable, Electrical Boxes Conduit & Fittings, Receptacles & Outlets, Office Supplies.

## Section → rules quick reference
| Section | Status filter | Volume field | Timestamp | Exclude deleted? |
|---|---|---|---|---|
| Platform KPI scorecard | closed_won_flag=true | totalproposalcost (dedup) | accepteddate | Yes |
| Market trend | closed_won_flag=true | totalproposalcost (dedup) | accepteddate | Yes |
| Category summary | closed_won_flag=true | total_sell | accepteddate | Yes |
| Brand market share | closed_won_flag=true | total_sell | accepteddate | Yes |
| SKU rankings | closed_won_flag=true | total_sell + quantity | accepteddate | Yes |
| Demand signal (pipeline) | includes_non_closed_flag=true | totalproposalcost (dedup) | submitted | Yes |
| Swap / competitive loss | closed_won_flag=true | n/a (presence) | accepteddate + part_added | No (deleted = signal) |
