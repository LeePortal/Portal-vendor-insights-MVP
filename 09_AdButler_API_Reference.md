# AdButler API — Integration Reference (Premium Placement / Spotlight)

Everything we learned wiring Portal's **Spotlight** advertising (the banner ads in the proposal feed) to the **AdButler v2 API**. This powers the admin Premium Placement panel and the campaign landing pages. The whole model below was confirmed against live data (advertiser `176378` "Denon," campaign `1756045` "Denon 2026") — it is not guesswork.

The integration lives in `mvp-angular/api/adbutler.js` (a token-gated, admin-only serverless proxy) and `mvp-angular/src/app/core/premium-placement.source.ts` (the client). **The API key never reaches the browser** — every call is proxied server-side.

---

## 1. Auth & request basics

- **Base URL:** `https://api.adbutler.com/v2`
- **Auth:** HTTP Basic with the **literal API key** in the header — `Authorization: Basic <KEY>`. ⚠️ **Do NOT base64-encode the key.** Standard Basic auth expects base64; AdButler does not. Base64-encoding gives 401/403.
- **Key storage:** env var `ADBUTLER_API_KEY` (also accepts `AB_API_KEY`), set in Vercel, **server-side only**. The proxy returns `{ configured: false }` when it's unset so the UI can show a "connect AdButler" state instead of erroring.
- **Access control:** the campaign-management actions are admin-gated (`claims.role === "admin"`); the **vendor-facing `overview` action** is token-scoped to the caller's own advertiser (it powers the `/premium` dashboard; admins preview a brand via a picker). Both are now built.
- **Query encoding gotcha:** AdButler datetimes contain `:` and the API wants it **literal**. Encode params normally, then restore the colon (`encodeURIComponent(v).replace(/%3A/g, ":")`). See `qs()` in the proxy.
- **Pagination:** `limit` + `offset` + `has_more`. Page size 100; loop until `has_more` is false. See `abPages()`.
- **Response shapes:**
  - List endpoints → `{ data: [ ... ], has_more, ... }`
  - Single-resource GET → the object **directly** (no `data` wrapper)
- **Error shape:** `{ object:"error", type, http_status, message, parameters:[{ field, type, message }] }`. ⚠️ **Never truncate error bodies** — validation messages (e.g. the list of valid enum values) are long. Our `ab()` helper once clipped bodies to 300 chars and that hid the full report-types list for days. For diagnostics, fetch the 4xx directly and read `parameters[0].message`.

---

## 2. The object model (verified live)

```
advertiser ──<  campaign (standard_campaign)  ──<  ad-item (image_ad_item)
                                                        │  references a creative (image)
   placement  ──  assigns an ad-item  ──▶  zone  (on a schedule)
```

