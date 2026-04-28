// ─────────────────────────────────────────────────────────────────
// api/list-opportunities-admin.ts
//
// GET /api/list-opportunities-admin
// Returns all opportunities (including hidden / inactive / closed) for
// the CA-025 Job Engine's edit picker.
//
// Auth: x-ca022-secret header must equal process.env.CA022_SECRET
//
// Response: { opportunities: [{ id, slug, title, property, status,
//                               active, share_disabled, updated_at }, ...] }
//
// Part of CA-022 "Hire someone" workspace — Step 2 (Edit flow).
// ─────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const ADMIN_SECRET      = process.env.CA022_SECRET || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async function handler(req: any, res: any) {
  // Same-origin only — admin tool, called from the browser job-engine page
  // with the secret attached server-side via the page's auth proxy
  // (or directly when the page passes the secret via the admin session).
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

  // Returns ALL opportunities — admin needs visibility regardless of public state
  const { data, error } = await supabase
    .from("opportunities")
    .select("id, slug, title, property, employment_type, status, active, share_disabled, updated_at, created_at")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("list-opportunities-admin error:", error);
    res.status(500).json({ error: "Database error" });
    return;
  }

  res.status(200).json({ opportunities: data || [] });
}
