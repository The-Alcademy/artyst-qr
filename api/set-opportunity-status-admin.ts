// ─────────────────────────────────────────────────────────────────
// api/set-opportunity-status-admin.ts
//
// POST /api/set-opportunity-status-admin
// Sets an opportunity's status to 'open' or 'closed'.
// Closed status leaves the row, the QR code, and the public page intact —
// the public page renders the "now closed" banner via api/opportunity.ts.
//
// Auth: x-ca022-secret header must equal process.env.CA022_SECRET
// Body: { slug: string, status: 'open' | 'closed' }
//
// Part of CA-022 "Hire someone" workspace — Step 4.
// ─────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const ADMIN_SECRET      = process.env.CA022_SECRET || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-ca022-secret");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!ADMIN_SECRET) {
    res.status(500).json({ error: "Server misconfigured: CA022_SECRET not set" });
    return;
  }

  if (req.headers["x-ca022-secret"] !== ADMIN_SECRET) {
    res.status(401).json({ error: "Unauthorised" });
    return;
  }

  const body = (typeof req.body === "string" ? safeJson(req.body) : req.body) || {};
  const slug   = typeof body.slug   === "string" ? body.slug.trim()   : "";
  const status = typeof body.status === "string" ? body.status.trim() : "";

  if (!slug)                               { res.status(400).json({ error: "Missing slug" }); return; }
 if (status !== "open" && status !== "filled") {
    res.status(400).json({ error: "status must be 'open' or 'filled'" });
    return;
  }

  // Update the opportunity row
  const { data: opp, error: oppErr } = await supabase
    .from("opportunities")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("slug", slug)
    .select("id, slug, status, qr_code_id, updated_at")
    .maybeSingle();

  if (oppErr) {
    console.error("set-opportunity-status update error:", oppErr);
    res.status(500).json({ error: "Database error" });
    return;
  }
  if (!opp) {
    res.status(404).json({ error: "Opportunity not found" });
    return;
  }


  res.status(200).json({ ok: true, ...opp });
}

function safeJson(text: string): any {
  try { return JSON.parse(text); }
  catch { return null; }
}
