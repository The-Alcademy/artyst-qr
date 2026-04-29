// ─────────────────────────────────────────────────────────────────
// api/hire-applicant.ts
//
// POST /api/hire-applicant
// Marks a single application as 'hired', and closes the role
// (sets opportunities.status='filled') in one atomic-ish operation.
// Returns the list of OTHER applicants for the same role so the UI
// can prompt for bulk-rejection.
//
// Body: { application_id: string }
//
// Response: {
//   ok: true,
//   hired_application_id: string,
//   opportunity_slug:     string,
//   role_label:           string,
//   other_applicants: [
//     { id, name, email, status, submitted_at }, ...
//   ]
// }
//
// Part of CA-022 "Hire someone" workspace — Step 7.
// ─────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (typeof req.body === "string" ? safeJson(req.body) : req.body) || {};
  const application_id = typeof body.application_id === "string" ? body.application_id.trim() : "";
  if (!application_id) {
    res.status(400).json({ error: "Missing application_id" });
    return;
  }

  // 1. Look up the application — we need its opportunity_slug
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, name, email, opportunity_slug, status")
    .eq("id", application_id)
    .maybeSingle();

  if (appErr) {
    console.error("hire-applicant fetch error:", appErr);
    res.status(500).json({ error: "Database error" });
    return;
  }
  if (!app) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  if (!app.opportunity_slug) {
    res.status(400).json({ error: "Application has no opportunity_slug — cannot close role" });
    return;
  }

  // 2. Mark this application as 'hired'
  const { error: hireErr } = await supabase
    .from("applications")
    .update({ status: "hired" })
    .eq("id", application_id);

  if (hireErr) {
    console.error("hire-applicant mark hired error:", hireErr);
    res.status(500).json({ error: "Failed to mark applicant as hired" });
    return;
  }

  // 3. Close the role
  const { data: opp, error: oppErr } = await supabase
    .from("opportunities")
    .update({
      status:     "filled",
      updated_at: new Date().toISOString(),
    })
    .eq("slug", app.opportunity_slug)
    .select("id, slug, title")
    .maybeSingle();

  if (oppErr) {
    console.error("hire-applicant close role error:", oppErr);
    // Don't fail entirely — the hire is done. Caller can retry the close manually.
  }

  // 4. Fetch all OTHER applicants for the same role (excluding rejected ones — they've been told already)
  const { data: others, error: othersErr } = await supabase
    .from("applications")
    .select("id, name, email, status, submitted_at")
    .eq("opportunity_slug", app.opportunity_slug)
    .neq("id", application_id)
    .neq("status", "rejected")
    .order("submitted_at", { ascending: false });

  if (othersErr) {
    console.error("hire-applicant fetch others error:", othersErr);
  }

  res.status(200).json({
    ok: true,
    hired_application_id: application_id,
    opportunity_slug:     app.opportunity_slug,
    role_label:           opp?.title || app.opportunity_slug,
    other_applicants:     others || [],
  });
}

function safeJson(text: string): any {
  try { return JSON.parse(text); }
  catch { return null; }
}
