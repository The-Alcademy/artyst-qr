// ─────────────────────────────────────────────────────────────────
// api/bulk-reject-applicants.ts
//
// POST /api/bulk-reject-applicants
// Sends individualised rejection emails to a list of applicants,
// updates each application's status to 'rejected', and logs each
// send to application_replies.
//
// Body: {
//   application_ids: string[],     // who to reject
//   from_email:      string,       // jobs@theartyst.co.uk by default
//   subject:         string,       // shared subject
//   body_template:   string,       // body with {name} and {role} placeholders
//   role_label:      string,       // for {role} substitution
//   sent_by?:        string,       // optional staff name
//   silent?:         boolean,      // if true, just mark rejected, no email
// }
//
// Response: {
//   ok: true,
//   total: number,
//   sent:   number,
//   failed: number,
//   skipped: number,
//   errors: [{id, error}]
// }
//
// Part of CA-022 "Hire someone" workspace — Step 7.
// ─────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const RESEND_API_KEY    = process.env.RESEND_API_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ALLOWED_FROM = new Set([
  "jobs@theartyst.co.uk",
  "hello@theartyst.co.uk",
  "events@theartyst.co.uk",
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
  const application_ids = Array.isArray(body.application_ids) ? body.application_ids.filter((x: any)=>typeof x === "string") : [];
  const from_email      = typeof body.from_email    === "string" ? body.from_email.trim()    : "";
  const subject         = typeof body.subject       === "string" ? body.subject.trim()       : "";
  const body_template   = typeof body.body_template === "string" ? body.body_template        : "";
  const role_label      = typeof body.role_label    === "string" ? body.role_label.trim()    : "the role";
  const sent_by         = typeof body.sent_by       === "string" ? body.sent_by.trim()       : null;
  const silent          = body.silent === true;

  if (!application_ids.length) {
    res.status(400).json({ error: "Missing application_ids" });
    return;
  }

  if (!silent) {
    if (!RESEND_API_KEY)            { res.status(500).json({ error: "Server misconfigured: RESEND_API_KEY not set" }); return; }
    if (!ALLOWED_FROM.has(from_email)) { res.status(400).json({ error: "from_email must be one of: " + [...ALLOWED_FROM].join(", ") }); return; }
    if (!subject)                   { res.status(400).json({ error: "Missing subject" });       return; }
    if (!body_template)             { res.status(400).json({ error: "Missing body_template" }); return; }
  }

  // Fetch all applications in one go
  const { data: apps, error: appsErr } = await supabase
    .from("applications")
    .select("id, name, email, status")
    .in("id", application_ids);

  if (appsErr) {
    console.error("bulk-reject fetch error:", appsErr);
    res.status(500).json({ error: "Database error" });
    return;
  }
  if (!apps || !apps.length) {
    res.status(404).json({ error: "No matching applications found" });
    return;
  }

  let sent = 0, failed = 0, skipped = 0;
  const errors: Array<{id: string; error: string}> = [];

  for (const app of apps) {
    if (!app.email) {
      skipped++;
      // Still mark rejected even if no email
      await supabase.from("applications").update({ status: "rejected" }).eq("id", app.id);
      continue;
    }

    if (silent) {
      await supabase.from("applications").update({ status: "rejected" }).eq("id", app.id);
      skipped++;
      continue;
    }

    // Substitute placeholders
    const firstName = (app.name || "").split(/\s+/)[0] || "there";
    const personalBody = body_template
      .replace(/\{name\}/g,      firstName)
      .replace(/\{full_name\}/g, app.name || "there")
      .replace(/\{role\}/g,      role_label);

    let resend_id: string | null = null;
    let logStatus  = "sent";

    try {
      const r = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          from:     `The Artyst <${from_email}>`,
          to:       [app.email],
          reply_to: from_email,
          subject:  subject,
          text:     personalBody,
        }),
      });

      if (!r.ok) {
        const errPayload = await r.text();
        console.error("bulk-reject Resend send failed for", app.id, ":", r.status, errPayload);
        failed++;
        logStatus = "failed";
        errors.push({ id: app.id, error: `Resend ${r.status}` });
      } else {
        const sendResult = await r.json().catch(() => ({}));
        resend_id = sendResult?.id || null;
        sent++;
      }
    } catch (e: any) {
      console.error("bulk-reject Resend error for", app.id, ":", e);
      failed++;
      logStatus = "failed";
      errors.push({ id: app.id, error: e?.message || "Network error" });
    }

    // Log the reply (always — sent or failed)
    await supabase.from("application_replies").insert({
      application_id: app.id,
      sent_by,
      from_email,
      to_email: app.email,
      subject,
      body:     personalBody,
      template: "decline",
      status:   logStatus,
      resend_id,
    });

    // Mark rejected only if the email send succeeded (or silent mode handled above)
    if (logStatus === "sent") {
      await supabase.from("applications").update({ status: "rejected" }).eq("id", app.id);
    }
  }

  res.status(200).json({
    ok: true,
    total:   apps.length,
    sent,
    failed,
    skipped,
    errors,
  });
}

function safeJson(text: string): any {
  try { return JSON.parse(text); }
  catch { return null; }
}
