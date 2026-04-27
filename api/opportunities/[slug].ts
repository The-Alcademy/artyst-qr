// ─────────────────────────────────────────────────────────────────
// api/opportunities/[slug].ts
//
// GET /api/opportunities/{slug} — public single-record endpoint.
// Part of CA-022 Sharing & Embedding extension (Phase 1).
//
// Response: 200 with the opportunity record (same shape as list items),
//           or 404 if the slug is not found, share_disabled is true,
//           or active is false.
//
// Note: closed opportunities ARE returned (so direct links keep working
// after a role closes — the consumer can render a "now closed" badge
// based on the status field).
// ─────────────────────────────────────────────────────────────────

// (Vercel Node runtime: req and res have the same shape as @vercel/node
// types but we skip the import so the build does not require the package.)
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const CANONICAL_HOST    = "https://go.theartyst.co.uk";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helpers duplicated from the list endpoint so each function is
// self-contained. Vercel cold starts are quicker without shared imports.

function propertyToSlug(p: string): string {
  const key = (p || "").toLowerCase().trim();
  if (key.includes("artyst"))    return "artyst";
  if (key.includes("alcademy"))  return "alcademy";
  if (key.includes("invysible")) return "ic";
  if (key.includes("othersyde")) return "othersyde";
  return key.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function deriveExcerpt(row: any): string {
  const e = (row.embed_excerpt || "").trim();
  if (e) return e;
  const desc = (row.description || "").trim();
  if (!desc) return "";
  const plain = desc
    .replace(/^#+\s+/gm,            "")
    .replace(/\*\*(.+?)\*\*/g,      "$1")
    .replace(/\*(.+?)\*/g,          "$1")
    .replace(/`([^`]+)`/g,          "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
  return plain.length > 240 ? plain.slice(0, 237) + "…" : plain;
}

function formatOpportunity(row: any) {
  return {
    slug:            row.slug,
    type:            "job",
    status:          row.status,
    property:        row.property,
    property_slug:   propertyToSlug(row.property || ""),
    title:           row.title,
    employment_type: row.employment_type,
    hours:           row.hours,
    pay:             row.pay,
    excerpt:         deriveExcerpt(row),
    description:     row.description,
    apply_email:     row.apply_email,
    apply_url:       `${CANONICAL_HOST}/opportunity/${row.slug}#apply`,
    urls: {
      public: `${CANONICAL_HOST}/opportunity/${row.slug}`,
      short:  `${CANONICAL_HOST}/e/${row.slug}`,
      json:   `${CANONICAL_HOST}/api/opportunities/${row.slug}`,
    },
    og_image_url:    row.og_image_url,
    created_at:      row.created_at,
    updated_at:      row.updated_at,
  };
}

// ─────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const slug = String(req.query.slug || "").trim();
  if (!slug) {
    res.status(400).json({ error: "Missing slug" });
    return;
  }

  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .eq("share_disabled", false)
    .maybeSingle();

  if (error) {
    console.error("Opportunity single-fetch error:", error);
    res.status(500).json({ error: "Database error" });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.json(formatOpportunity(data));
}
