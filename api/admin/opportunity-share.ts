// ─────────────────────────────────────────────────────────────────
// api/admin/opportunity-share.ts
//
// POST /api/admin/opportunity-share
// Toggles the share_disabled flag on an opportunity row.
//
// Auth: x-admin-secret header must equal process.env.CA022_SECRET
// Body: { slug: string, share_disabled: boolean }
// Returns: { ok: true, slug, share_disabled, updated_at } or 4xx with { error }
//
// Part of CA-022 Sharing & Embedding extension (Phase 1).
// ─────────────────────────────────────────────────────────────────

// (Vercel Node runtime: req and res have the same shape as @vercel/node
// types but we skip the import so the build does not require the package.)
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const ADMIN_SECRET      = process.env.CA022_SECRET || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
  // CORS — admin endpoint, but the admin panel is on the same origin
  // so we keep it conservative. Allow same-origin only via no Allow-Origin
  // header on non-OPTIONS responses.
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-secret");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // ─── Auth ──────────────────────────────────────────────────────
  // Require either CA022_SECRET to be configured or fail closed.
  if (!ADMIN_SECRET) {
    res.status(500).json({ error: "Server misconfigured: CA022_SECRET not set" });
    return;
  }
  const provided = req.headers["x-admin-secret"];
  if (provided !== ADMIN_SECRET) {
    res.status(401).json({ error: "Unauthorised" });
    return;
  }

  // ─── Validate body ─────────────────────────────────────────────
  const body = (typeof req.body === "string" ? safeJson(req.body) : req.body) || {};
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const shareDisabled = body.share_disabled;

  if (!slug) {
    res.status(400).json({ error: "Missing slug" });
    return;
  }
  if (typeof shareDisabled !== "boolean") {
    res.status(400).json({ error: "share_disabled must be a boolean" });
    return;
  }

  // ─── Update ────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from("opportunities")
    .update({ share_disabled: shareDisabled, updated_at: new Date().toISOString() })
    .eq("slug", slug)
    .select("slug, share_disabled, updated_at")
    .maybeSingle();

  if (error) {
    console.error("opportunity-share update error:", error);
    res.status(500).json({ error: "Database error" });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Opportunity not found" });
    return;
  }

  res.status(200).json({ ok: true, ...data });
}

function safeJson(text: string): any {
  try { return JSON.parse(text); }
  catch { return null; }
}
