---
name: adbutler-api
description: Reference for integrating with the AdButler v2 advertising API (used by Portal's Spotlight / Premium Placement). Use when pulling AdButler impressions, clicks, advertisers, campaigns, or ad-items; serving creative images; building or debugging the /api/adbutler proxy; or anytime you need AdButler auth, endpoints, the advertiser→campaign→ad-item model, the reports endpoint, or the known gotchas. Covers verified-live behavior, not guesswork.
---

# AdButler API integration reference

Everything verified wiring Portal's **Spotlight** advertising to the **AdButler v2 API** (base `https://api.adbutler.com/v2`). Confirmed against live data (advertiser `176378` "Denon," campaign `1756045` "Denon 2026"). Always proxy server-side — **the API key never reaches the browser**.

## Auth & request basics

- **Auth:** HTTP Basic with the **literal API key** — `Authorization: Basic <KEY>`. ⚠️ **Do NOT base64-encode** (base64 → 401/403).
- **Key:** env `ADBUTLER_API_KEY`, server-side only. Return `{configured:false}` when unset.
- **Colon gotcha:** datetimes need a **literal `:`**. Encode params, then `replace(/%3A/g, ":")`.
- **Pagination:** `limit` + `offset` + `has_more`; page size 100; loop until `has_more` is false.
- **Shapes:** list endpoints → `{ data:[...], has_more }`; single-resource GET → the object directly.
- **Errors:** `{ object:"error", type, http_status, message, parameters:[{field,type,message}] }`. ⚠️ **Never truncate error bodies** — enum/validation messages are long and you need them. Read `parameters[0].message`.

## Object model (verified)

```
advertiser ──< campaign (standard_campaign) ──< ad-item (image_ad_item)
                                                    │ references a creative (image)
   placement ── assigns an ad-item ──▶ zone (on a schedule)
```

| Entity | Self path | Notes |
|---|---|---|
| Advertiser | `/advertisers` (+ `/advertisers/archived`) | `{id, name}`; non-archived count = "active advertisers" |
| Campaign | `/campaigns/standard/{id}` | `advertiser`, `name`, `start_at`/`end_at` (often null), `created_at` |
| Ad-item ("Ad Item") | `/ad-items/image/{id}` | `name`, `creative` (creative id), `creative_url`, `location` (click-through), `width`/`height`, `created_date`, `parent` ({type:"campaign"\|"zone", id}) |
| Placement | `/placements` | `advertisement{id,type}`, `zone`, `schedule`, `active`, `weight` — no campaign/advertiser field |
| Zone | `/zones` | serving slot |
| Creative | `/creatives/image/{id}` | metadata only — **no URL field** |

**Campaign → ad-items = the nested collection `GET /campaigns/standard/{id}/ad-items`** (the only reliable join).

## Endpoints used

- **advertisers:** `GET /advertisers` (paged).
- **summary:** `GET /reports?type=advertiser&period=month&from&to` → sum `summary.impressions`/`clicks`.
- **campaigns:** `GET /campaigns` (paged) + `GET /reports?type=campaign` (period) + a 2nd `type=campaign` report for the **current month** (Active = served this month).
- **campaign (landing):** `/campaigns/standard/{id}` (meta) + `/campaigns/standard/{id}/ad-items` (join) + `/reports?type=ad-item` for the period (map by id) + `/reports?type=ad-item` current month (Active) + `/reports?type=campaign` (totals).

## Reports endpoint

`GET /reports?type=<T>&period=month&from=<ISO>&to=<ISO>`

- **Valid types:** `overview, publisher, advertiser, zone, campaign, ad-item, textad, popup, geo-target, channel`. ⚠️ `banner`/`ad`/`creative` are **invalid** — per-creative metrics use **`ad-item`** (hyphenated).
- **Rows:** `{ type, id, summary:{ impressions, clicks, responses, ctr, ... }, details:[] }`.
- `period="month"` + explicit `from`/`to` works for **arbitrary ranges**. ISO with literal colon: `2026-06-01T00:00:00+00:00`.
- ⚠️ **The `ad-item` report is NOT filterable** by campaign/advertiser (params ignored — returns the whole account). Map rows to a campaign's ad-items **by `id`**.

## Creative images

- **Image URL = `https://servedbyadbutler.com/getad.img/?libBID={creativeId}`** — the **creative id is the `libBID`** (verified).
- Ad-items expose `creative` (id) and sometimes `creative_url` (may be `null` or the placeholder `default_banner.gif`).
- **Rule:** use `creative_url` if populated & not `default_banner.gif`, else `getad.img/?libBID={creative}`.

## Active vs. expired/inactive

- **Active = served impressions in the current month** (separate report on the server clock, independent of the selected period). Reliable, degrades gracefully.
- Secondary `campaignActive()` guard: explicit bool → past end date → status/state regex (`pause|archiv|expir|…`) → default true.

## Dead ends (don't retry)

| Attempt | Result |
|---|---|
| Base64 the key | 401/403 — use literal |
| `type=banner` / `ad` / `creative` | 400 — use `ad-item` |
| `/banners`, `/ads`, `/advertisements`, `/aditems`, `/items`, `/rotations` | 404 |
| `/ad-items?campaign={id}` filter | ignored — use the nested collection |
| `/campaigns/standard/{id}/placements` | 404 |
| truncating 4xx bodies | hides the messages you need |

## Minimal recipe — a campaign's ad-items with metrics

```js
const KEY = process.env.ADBUTLER_API_KEY;            // literal key, server-side only
const AB = "https://api.adbutler.com/v2";
const headers = { Authorization: "Basic " + KEY, Accept: "application/json" };
const qs = p => Object.entries(p).map(([k,v]) =>
  k + "=" + encodeURIComponent(String(v)).replace(/%3A/g, ":")).join("&");

const from = "2026-06-01T00:00:00+00:00", to = "2026-06-23T23:59:59+00:00";
const cid  = "1756045";

const items = (await (await fetch(`${AB}/campaigns/standard/${cid}/ad-items?limit=100`, { headers })).json()).data;
const rep   = (await (await fetch(`${AB}/reports?${qs({ type:"ad-item", period:"month", from, to })}`, { headers })).json()).data;
const met   = Object.fromEntries(rep.map(r => [String(r.id), r.summary]));

const out = items.map(it => ({
  id: it.id, name: it.name,
  impressions: met[it.id]?.impressions ?? 0,
  clicks: met[it.id]?.clicks ?? 0,
  image: (it.creative_url && !/default_banner\.gif/.test(it.creative_url))
    ? it.creative_url : `https://servedbyadbutler.com/getad.img/?libBID=${it.creative}`,
  clickThrough: it.location,
}));
```

> Note: **Featured Products** (the other Premium Placement product) is NOT in AdButler — it's production OLTP (`impressions` type 0, `userclicktracking`), not in Redshift. Handle via a placeholder seam.
