/**
 * /api/adbutler — server-side proxy to the AdButler v2 API for Premium Placement (Spotlight) data.
 *
 * AdButler auth is HTTP Basic with the *literal* API key (NOT base64). The key stays server-side
 * (ADBUTLER_API_KEY) — never sent to the browser. Token-gated; ADMIN-ONLY for now (vendor-scoped
 * Premium Placement will come with the advertiser/user view). Returns { configured:false } when the
 * key isn't set so the UI can show a "connect AdButler" state instead of erroring.
 *
 * Actions (?action=):
 *   advertisers
 *     -> { configured, advertisers:[{id,name}] }   active (non-archived) advertisers; its length = "active advertisers" count
 *   summary&from=YYYY-MM-DD&to=YYYY-MM-DD[&advertiserId=ID]
 *     -> { configured, impressions, clicks }        Spotlight totals for the period (one advertiser if given)
 *   campaigns&advertiserId=ID&from=YYYY-MM-DD&to=YYYY-MM-DD
 *     -> { configured, campaigns:[{id,name,impressions,clicks}] }
 *
 * FIELD NOTES — verify against a live response once the key is set (a sample /reports?type=advertiser
 * and /campaigns payload would let us lock these):
 *   - /reports?type=advertiser&period=month rows: { id, summary:{ impressions, clicks } }  (impressions confirmed via the
 *     advertiser-report skill; `clicks` assumed to live on the same summary object)
 *   - /campaigns rows expose the owning advertiser id (tried as advertiser / advertiser_id / advertiserId)
 *   - /reports?type=campaign mirrors the advertiser report, keyed by campaign id
 *
 * Featured Products impressions/clicks are NOT here (their data isn't reachable yet) — the UI folds in a
 * placeholder 0 and will add them once that source exists.
 */
const { authClaims } = require("../lib/auth");

const AB_BASE = "https://api.adbutler.com/v2";
const KEY = process.env.ADBUTLER_API_KEY || process.env.AB_API_KEY || "";

// Encode params but keep ':' literal (AdButler datetimes), mirroring the reference script's safe=':'.
function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => k + "=" + encodeURIComponent(String(v)).replace(/%3A/g, ":"))
    .join("&");
}
async function ab(path, params) {
  const url = AB_BASE + path + (params ? "?" + qs(params) : "");
  const r = await fetch(url, { headers: { Authorization: "Basic " + KEY, Accept: "application/json" } });
  const txt = await r.text();
  if (!r.ok) throw new Error("AdButler " + r.status + " " + path + ": " + txt.slice(0, 300));
  try { return JSON.parse(txt); } catch (e) { return {}; }
}
async function abPages(path, extra) {
  let off = 0; const out = [];
  for (let i = 0; i < 50; i++) { // hard cap ~5000 rows
    const page = await ab(path, { limit: 100, offset: off, ...(extra || {}) });
    const data = (page && page.data) || [];
    out.push(...data);
    if (!page || !page.has_more) break;
    off += 100;
  }
  return out;
}
const iso = (ymd, end) => (ymd ? ymd + (end ? "T23:59:59+00:00" : "T00:00:00+00:00") : "");
const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);
const advId = (c) => String(c.advertiser != null ? c.advertiser : (c.advertiser_id != null ? c.advertiser_id : (c.advertiserId != null ? c.advertiserId : "")));

// Is a campaign currently running (Active) vs ended (Expired)? Best-effort from AdButler fields:
// explicit active flag, else an end date in the past, else a status/state string; defaults to active
// when there's no signal. VERIFY the field names against a live /campaigns response.
function campaignActive(c) {
  if (typeof c.active === "boolean") return c.active;
  if (typeof c.is_active === "boolean") return c.is_active;
  const end = c.end_date || c.enddate || c.end || c.date_end || c.flight_end || "";
  if (end) { const t = Date.parse(end); if (!isNaN(t) && t < Date.now()) return false; }
  const st = String(c.status || c.state || "").toLowerCase();
  if (st) {
    if (/(pause|archiv|expir|inactive|ended|complete|stop|disab|draft|pending)/.test(st)) return false;
    if (/(run|active|live|enabl|start)/.test(st)) return true;
  }
  return true;
}

