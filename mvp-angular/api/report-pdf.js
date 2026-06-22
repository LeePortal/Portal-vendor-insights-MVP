/**
 * /api/report-pdf — generic HTML -> PDF renderer (MVP implementation).
 *
 * POST { html, header?, footer?, margin? }  ->  application/pdf
 *
 * Renders with headless Chromium (puppeteer-core + @sparticuz/chromium, the serverless-optimized
 * Chromium build). The endpoint is intentionally GENERIC ("HTML in, PDF out") so that when we move
 * off Vercel the SAME client code can point at the production renderer (e.g. the existing WeasyPrint
 * pipeline, or a Gotenberg/Chromium container) with only a URL change — no rewrite. All Portal
 * branding lives in the HTML/header/footer the client sends, which is renderer-agnostic.
 */
// @sparticuz/chromium and puppeteer-core are ESM; load them via dynamic import() so this CommonJS
// function gets the correct module shape (.default), then use them normally.

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let browser;
  try {
    const { html, header, footer, margin } = await readBody(req);
    if (!html) return res.status(400).json({ error: "Missing 'html' in body" });

    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = (await import("puppeteer-core")).default;

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless ?? true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: !!(header || footer),
      headerTemplate: header || "<span></span>",
      footerTemplate: footer || "<span></span>",
      margin: margin || { top: "1.05in", bottom: "0.6in", left: "0.55in", right: "0.55in" },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(Buffer.from(pdf));
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  } finally {
    if (browser) { try { await browser.close(); } catch (_) { /* ignore */ } }
  }
};
