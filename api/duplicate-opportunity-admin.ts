// ─────────────────────────────────────────────────────────────────
// api/duplicate-opportunity-admin.ts
//
// POST /api/duplicate-opportunity-admin
// Creates a copy of an existing opportunity with a fresh slug,
// status='draft', and active=false. The new row is independent —
// editing it doesn't affect the original.
//
// Slug strategy: append "-2", "-3", etc. until a free slug is found.
//
// Auth: x-ca022-secret header must equal process.env.CA022_SECRET
// Body: { source_slug: string, new_title?: string }
//
// Returns the new opportunity record so the UI can route the user
// straight into edit mode for it.
//
// Part of CA-022 "Hire someone" workspace — Step 4.
// ─────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const ADMIN_SECRET      = process.env.CA022_SECRET || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function findFreeSlug(base: string): Promise<string> {
  // Try the bare base first, then base-2, base-3...
  // Cap at 50 attempts as a safety rail.
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? `${base}-copy` : `${base}-copy-${i}`;
    const { data } = await supabase
      .from("opportunities")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  // Fall back to a timestamp suffix if 50 attempts somehow collided
  return `${base}-copy-${Date.now().toString(36)}`;
}

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
  const sourceSlug = typeof body.source_slug === "string" ? body.source_slug.trim() : "";
  const newTitle   = typeof body.new_title   === "string" ? body.new_title.trim()   : "";

  if (!sourceSlug) {
    res.status(400).json({ error: "Missing source_slug" });
    return;
  }

  // Fetch the source row
  const { data: source, error: sourceErr } = await supabase
    .from("opportunities")
    .select("*")
    .eq("slug", sourceSlug)
    .maybeSingle();

  if (sourceErr) {
    console.error("duplicate-opportunity source fetch error:", sourceErr);
    res.status(500).json({ error: "Database error" });
    return;
  }
  if (!source) {
    res.status(404).json({ error: "Source opportunity not found" });
    return;
  }

  // Build the new row — strip identifiers and links, mark as draft+inactive
  const newSlug  = await findFreeSlug(sourceSlug);
  const titleOut = newTitle || `${source.title} (copy)`;

  const insertPayload: Record<string, any> = {
    slug:            newSlug,
    title:           titleOut,
    property:        source.property,
    employment_type: source.employment_type,
    hours:           source.hours,
    pay:             source.pay,
    description:     source.description,
    apply_email:     source.apply_email,
    embed_excerpt:   source.embed_excerpt,
    og_image_url:    source.og_image_url,
    status:          "draft",   // Important — never goes live until manually opened
    active:          false,     // Hidden from circulation
    share_disabled:  true,      // Hidden from JSON feed too
    linked_ca025_id: null,
    qr_code_id:      null,      // QR code created later when "published"
  };

  const { data: created, error: insertErr } = await supabase
    .from("opportunities")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertErr || !created) {
    console.error("duplicate-opportunity insert error:", insertErr);
    res.status(500).json({ error: "Failed to duplicate opportunity" });
    return;
  }

  res.status(200).json({ ok: true, opportunity: created });
}

function safeJson(text: string): any {
  try { return JSON.parse(text); }
  catch { return null; }
}