// Best-effort image URL from a banner or creative object — checks the common AdButler field names.
function pickImageUrl(o) {
  if (!o || typeof o !== "object") return "";
  const cands = [o.image_url, o.imageUrl, o.url, o.source, o.src, o.media_url, o.preview, o.preview_url, o.cdn_url, o.thumbnail, o.thumbnail_url, o.file, o.path, o.creative_url, o.secure_url, o.view_url, o.served_url, o.asset_url, o.link];
  for (const c of cands) if (typeof c === "string" && /^https?:\/\//i.test(c)) return c;
  if (o.media && typeof o.media === "object") { const u = o.media.url || o.media.src || o.media.cdn_url || o.media.source; if (typeof u === "string" && /^https?:\/\//i.test(u)) return u; }
  return "";
}
const bannerCampId = (b) => String(b.campaign != null ? b.campaign : (b.campaign_id != null ? b.campaign_id : (b.campaignId != null ? b.campaignId : "")));

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    if (!process.env.AUTH_SECRET) return res.status(500).json({ error: "Auth is not configured." });
    const claims = authClaims(req);
    if (!claims) return res.status(401).json({ error: "Unauthorized" });

    const q = req.query || {};
    const action = String(q.action || "summary");
    // Admin actions are admin-only. `overview` is the vendor-facing advertiser view, scoped server-side to
    // the caller's OWN company (matched by name) — never to a client-supplied id — so any authenticated vendor may call it.
    if (claims.role !== "admin" && action !== "overview") return res.status(403).json({ error: "Admin only." });
    if (!KEY) return res.status(200).json({ configured: false });

    if (action === "advertisers") {
      const rows = await abPages("/advertisers");
      const advertisers = rows.map((a) => ({ id: String(a.id), name: a.name || "" })).filter((a) => a.name);
      return res.status(200).json({ configured: true, advertisers });
    }

    if (action === "summary") {
      const from = iso(String(q.from || "")), to = iso(String(q.to || ""), true);
      const advertiserId = q.advertiserId ? String(q.advertiserId) : "";
      const body = await ab("/reports", { type: "advertiser", period: "month", from, to });
      let impressions = 0, clicks = 0;
      for (const row of (body.data || [])) {
        if (advertiserId && String(row.id) !== advertiserId) continue;
        const s = row.summary || {};
        impressions += num(s.impressions);
        clicks += num(s.clicks);
      }
      return res.status(200).json({ configured: true, impressions, clicks });
    }

    if (action === "campaigns") {
      // Returns ALL campaigns (across advertisers) with owning company, active/expired state, and the
      // period's impressions/clicks. The UI filters by Company + Status client-side.
      const from = iso(String(q.from || "")), to = iso(String(q.to || ""), true);
      // Current month (server clock) — used to decide Active vs Expired by real delivery, independent of the Period filter.
      const now = new Date();
      const cmFrom = iso(now.getUTCFullYear() + "-" + String(now.getUTCMonth() + 1).padStart(2, "0") + "-01");
      const cmTo = iso(now.toISOString().slice(0, 10), true);
      const [advList, all, rep, repNow, adItemsAll] = await Promise.all([
        abPages("/advertisers"),
        abPages("/campaigns"),
        ab("/reports", { type: "campaign", period: "month", from, to }),
        ab("/reports", { type: "campaign", period: "month", from: cmFrom, to: cmTo }),
        abPages("/ad-items").catch(() => []),
      ]);
      const advName = {};
      for (const a of advList) advName[String(a.id)] = a.name || "";
      // Count ad-items per campaign (each campaign-parented ad-item attributes to its parent campaign).
      const adItemCount = {};
      for (const it of adItemsAll) { if (it && it.parent && it.parent.type === "campaign") { const pid = String(it.parent.id); adItemCount[pid] = (adItemCount[pid] || 0) + 1; } }
      const met = {};
      for (const row of (rep.data || [])) {
        const id = String(row.id); const s = row.summary || {};
        if (!met[id]) met[id] = { impressions: 0, clicks: 0 };
        met[id].impressions += num(s.impressions); met[id].clicks += num(s.clicks);
      }
      const curImpr = {};
      for (const row of (repNow.data || [])) { const id = String(row.id); curImpr[id] = (curImpr[id] || 0) + num((row.summary || {}).impressions); }
      const campaigns = all.map((c) => {
        const id = String(c.id); const aid = advId(c); const m = met[id] || { impressions: 0, clicks: 0 };
        // Active = AdButler state isn't expired AND it actually served impressions this month. The impressions
        // test is the reliable signal; campaignActive() only catches a definite expiry (past end date / paused).
        const active = campaignActive(c) && (curImpr[id] || 0) > 0;
        return { id, name: c.name || ("Campaign " + id), advertiserId: aid, advertiserName: advName[aid] || "", active, impressions: m.impressions, clicks: m.clicks, adItems: adItemCount[id] || 0 };
      }).sort((a, b) => b.impressions - a.impressions);
      return res.status(200).json({ configured: true, campaigns });
    }

    if (action === "campaign") {
      // One campaign's detail for the admin landing page: meta + period impressions/clicks + its AD ITEMS
      // (the creatives), each with its own image, click-through, created date, and per-ad-item impressions/clicks.
      //
      // AdButler model (verified against live data):
      //   advertiser -> campaign (standard_campaign) -> ad-items (image_ad_item, parent.type="campaign")
      //   A campaign's ad-items come from the NESTED collection /campaigns/standard/{id}/ad-items
      //   (the flat /ad-items?campaign= filter is IGNORED). Each ad-item carries: name, creative (id) and/or
      //   creative_url (served image), location (click-through), width/height, created_date.
      //   Image URL = creative_url when populated, else getad.img/?libBID={creative id} (verified rendering).
      //   Per-ad-item metrics come from /reports?type=ad-item (account-wide, keyed by ad-item id; NOT filterable,
      //   so we map by id). Active = served impressions in the CURRENT month (same rule as campaigns).
      const campaignId = String(q.campaignId || "");
      if (!campaignId) return res.status(400).json({ error: "campaignId required" });
      const from = iso(String(q.from || "")), to = iso(String(q.to || ""), true);
      const now = new Date();
      const cmFrom = iso(now.getUTCFullYear() + "-" + String(now.getUTCMonth() + 1).padStart(2, "0") + "-01");
      const cmTo = iso(now.toISOString().slice(0, 10), true);
      const cPath = "/campaigns/standard/" + encodeURIComponent(campaignId);
      const [camp, advList, items, repCamp, repItem, repItemNow] = await Promise.all([
        ab(cPath).catch(() => ({})),
        abPages("/advertisers").catch(() => []),
        abPages(cPath + "/ad-items").catch(() => []),
        ab("/reports", { type: "campaign", period: "month", from, to }).catch(() => ({})),
        ab("/reports", { type: "ad-item", period: "month", from, to }).catch(() => ({})),
        ab("/reports", { type: "ad-item", period: "month", from: cmFrom, to: cmTo }).catch(() => ({})),
      ]);
      const aid = advId(camp);
      const a = advList.find((x) => String(x.id) === aid);
      const advertiserName = a ? (a.name || "") : "";
      // Per-ad-item metrics keyed by ad-item id (selected period) + current-month impressions (for Active).
      const met = {};
      for (const row of (repItem.data || [])) { const s = row.summary || {}; met[String(row.id)] = { impressions: num(s.impressions), clicks: num(s.clicks) }; }
      const curImpr = {};
      for (const row of (repItemNow.data || [])) curImpr[String(row.id)] = num((row.summary || {}).impressions);
      const creatives = items.map((it) => {
        const id = String(it.id);
        const m = met[id] || { impressions: 0, clicks: 0 };
        const imageUrl = (it.creative_url && !/default_banner\.gif/i.test(it.creative_url))
          ? it.creative_url
          : (it.creative ? "https://servedbyadbutler.com/getad.img/?libBID=" + encodeURIComponent(String(it.creative)) : "");
        return {
          bannerId: id,
          name: it.name || ("Ad Item " + id),
          width: num(it.width), height: num(it.height),
          imageUrl,
          clickUrl: it.location || "",
          createdDate: it.created_date || "",
          impressions: m.impressions, clicks: m.clicks,
          active: (curImpr[id] || 0) > 0,
        };
      }).sort((x, y) => String(y.createdDate).localeCompare(String(x.createdDate))); // newest uploaded first
      // Campaign-level totals for the selected period.
      let impressions = 0, clicks = 0;
      for (const row of (repCamp.data || [])) if (String(row.id) === campaignId) { const s = row.summary || {}; impressions += num(s.impressions); clicks += num(s.clicks); }
      const out = {
        configured: true,
        campaign: { id: campaignId, name: camp.name || ("Campaign " + campaignId), advertiserId: aid, advertiserName, active: campaignActive(camp), impressions, clicks },
        creatives,
      };
      return res.status(200).json(out);
    }

    if (action === "overview") {
      // VENDOR-FACING: scope to the caller's own advertiser, matched by NAME against their token's company/brand
      // (claims.brand + allowedBrands). Returns the advertiser's ad-items (across all its campaigns) with
      // per-item impressions/clicks + active, plus aggregate impressions/clicks. The advertiser is derived from
      // the token, NOT from any client param, so a vendor can only ever see their own data.
      const from = iso(String(q.from || "")), to = iso(String(q.to || ""), true);
      const now = new Date();
      const cmFrom = iso(now.getUTCFullYear() + "-" + String(now.getUTCMonth() + 1).padStart(2, "0") + "-01");
      const cmTo = iso(now.toISOString().slice(0, 10), true);
      const advList = await abPages("/advertisers");
      const advIds = new Set();
      let advName = "";
      if (claims.role === "admin") {
        // Admin previews ONE advertiser by id (the /premium Brand picker). No id selected => nothing to show.
        const wantId = String(q.advertiserId || "");
        if (!wantId) return res.status(200).json({ configured: true, advertiserName: "", impressions: 0, clicks: 0, adItems: [] });
        const adv = advList.find((a) => String(a.id) === wantId);
        if (!adv) return res.status(200).json({ configured: true, advertiserName: "", impressions: 0, clicks: 0, adItems: [] });
        advIds.add(String(adv.id)); advName = adv.name || "";
      } else {
        // Vendor: ALL advertisers whose name matches one of the vendor's brands (claims.brand + allowedBrands) —
        // a company can own several brands, so the view picks up every one the admin set on the account.
        // Matched by name from the TOKEN, never a client param.
        const norm = (s) => String(s || "").trim().toLowerCase();
        const names = [norm(claims.brand), ...((claims.allowedBrands) || []).map(norm)].filter(Boolean);
        // Names rarely match exactly (AdButler "Origin" vs Portal "Origin Acoustics"), so match equal-or-prefix either way.
        const rel = (an) => { const x = norm(an); return names.some((b) => b === x || b.startsWith(x) || x.startsWith(b)); };
        const matched = advList.filter((a) => rel(a.name));
        if (!matched.length) return res.status(200).json({ configured: true, advertiserName: "", impressions: 0, clicks: 0, adItems: [] });
        for (const a of matched) advIds.add(String(a.id));
        advName = matched.map((a) => a.name).filter(Boolean).join(", ");
      }
      const [allC, adItemsAll, repItem, repItemNow] = await Promise.all([
        abPages("/campaigns"),
        abPages("/ad-items").catch(() => []),
        ab("/reports", { type: "ad-item", period: "month", from, to }).catch(() => ({})),
        ab("/reports", { type: "ad-item", period: "month", from: cmFrom, to: cmTo }).catch(() => ({})),
      ]);
      const myCampaignIds = new Set(allC.filter((c) => advIds.has(advId(c))).map((c) => String(c.id)));
      const met = {};
      for (const row of (repItem.data || [])) { const s = row.summary || {}; met[String(row.id)] = { impressions: num(s.impressions), clicks: num(s.clicks) }; }
      const curImpr = {};
      for (const row of (repItemNow.data || [])) curImpr[String(row.id)] = num((row.summary || {}).impressions);
      const adItems = adItemsAll
        .filter((it) => it && it.parent && it.parent.type === "campaign" && myCampaignIds.has(String(it.parent.id)))
        .map((it) => {
          const id = String(it.id); const m = met[id] || { impressions: 0, clicks: 0 };
          const imageUrl = (it.creative_url && !/default_banner\.gif/i.test(it.creative_url))
            ? it.creative_url
            : (it.creative ? "https://servedbyadbutler.com/getad.img/?libBID=" + encodeURIComponent(String(it.creative)) : "");
          return { bannerId: id, name: it.name || ("Ad Item " + id), width: num(it.width), height: num(it.height), imageUrl, clickUrl: it.location || "", createdDate: it.created_date || "", impressions: m.impressions, clicks: m.clicks, active: (curImpr[id] || 0) > 0 };
        })
        .sort((a, b) => String(b.createdDate).localeCompare(String(a.createdDate)));
      const impressions = adItems.reduce((s, c) => s + c.impressions, 0);
      const clicks = adItems.reduce((s, c) => s + c.clicks, 0);
      return res.status(200).json({ configured: true, advertiserName: advName, impressions, clicks, adItems });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
