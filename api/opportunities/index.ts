// ─────────────────────────────────────────────────────────────────
// api/opportunities/index.ts
//
// GET /api/opportunities — public list endpoint for the JSON API.
// Part of CA-022 Sharing & Embedding extension (Phase 1).
//
// Query parameters (all optional):
//   type      — only "job" returns rows for now (table is jobs-shaped).
//               Any other value returns an empty list.
//   status    — "open" (default) or "closed".
//   property  — slug or full text. e.g. "artyst", "the-artyst", "The Artyst".
//   sort      — "newest" (default) or "oldest".
//   limit     — default 20, max 100.
//   offset    — default 0.
//
// Public visibility floor (always enforced):
//   active = true AND share_disabled = false
// ─────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const CANONICAL_HOST    = "https://go.theartyst.co.uk";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Property slug → canonical text mapping ──────────────────────
// Accept either the slug ("artyst") or the canonical text ("The Artyst").
// The DB stores the canonical text, so we map slugs → text on the way in.
const PROPERTY_MAP: Record<string, string> = {
  artyst:               "The Artyst",
  "the-artyst":         "The Artyst",
  theartyst:            "The Artyst",
  alcademy:             "The Alcademy",
  "the-alcademy":       "The Alcademy",
  ic:                   "Invysible College",
  invysible:            "Invysible College",
  "invysible-college":  "Invysible College",
  othersyde:            "OtherSyde",
  "other-syde":         "OtherSyde",
};

function normaliseProperty(input: string): string {
  return PROPERTY_MAP[input.toLowerCase().trim()] || input;
}

// ─── Property text → slug for output ──────────────────────────────
// Inverse of the above, used when shaping the JSON response so the
// consumer doesn't have to do this mapping themselves.
function propertyToSlug(p: string): string {
  const key = (p || "").toLowerCase().trim();
  if (key.includes("artyst"))    return "artyst";
  if (key.includes("alcademy"))  return "alcademy";
  if (key.includes("invysible")) return "ic";
  if (key.includes("othersyde")) return "othersyde";
  return key.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ─── Excerpt derivation ──────────────────────────────────────────
// Use embed_excerpt if set; otherwise strip basic markdown from
// description and take the first 240 chars.
function deriveExcerpt(row: any): string {
  const e = (row.embed_excerpt || "").trim();
  if (e) return e;
  const desc = (row.description || "").trim();
  if (!desc) return "";
  const plain = desc
    .replace(/^#+\s+/gm,            "")     // markdown headings
    .replace(/\*\*(.+?)\*\*/g,      "$1")   // bold
    .replace(/\*(.+?)\*/g,          "$1")   // italic
    .replace(/`([^`]+)`/g,          "$1")   // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → label only
    .replace(/\n+/g, " ")
    .trim();
  return plain.length > 240 ? plain.slice(0, 237) + "…" : plain;
}

// ─── Format a single DB row to the public response shape ─────────
function formatOpportunity(row: any) {
  return {
    slug:            row.slug,
    type:            "job",                     // Phase 1.5: introduce real type col
    status:          row.status,
    property:        row.property,
    property_slug:   propertyToSlug(row.property || ""),
    title:           row.title,
    employment_type: row.employment_type,
    hours:           row.hours,
    pay:             row.pay,
    excerpt:         deriveExcerpt(row),
    description:     row.description,           // raw text/markdown; consumers render
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
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — read endpoints are public-by-design.
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

  // ─── Parse query params ─────────────────────────────────────────
  const q        = req.query;
  const type     = typeof q.type     === "string" ? q.type     : null;
  const status   = typeof q.status   === "string" ? q.status   : "open";
  const property = typeof q.property === "string" ? q.property : null;
  const sort     = typeof q.sort     === "string" ? q.sort     : "newest";

  const limit  = Math.max(1, Math.min(100, parseInt(String(q.limit  ?? "20"), 10) || 20));
  const offset = Math.max(0,               parseInt(String(q.offset ?? "0"),  10) || 0);

  // Draft is admin-only; never serve it from the public endpoint.
  if (status === "draft") {
    res.status(400).json({ error: "Cannot request draft opportunities via the public endpoint" });
    return;
  }

  // The opportunities table is currently jobs-shaped only.
  // If a non-job type is requested, return an empty list rather than
  // pretending it's a server error.
  if (type && type !== "job") {
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.json({ opportunities: [], total: 0, limit, offset });
    return;
  }

  // ─── Build the query ────────────────────────────────────────────
  let query = supabase
    .from("opportunities")
    .select("*", { count: "exact" })
    .eq("active", true)
    .eq("share_disabled", false);

  if (status === "open" || status === "closed") {
    query = query.eq("status", status);
  }

  if (property) {
    query = query.eq("property", normaliseProperty(property));
  }

  if (sort === "newest") {
    query = query.order("created_at", { ascending: false });
  } else if (sort === "oldest") {
    query = query.order("created_at", { ascending: true });
  }
  // "closing-soon" is a no-op until ends_at is added.

  query = query.range(offset, offset + limit - 1);

  // ─── Execute ────────────────────────────────────────────────────
  const { data, error, count } = await query;

  if (error) {
    console.error("Opportunities list error:", error);
    res.status(500).json({ error: "Database error" });
    return;
  }

  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.json({
    opportunities: (data || []).map(formatOpportunity),
    total:  count ?? (data?.length ?? 0),
    limit,
    offset,
  });
}
