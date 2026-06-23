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
    if (claims.role !== "admin") return res.status(403).json({ error: "Admin only (vendor-scoped Premium Placement comes with the advertiser view)." });
    if (!KEY) return res.status(200).json({ configured: false });

    const q = req.query || {};
    const action = String(q.action || "summary");

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
      const [advList, all, rep, repNow] = await Promise.all([
        abPages("/advertisers"),
        abPages("/campaigns"),
        ab("/reports", { type: "campaign", period: "month", from, to }),
        ab("/reports", { type: "campaign", period: "month", from: cmFrom, to: cmTo }),
      ]);
      const advName = {};
      for (const a of advList) advName[String(a.id)] = a.name || "";
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
        return { id, name: c.name || ("Campaign " + id), advertiserId: aid, advertiserName: advName[aid] || "", active, impressions: m.impressions, clicks: m.clicks };
      }).sort((a, b) => b.impressions - a.impressions);
      return res.status(200).json({ configured: true, campaigns });
    }

    if (action === "campaign") {
      // One campaign's detail: meta + period impressions/clicks + its banners' creative IMAGE urls.
      // Image resolution is best-effort across AdButler field names; if none resolve, `debug` returns the
      // raw banner/creative so the field can be mapped from live data.
      const campaignId = String(q.campaignId || "");
      if (!campaignId) return res.status(400).json({ error: "campaignId required" });
      const from = iso(String(q.from || "")), to = iso(String(q.to || ""), true);
      const [allC, advList] = await Promise.all([
        abPages("/campaigns"),
        abPages("/advertisers").catch(() => []),
      ]);
      const camp = allC.find((c) => String(c.id) === campaignId) || {};
      const aid = advId(camp);
      const a = advList.find((x) => String(x.id) === aid);
      const advertiserName = a ? (a.name || "") : "";

      // This AdButler account exposes /creatives (not /banners), each tied to an `advertiser` (no campaign
      // link in the API). Show the campaign's advertiser's image creatives. The list has no URL field, so for
      // each we also pull /creatives/{id} detail (which may carry the served image URL) and report a full
      // sample in `debug` so the exact image field can be locked.
      const probes = [];
      let creativesRaw = [];
      try { creativesRaw = await abPages("/creatives"); probes.push({ path: "/creatives", ok: true, count: creativesRaw.length }); }
      catch (e) { probes.push({ path: "/creatives", ok: false, error: String((e && e.message) || e).slice(0, 160) }); }
      const mineC = creativesRaw.filter((c) => String(c.advertiser != null ? c.advertiser : "") === aid);
      const pool = (mineC.length ? mineC : creativesRaw).slice(0, 12);
      // getad.img/?libBID={id} serves the image. Try the CREATIVE id directly (we have those); the real
      // serving id may instead be an Ad Item (banner) id, so also probe candidate ad-item sources below.
      const creatives = pool.map((c) => ({
        bannerId: String(c.id),
        name: c.name || c.file_name || ("Creative " + c.id),
        width: num(c.width), height: num(c.height),
        imageUrl: "https://servedbyadbutler.com/getad.img/?libBID=" + encodeURIComponent(String(c.id)),
      }));
      // ad-item report (type=ad-item) gives per-ad-item impressions/clicks but is NOT filterable by campaign
      // (the campaign/advertiser params are ignored — identical 41 rows). ad-items carry no advertiser/campaign
      // field either, only a `parent`. So find the campaign->ad-item link: nested campaign collection, a list
      // filter, or `parent.id==campaign`. Campaign-model ad-items should parent to the campaign; legacy ones to a zone.
      const probe = async (path, params) => {
        try { const r = await ab(path, params); const arr = Array.isArray(r) ? r : ((r && r.data) || r); return { path, params: params || null, ok: true, count: Array.isArray(arr) ? arr.length : undefined, sample: Array.isArray(arr) ? (arr[0] || null) : arr }; }
        catch (e) { return { path, params: params || null, ok: false, error: String((e && e.message) || e).slice(0, 140) }; }
      };
      const mapProbes = [];
      mapProbes.push(await probe("/campaigns/standard/" + encodeURIComponent(campaignId) + "/ad-items"));
      mapProbes.push(await probe("/campaigns/standard/" + encodeURIComponent(campaignId) + "/placements"));
      mapProbes.push(await probe("/ad-items", { campaign: campaignId }));
      // Scan ad-items for a campaign linkage in `parent` (bounded to avoid timeout).
      let adItemsAll = [];
      try {
        for (let off = 0, i = 0; i < 8; i++, off += 100) {
          const r = await ab("/ad-items", { limit: 100, offset: off });
          const d = (r && r.data) || []; adItemsAll.push(...d);
          if (!r || !r.has_more) break;
        }
      } catch (e) { /* */ }
      const parentTypes = {};
      for (const it of adItemsAll) { const t = (it.parent && it.parent.type) || "none"; parentTypes[t] = (parentTypes[t] || 0) + 1; }
      const parentedToCampaign = adItemsAll.filter((it) => it.parent && String(it.parent.id) === campaignId).map((it) => ({ id: it.id, name: it.name, parentType: it.parent.type }));
      const sampleParents = adItemsAll.slice(0, 6).map((it) => ({ id: it.id, name: it.name, parent: it.parent, created_date: it.created_date }));
      let impressions = 0, clicks = 0;
      try {
        const rep = await ab("/reports", { type: "campaign", period: "month", from, to });
        for (const row of (rep.data || [])) if (String(row.id) === campaignId) { const s = row.summary || {}; impressions += num(s.impressions); clicks += num(s.clicks); }
      } catch (e) { /* metrics optional */ }
      const out = {
        configured: true,
        campaign: { id: campaignId, name: camp.name || ("Campaign " + campaignId), advertiserId: aid, advertiserName, active: campaignActive(camp), impressions, clicks },
        creatives,
      };
      // DIAGNOSTIC (temporary): find the campaign->ad-item link (nested / list-filter / parent scan).
      out.debug = {
        campaignId,
        advertiserId: aid,
        mapProbes,
        adItemsTotal: adItemsAll.length,
        parentTypes,
        parentedToCampaign,
        sampleParents,
      };
      return res.status(200).json(out);
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
