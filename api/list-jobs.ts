// ─────────────────────────────────────────────────────────────────
// api/list-jobs.ts
//
// GET /api/list-jobs
// Browser-callable thin proxy for /api/list-opportunities-admin.
// Attaches CA022_SECRET server-side so the secret never reaches
// the browser, matching the pattern used by publish-opportunity.ts.
//
// Same response shape as list-opportunities-admin.
// ─────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host  = req.headers["host"];
    const r = await fetch(`${proto}://${host}/api/list-opportunities-admin`, {
      headers: { "x-ca022-secret": process.env.CA022_SECRET! },
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    console.error("list-jobs proxy error:", e);
    res.status(500).json({ error: "Proxy error" });
  }
}
