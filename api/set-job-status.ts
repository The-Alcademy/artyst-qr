// ─────────────────────────────────────────────────────────────────
// api/set-job-status.ts
//
// POST /api/set-job-status
// Browser-callable thin proxy for /api/set-opportunity-status-admin.
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
    const r = await fetch(`${proto}://${host}/api/set-opportunity-status-admin`, {
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
    console.error("set-job-status proxy error:", e);
    res.status(500).json({ error: "Proxy error" });
  }
}
