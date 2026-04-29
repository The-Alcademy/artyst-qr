// ─────────────────────────────────────────────────────────────────
// api/set-application-fields.ts
//
// POST /api/set-application-fields
// Update profile fields on an application: pipeline_stage,
// engagement_type, other_role_suitability, internal_notes.
//
// Body: {
//   application_id: string,           // required
//   pipeline_stage?: string|null,     // 'invited'|'interviewed'|'offer_made'|'offer_accepted'|'offer_declined'|null
//   engagement_type?: string|null,    // 'full_time'|'part_time'|'volunteer'|'short_term'|'contractor'|'partner'|'investor'|'other'|null
//   other_role_suitability?: string,  // free text or empty string
//   internal_notes?: string,          // free text or empty string
// }
//
// Only the fields actually present in the body are PATCHed.
// Empty strings clear text fields. null clears enum-like fields.
//
// Part of CA-022 "Hire someone" workspace — Phase 2 (pipeline + person profile).
// ─────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PIPELINE_STAGES = new Set([
  "invited", "interviewed", "offer_made", "offer_accepted", "offer_declined",
]);
const ENGAGEMENT_TYPES = new Set([
  "full_time", "part_time", "volunteer", "short_term", "contractor",
  "partner", "investor", "other",
]);

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

  const updates: Record<string, any> = {};

  if ("pipeline_stage" in body) {
    const v = body.pipeline_stage;
    if (v === null || v === "") {
      updates.pipeline_stage = null;
    } else if (typeof v === "string" && PIPELINE_STAGES.has(v)) {
      updates.pipeline_stage = v;
    } else {
      res.status(400).json({ error: "Invalid pipeline_stage" });
      return;
    }
  }

  if ("engagement_type" in body) {
    const v = body.engagement_type;
    if (v === null || v === "") {
      updates.engagement_type = null;
    } else if (typeof v === "string" && ENGAGEMENT_TYPES.has(v)) {
      updates.engagement_type = v;
    } else {
      res.status(400).json({ error: "Invalid engagement_type" });
      return;
    }
  }

  if ("other_role_suitability" in body) {
    const v = body.other_role_suitability;
    updates.other_role_suitability = (typeof v === "string" && v.trim()) ? v.trim() : null;
  }

  if ("internal_notes" in body) {
    const v = body.internal_notes;
    updates.internal_notes = (typeof v === "string" && v.trim()) ? v.trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const { error } = await supabase
    .from("applications")
    .update(updates)
    .eq("id", application_id);

  if (error) {
    console.error("set-application-fields error:", error);
    res.status(500).json({ error: "Database error" });
    return;
  }

  res.status(200).json({ ok: true, updated: updates });
}

function safeJson(text: string): any {
  try { return JSON.parse(text); }
  catch { return null; }
}
