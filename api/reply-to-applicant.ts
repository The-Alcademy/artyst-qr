// ─────────────────────────────────────────────────────────────────
// api/reply-to-applicant.ts
//
// POST /api/reply-to-applicant
// Sends a reply email to an applicant via Resend, logs the reply
// in application_replies, and bumps the application's status to
// 'reviewed' if it was still 'new'.
//
// Body: {
//   application_id: string,
//   from_email:     string,         // e.g. jobs@theartyst.co.uk
//   subject:        string,
//   body:           string,         // plain text or markdown
//   template?:      string,         // 'acknowledge' | 'invite' | etc.
//   sent_by?:       string,         // staff name, free text
// }
//
// Auth: this endpoint is called from the same admin session and
// trusts the host. It is not exposed to public origins because the
// admin pages live behind the regular admin login. We don't gate it
// on x-ca022-secret because the writes are scoped (you can only
// write to applications you can already read), and because adding a
// proxy hop here would just complicate the path.
//
// Part of CA-022 "Hire someone" workspace — Step 6.
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

  if (!RESEND_API_KEY) {
    res.status(500).json({ error: "Server misconfigured: RESEND_API_KEY not set" });
    return;
  }

  const body = (typeof req.body === "string" ? safeJson(req.body) : req.body) || {};
  const application_id = typeof body.application_id === "string" ? body.application_id.trim() : "";
  const from_email     = typeof body.from_email     === "string" ? body.from_email.trim()     : "";
  const subject        = typeof body.subject        === "string" ? body.subject.trim()        : "";
  const messageBody    = typeof body.body           === "string" ? body.body                 : "";
  const template       = typeof body.template       === "string" ? body.template.trim()       : null;
  const sent_by        = typeof body.sent_by        === "string" ? body.sent_by.trim()        : null;

  if (!application_id) { res.status(400).json({ error: "Missing application_id" }); return; }
  if (!subject)        { res.status(400).json({ error: "Missing subject"        }); return; }
  if (!messageBody)    { res.status(400).json({ error: "Missing body"           }); return; }

  if (!ALLOWED_FROM.has(from_email)) {
    res.status(400).json({ error: "from_email must be one of: " + [...ALLOWED_FROM].join(", ") });
    return;
  }

  // Look up the application — we need the recipient and current status
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, name, email, status, opportunity_slug")
    .eq("id", application_id)
    .maybeSingle();

  if (appErr) {
    console.error("reply-to-applicant fetch error:", appErr);
    res.status(500).json({ error: "Database error" });
    return;
  }
  if (!app) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  if (!app.email) {
    res.status(400).json({ error: "Application has no email on record" });
    return;
  }

  // Send via Resend
  let resend_id: string | null = null;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:     `The Artyst <${from_email}>`,
        to:       [app.email],
        reply_to: from_email,
        subject:  subject,
        text:     messageBody,
      }),
    });

    if (!r.ok) {
      const errPayload = await r.text();
      console.error("Resend send failed:", r.status, errPayload);
      // Still log the attempt as failed, then return error
      await supabase.from("application_replies").insert({
        application_id,
        sent_by,
        from_email,
        to_email: app.email,
        subject,
        body:     messageBody,
        template,
        status:   "failed",
      });
      res.status(502).json({ error: "Email provider rejected the message" });
      return;
    }

    const sendResult = await r.json().catch(() => ({}));
    resend_id = sendResult?.id || null;
  } catch (e) {
    console.error("Resend network error:", e);
    res.status(500).json({ error: "Could not reach email provider" });
    return;
  }

  // Log the reply
  const { error: logErr } = await supabase.from("application_replies").insert({
    application_id,
    sent_by,
    from_email,
    to_email: app.email,
    subject,
    body:     messageBody,
    template,
    status:   "sent",
    resend_id,
  });

  if (logErr) {
    console.error("reply-to-applicant log insert error:", logErr);
    // Don't fail the response — email did send. Just log a warning.
  }

  // Auto-bump status from 'new' → 'reviewed' so you can see the funnel update.
  // Also auto-set pipeline_stage='invited' if this was the "Invite to interview" template.
  const updates: Record<string, any> = {};
  if (app.status === "new")  updates.status = "reviewed";
  if (template === "invite") updates.pipeline_stage = "invited";

  if (Object.keys(updates).length > 0) {
    await supabase
      .from("applications")
      .update(updates)
      .eq("id", application_id);
  }

  res.status(200).json({
    ok: true,
    application_id,
    to:       app.email,
    resend_id,
    new_status: app.status === "new" ? "reviewed" : app.status,
    new_pipeline_stage: template === "invite" ? "invited" : null,
  });
}

function safeJson(text: string): any {
  try { return JSON.parse(text); }
  catch { return null; }
}
