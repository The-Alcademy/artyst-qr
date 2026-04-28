// ─────────────────────────────────────────────────────────────────
// api/get-opportunity-admin.ts
//
// GET /api/get-opportunity-admin?slug={slug}
// Returns the full opportunity row (including description) for editing
// in the CA-025 Job Engine.
//
// Differs from the public /api/opportunities/[slug] endpoint:
//  - Does not enforce active / share_disabled visibility floor
//  - Returns ALL columns including ones the public API hides
//
// Auth: x-ca022-secret header must equal process.env.CA022_SECRET
//
// Part of CA-022 "Hire someone" workspace — Step 2 (Edit flow).
// ─────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const ADMIN_SECRET      = process.env.CA022_SECRET || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-ca022-secret");
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
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

  const slug = String(req.query.slug || "").trim();
  if (!slug) {
    res.status(400).json({ error: "Missing slug" });
    return;
  }

  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("get-opportunity-admin error:", error);
    res.status(500).json({ error: "Database error" });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.status(200).json(data);
}
