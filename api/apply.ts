import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY!);

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    opportunitySlug,
    opportunityId,
    name,
    email,
    phone,
    message,
    cv,
    marketingConsentGeneral,
    marketingConsentJobs,
  } = req.body ?? {};

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Missing required fields: name, email, message' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName  = name.trim();
  const cleanPhone = phone?.trim() || null;
  const consentGeneral = !!marketingConsentGeneral;
  const consentJobs    = !!marketingConsentJobs;

  // ── 1. Upload CV to Supabase Storage ──────────────────────────────────
  let cvUrl: string | null = null;

  if (cv?.data && cv?.filename) {
    try {
      const buffer   = Buffer.from(cv.data, 'base64');
      const safeName = cv.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path     = `${opportunitySlug}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('applications')
        .upload(path, buffer, { contentType: cv.mimeType ?? 'application/octet-stream', upsert: false });

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('applications').getPublicUrl(path);
        cvUrl = publicUrl;
      } else {
        console.error('CV upload error:', uploadError.message);
      }
    } catch (e) {
      console.error('CV upload exception:', e);
      // Non-fatal — continue without CV
    }
  }

  // ── 2. Store application in Supabase ──────────────────────────────────
  const { data: application, error: insertError } = await supabase
    .from('applications')
    .insert({
      opportunity_id:           opportunityId ?? null,
      opportunity_slug:         opportunitySlug,
      name:                     cleanName,
      email:                    cleanEmail,
      phone:                    cleanPhone,
      message:                  message.trim(),
      cv_url:                   cvUrl,
      status:                   'new',
      marketing_consent_general: consentGeneral,
      marketing_consent_jobs:    consentJobs,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Insert error:', insertError.message);
    return res.status(500).json({ error: 'Failed to save application' });
  }

  // ── 3. Register applicant in CA-024 People Registry ────────────────────
  // Pattern matches CA-017 and CA-019: call upsert_person() then create
  // a relationship row. Non-fatal — application is already stored.
  let personId: string | null = null;
  try {
    const { data: pid, error: personErr } = await supabase.rpc('upsert_person', {
      p_email:     cleanEmail,
      p_name:      cleanName,
      p_phone:     cleanPhone,
      p_source:    'job_application',
      p_source_ca: 'CA-022',
    });
    if (personErr) {
      console.error('upsert_person error:', personErr.message);
    } else {
      personId = pid as string;

      // Create the job_applicant relationship row.
      // Schema for relationships table:
      //   person_id, relationship_type, property, status, domain_table,
      //   domain_id, started_at, ended_at, notes, created_by
      const noteParts: string[] = [];
      if (opportunitySlug) noteParts.push('Applied for: ' + opportunitySlug);
      noteParts.push('Application ID: ' + application.id);

      const { error: relErr } = await supabase.from('relationships').insert({
        person_id:         personId,
        relationship_type: 'job_applicant',
        domain_table:      'applications',
        domain_id:         application.id,
        notes:             noteParts.join(' · '),
        created_by:        'CA-022',
      });
      if (relErr) {
        console.error('Relationship insert error:', relErr.message);
      }
    }
  } catch (e) {
    console.error('CA-024 sync exception:', e);
    // Non-fatal — keep going
  }

  // ── 4. Optional mailing list subscription ─────────────────────────────
  // If applicant opted in to either general updates or future jobs,
  // upsert into the subscribers table with appropriate tags.
  if (consentGeneral || consentJobs) {
    try {
      const tags: string[] = [];
      if (consentGeneral) tags.push('general');
      if (consentJobs)    tags.push('jobs');

      // Check if a subscriber row already exists for this email
      const { data: existing } = await supabase
        .from('subscribers')
        .select('id, tags, active')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existing) {
        // Merge tags (don't lose any they already had) and reactivate if needed
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...tags]));
        await supabase
          .from('subscribers')
          .update({
            tags:         mergedTags,
            active:       true,
            name:         cleanName,
            notify_email: true,
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('subscribers').insert({
          email:        cleanEmail,
          name:         cleanName,
          source:       'job_application',
          tags,
          active:       true,
          notify_email: true,
        });
      }
    } catch (e) {
      console.error('Subscriber upsert exception:', e);
      // Non-fatal — application is in, person is registered, just no list subscription
    }
  }

  // ── 5. Send email notification via Resend ────────────────────────────
  try {
    const { data: opp } = await supabase
      .from('opportunities')
      .select('title, property, apply_email')
      .eq('slug', opportunitySlug)
      .maybeSingle();

    const applyEmail = opp?.apply_email ?? 'jobs@theartyst.co.uk';
    const jobTitle   = opp?.title      ?? opportunitySlug;
    const property   = opp?.property   ?? 'The Artyst';

    const consentLabels: string[] = [];
    if (consentGeneral) consentLabels.push('General updates');
    if (consentJobs)    consentLabels.push('Future jobs');
    const consentLine = consentLabels.length
      ? consentLabels.join(' + ')
      : 'No marketing opt-in';

    await resend.emails.send({
      from:    'The Artyst Jobs <jobs@theartyst.co.uk>',
      to:      applyEmail,
      replyTo: cleanEmail,
      subject: `New application: ${jobTitle} — ${cleanName}`,
      html: `
<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1614;line-height:1.6;">

  <div style="border-bottom:1px solid #e8e4de;padding-bottom:20px;margin-bottom:24px;">
    <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a7e72;margin-bottom:6px;">${esc(property)}</p>
    <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;margin:0;">New application: ${esc(jobTitle)}</h2>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;color:#8a7e72;font-size:13px;width:100px;vertical-align:top;">Name</td>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;"><strong>${esc(cleanName)}</strong></td>
    </tr>
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;color:#8a7e72;font-size:13px;vertical-align:top;">Email</td>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;"><a href="mailto:${esc(cleanEmail)}" style="color:#1a1614;">${esc(cleanEmail)}</a></td>
    </tr>
    ${cleanPhone ? `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;color:#8a7e72;font-size:13px;vertical-align:top;">Phone</td>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;">${esc(cleanPhone)}</td>
    </tr>` : ''}
    ${cvUrl ? `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;color:#8a7e72;font-size:13px;vertical-align:top;">CV</td>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;"><a href="${esc(cvUrl)}" style="color:#1a1614;">Download CV →</a></td>
    </tr>` : ''}
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;color:#8a7e72;font-size:13px;vertical-align:top;">Marketing</td>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;font-size:13px;">${esc(consentLine)}</td>
    </tr>
  </table>

  <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a7e72;margin-bottom:10px;">Message</p>
  <div style="background:#faf9f7;border-left:3px solid #e8e4de;padding:16px 20px;font-style:italic;color:#3a3028;line-height:1.75;margin-bottom:32px;">
    ${esc(message.trim()).replace(/\n/g, '<br>')}
  </div>

  <p style="font-size:12px;color:#aaa;border-top:1px solid #e8e4de;padding-top:16px;">
    Application ID: ${application.id}<br>
    ${personId ? `CA-024 Person ID: ${personId}<br>` : ''}
    Sent by CA-022 QR Engine &nbsp;·&nbsp; The Artyst, Cambridge
  </p>
</div>`
    });
  } catch (emailError) {
    // Email failure is non-fatal — application is already stored
    console.error('Resend error:', emailError);
  }

  return res.status(200).json({ success: true, applicationId: application.id });
}
