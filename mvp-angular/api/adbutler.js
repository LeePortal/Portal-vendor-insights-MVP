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
      const from = iso(String(q.from || "")), to = iso(String(q.to || ""), true);
      const advertiserId = q.advertiserId ? String(q.advertiserId) : "";
      const all = await abPages("/campaigns");
      const mine = advertiserId ? all.filter((c) => advId(c) === advertiserId) : all;
      const rep = await ab("/reports", { type: "campaign", period: "month", from, to });
      const met = {};
      for (const row of (rep.data || [])) {
        const id = String(row.id); const s = row.summary || {};
        if (!met[id]) met[id] = { impressions: 0, clicks: 0 };
        met[id].impressions += num(s.impressions); met[id].clicks += num(s.clicks);
      }
      const campaigns = mine.map((c) => {
        const id = String(c.id); const m = met[id] || { impressions: 0, clicks: 0 };
        return { id, name: c.name || ("Campaign " + id), impressions: m.impressions, clicks: m.clicks };
      }).sort((a, b) => b.impressions - a.impressions);
      return res.status(200).json({ configured: true, campaigns });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
