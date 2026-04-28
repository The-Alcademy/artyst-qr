// ─────────────────────────────────────────────────────────────────
// api/duplicate-job.ts
//
// POST /api/duplicate-job
// Browser-callable thin proxy for /api/duplicate-opportunity-admin.
// Attaches CA022_SECRET server-side.
// ─────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host  = req.headers["host"];
    const r = await fetch(`${proto}://${host}/api/duplicate-opportunity-admin`, {
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "x-ca022-secret": process.env.CA022_SECRET!,
      },
      body: JSON.stringify(req.body || {}),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    console.error("duplicate-job proxy error:", e);
    res.status(500).json({ error: "Proxy error" });
  }
}
