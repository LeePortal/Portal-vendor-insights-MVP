/**
 * /api/admin-usage — ADMIN-ONLY monitoring for the "AI Assistants" admin tab.
 *
 * Surfaces the request_log: MCP/agent aggregates (KPIs, daily volume, top assistants, top tools),
 * per-user pull counts (UI vs agent), and a recent agent-request feed. Read-only; no PII beyond the
 * email already visible to admins in the vendor admin screens.
 *
 * Window: ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to the last 30 days).
 */
const { authClaims } = require("../lib/auth");
const db = require("../lib/db");

const DAY = 86400000;
const DRE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  const claims = authClaims(req);
  if (!claims) return res.status(401).json({ error: "Unauthorized" });
  if (claims.role !== "admin") return res.status(403).json({ error: "Admin only." });
  if (!db.isConfigured()) return res.status(200).json({ configured: false, mcp: null, usage: [], recent: [] });

  const q = req.query || {};
  const to = DRE.test(q.to || "") ? new Date(q.to + "T23:59:59").getTime() : Date.now();
  const from = DRE.test(q.from || "") ? new Date(q.from + "T00:00:00").getTime() : to - 30 * DAY;

  try {
    const [mcp, usage, recent] = await Promise.all([
      db.mcpStats(from, to),
      db.usageByUser(from, to),
      db.recentRequests({ source: "agent", limit: 50 }),
    ]);
    return res.status(200).json({ configured: true, from, to, mcp, usage, recent });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
