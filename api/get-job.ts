// ─────────────────────────────────────────────────────────────────
// api/get-job.ts
//
// GET /api/get-job?slug={slug}
// Browser-callable thin proxy for /api/get-opportunity-admin.
// Attaches CA022_SECRET server-side so the secret never reaches
// the browser, matching the pattern used by publish-opportunity.ts.
//
// Same response shape as get-opportunity-admin.
// ─────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const slug = String(req.query.slug || "").trim();
  if (!slug) {
    res.status(400).json({ error: "Missing slug" });
    return;
  }

  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host  = req.headers["host"];
    const r = await fetch(`${proto}://${host}/api/get-opportunity-admin?slug=${encodeURIComponent(slug)}`, {
      headers: { "x-ca022-secret": process.env.CA022_SECRET! },
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    console.error("get-job proxy error:", e);
    res.status(500).json({ error: "Proxy error" });
  }
}
