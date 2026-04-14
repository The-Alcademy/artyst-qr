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

  const { opportunitySlug, opportunityId, name, email, phone, message, cv } = req.body ?? {};

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Missing required fields: name, email, message' });
  }

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
      opportunity_id:   opportunityId ?? null,
      opportunity_slug: opportunitySlug,
      name:             name.trim(),
      email:            email.trim().toLowerCase(),
      phone:            phone?.trim() || null,
      message:          message.trim(),
      cv_url:           cvUrl,
      status:           'new'
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Insert error:', insertError.message);
    return res.status(500).json({ error: 'Failed to save application' });
  }

  // ── 3. Send email notification via Resend ────────────────────────────
  try {
    const { data: opp } = await supabase
      .from('opportunities')
      .select('title, property, apply_email')
      .eq('slug', opportunitySlug)
      .maybeSingle();

    const applyEmail = opp?.apply_email ?? 'jobs@theartyst.co.uk';
    const jobTitle   = opp?.title      ?? opportunitySlug;
    const property   = opp?.property   ?? 'The Artyst';

    await resend.emails.send({
      from:    'The Artyst Jobs <jobs@theartyst.co.uk>',
      to:      applyEmail,
      replyTo: email.trim(),
      subject: `New application: ${jobTitle} — ${name.trim()}`,
      html: `
<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1614;line-height:1.6;">

  <div style="border-bottom:1px solid #e8e4de;padding-bottom:20px;margin-bottom:24px;">
    <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a7e72;margin-bottom:6px;">${esc(property)}</p>
    <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;margin:0;">New application: ${esc(jobTitle)}</h2>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;color:#8a7e72;font-size:13px;width:100px;vertical-align:top;">Name</td>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;"><strong>${esc(name.trim())}</strong></td>
    </tr>
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;color:#8a7e72;font-size:13px;vertical-align:top;">Email</td>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;"><a href="mailto:${esc(email.trim())}" style="color:#1a1614;">${esc(email.trim())}</a></td>
    </tr>
    ${phone?.trim() ? `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;color:#8a7e72;font-size:13px;vertical-align:top;">Phone</td>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;">${esc(phone.trim())}</td>
    </tr>` : ''}
    ${cvUrl ? `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;color:#8a7e72;font-size:13px;vertical-align:top;">CV</td>
      <td style="padding:9px 0;border-bottom:1px solid #e8e4de;"><a href="${esc(cvUrl)}" style="color:#1a1614;">Download CV →</a></td>
    </tr>` : ''}
  </table>

  <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a7e72;margin-bottom:10px;">Message</p>
  <div style="background:#faf9f7;border-left:3px solid #e8e4de;padding:16px 20px;font-style:italic;color:#3a3028;line-height:1.75;margin-bottom:32px;">
    ${esc(message.trim()).replace(/\n/g, '<br>')}
  </div>

  <p style="font-size:12px;color:#aaa;border-top:1px solid #e8e4de;padding-top:16px;">
    Application ID: ${application.id}<br>
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
