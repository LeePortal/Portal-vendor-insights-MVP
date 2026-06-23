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

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