| Entity | Resource (self path) | What it is | Key fields |
|---|---|---|---|
| **Advertiser** | `/advertisers` (+ `/advertisers/archived`) | The company/brand buying ads | `id`, `name` |
| **Campaign** | `/campaigns/standard/{id}` | A campaign (the dashboard's "campaign") | `advertiser`, `name`, `start_at`/`end_at` (often null), `created_at` |
| **Ad-item** | `/ad-items/image/{id}` | The **"Ad Item"** — one creative placement. The dashboard's per-item rows | `name`, `creative` (creative id), `creative_url`, `location` (click-through), `width`/`height`, `created_date`, `parent` |
| **Placement** | `/placements` | Assigns an ad-item → a zone on a schedule | `advertisement{id,type}`, `zone`, `schedule`, `active`, `weight` |
| **Zone** | `/zones` | Where an ad serves (a slot on a page) | `id`, `name`, `width`/`height` |
| **Creative** | `/creatives/image/{id}` | The uploaded image asset (metadata only) | `id`, `name`, `file_name`, `width`, `height` — **no URL field** |

Key relationships:

- An **ad-item's `parent`** is either `{type:"campaign", id}` (campaign-model — current) or `{type:"zone", id}` (legacy ads assigned straight to a zone). Denon's are campaign-parented.
- **Campaign → ad-items is the nested collection** `GET /campaigns/standard/{id}/ad-items`. This is the only reliable join (see gotchas).
- A **placement** carries no advertiser/campaign field — it's just ad-item↔zone wiring, not needed for reporting.

---

## 3. Endpoints we actually use

The proxy exposes these actions (`?action=`):

- **`advertisers`** → `GET /advertisers` (paged) → `[{id, name}]`. The count of non-archived advertisers = the "active advertisers" KPI.
- **`summary&from&to`** → `GET /reports?type=advertiser&period=month&from&to` → sum `summary.impressions` / `summary.clicks` (optionally for one advertiser).
- **`campaigns&from&to`** → `GET /campaigns` (paged) + `GET /reports?type=campaign` for the selected period + a **second** `type=campaign` report for the **current month** → each campaign `{id, name, advertiserId, advertiserName, active, impressions, clicks}`. Filtered by Company + Status client-side.
- **`campaign&campaignId&from&to`** (landing page) →
  1. `GET /campaigns/standard/{id}` — campaign meta
  2. `GET /campaigns/standard/{id}/ad-items` — **the campaign's ad-items** (the join)
  3. `GET /reports?type=ad-item&period=month&from&to` — per-ad-item metrics (account-wide; map by id)
  4. `GET /reports?type=ad-item` for the **current month** — to mark each ad-item Active
  5. `GET /reports?type=campaign` — campaign-level totals
- **`overview&from&to[&advertiserId]`** (vendor `/premium`) → the caller's own advertiser (matched from the token; admins pass `advertiserId` to preview): its ad-items with per-item impressions/clicks + Active, aggregate totals, and the served-impression span (`advertisingStart`/`advertisingEnd`, scanned monthly since 2023) used to shade the growth chart.

---

## 4. The reports endpoint

`GET /reports?type=<T>&period=month&from=<ISO>&to=<ISO>`

- **Valid `type` values:** `overview`, `publisher`, `advertiser`, `zone`, `campaign`, `ad-item`, `textad`, `popup`, `geo-target`, `channel`.
  ⚠️ `banner`, `ad`, and `creative` are **NOT** valid (they 400). The per-creative report type is **`ad-item`** (hyphenated).
- **Row shape:** `{ type, id, summary:{ impressions, clicks, responses, ctr, conversions, cost, ... }, details:[] }`. Use `summary.impressions` and `summary.clicks`.
- **`period="month"` with explicit `from`/`to` works for arbitrary ranges** despite the name. Use ISO datetimes with a literal colon, e.g. `2026-06-01T00:00:00+00:00` … `2026-06-23T23:59:59+00:00`.
- ⚠️ **The `ad-item` report is NOT filterable by campaign or advertiser** — passing `campaign=` / `advertiser=` is silently ignored and you get the whole account. Always map ad-item report rows to a campaign's ad-items **by `id`** (ids come from the nested `/campaigns/standard/{id}/ad-items` collection).

---

## 5. Creative images

- **Served image URL = `https://servedbyadbutler.com/getad.img/?libBID={creativeId}`** — the **creative id is the `libBID`** (verified rendering, e.g. ad-item "Denon Home 600" → creative `5287843`).
- Ad-item objects expose `creative` (the creative id) and sometimes `creative_url` (already a served URL — but may be `null` in nested lists, or the literal placeholder `https://servedbyadbutler.com/default_banner.gif`).
- **Resolution rule we use:** `imageUrl = creative_url` when it's populated and not `default_banner.gif`, else `getad.img/?libBID={creative}`.
- `/creatives/image/{id}` is **metadata only** (`id, name, file_name, width, height, mime_type, advertiser`) — there is **no image URL field even in the detail response**, which is why we serve via `getad.img`.

---

## 6. Active vs. expired / inactive

- **Active = served impressions in the current month** (a separate `type=campaign` or `type=ad-item` report on the server clock, independent of the selected Period). This is the reliable signal and degrades gracefully.
- `campaignActive()` is a secondary guard, best-effort across field names: explicit `active`/`is_active` bool → an end-date in the past → a `status`/`state` string regex (`pause|archiv|expir|…`) → defaults to active when there's no signal.
- A campaign/ad-item is shown **Active** only when both agree it's running AND it actually served this month.

---

## 7. Dead ends — do not retry these

| Attempt | Result |
|---|---|
| Base64-encoding the API key | 401/403 (use the literal key) |
| `/reports?type=banner` · `type=ad` · `type=creative` | 400 (use `ad-item`) |
| `/banners`, `/ads`, `/advertisements`, `/aditems`, `/items`, `/rotations` | 404 |
| `/ad-items?campaign={id}` (list filter) | Ignored — returns a generic list. Use the nested collection. |
| `/campaigns/standard/{id}/placements` | 404 |
| Truncating 4xx error bodies | Hides the validation/enum messages you need |

---

## 8. Where this lives in the codebase

- **`mvp-angular/api/adbutler.js`** — the proxy. Helpers: `qs()` (literal-colon encoding), `ab()` (single call), `abPages()` (paginate), `iso()` (ymd→ISO), `num()`, `advId()`, `campaignActive()`, `pickImageUrl()`*. Actions: `advertisers`, `summary`, `campaigns`, `campaign`.
- **`mvp-angular/src/app/core/premium-placement.source.ts`** — `PremiumPlacementSource` client. Interfaces `PpAdvertiser`, `PpCampaign`, `PpCreative` (an ad-item: `{bannerId, name, width, height, imageUrl, clickUrl, createdDate, impressions, clicks, active}`), `PpCampaignDetail`.
- **`mvp-angular/src/app/pages/admin.component.ts`** — admin Premium Placement panel (Period / Company / Status filters, KPIs, company accordion).
- **`mvp-angular/src/app/pages/campaign-landing.component.ts`** — campaign landing page (Period filter + per-ad-item creative cards).

\* `pickImageUrl()` / `bannerCampId()` are leftover from the earlier `/creatives` approach and are now dead code — safe to delete.

---

## 9. The other Premium Placement product (not AdButler)

**Featured Products** (force-ranked product placement) is **not** in AdButler. Its event data lives in the production OLTP DB (`impressions` with `impressiontype=0`, `userclicktracking`) and is **not in Redshift**, so the MVP uses a placeholder seam (`ppFeatured*` = 0). See `08_Vendor_User_Store_and_Permissions.md` and the Premium Placement data-model notes.

---

## 10. Minimal recipe — a campaign's ad-items with metrics

```js
const KEY = process.env.ADBUTLER_API_KEY;            // literal key, server-side only
const AB = "https://api.adbutler.com/v2";
const headers = { Authorization: "Basic " + KEY, Accept: "application/json" };
const qs = p => Object.entries(p).map(([k,v]) =>
  k + "=" + encodeURIComponent(String(v)).replace(/%3A/g, ":")).join("&");

const from = "2026-06-01T00:00:00+00:00", to = "2026-06-23T23:59:59+00:00";
const cid  = "1756045";

// 1) the campaign's ad-items (the join)
const items = (await (await fetch(`${AB}/campaigns/standard/${cid}/ad-items?limit=100`, { headers })).json()).data;

// 2) per-ad-item metrics (account-wide → map by id)
const rep = (await (await fetch(`${AB}/reports?${qs({ type:"ad-item", period:"month", from, to })}`, { headers })).json()).data;
const met = Object.fromEntries(rep.map(r => [String(r.id), r.summary]));

// 3) join + resolve image
const out = items.map(it => ({
  id: it.id,
  name: it.name,
  impressions: met[it.id]?.impressions ?? 0,
  clicks: met[it.id]?.clicks ?? 0,
  image: (it.creative_url && !/default_banner\.gif/.test(it.creative_url))
    ? it.creative_url
    : `https://servedbyadbutler.com/getad.img/?libBID=${it.creative}`,
  clickThrough: it.location,
}));
```
