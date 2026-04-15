import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM_NAME    = 'The Artyst';
const FROM_EMAIL   = 'hello@theartyst.co.uk';
const NOTIFY_EMAIL = 'jobs@theartyst.co.uk';

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildHtml(opts: {
  title: string;
  label: string;
  type: string;
  pageUrl: string;
  redirectUrl: string;
  note?: string;
  isInternal: boolean;
}): string {
  const { title, label, type, pageUrl, redirectUrl, note, isInternal } = opts;
  const typeLabel = type === 'opportunity' ? 'Job opportunity'
    : type === 'event' ? 'Event'
    : label;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;padding:40px 20px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#1a1614;padding:24px 32px;">
        <p style="margin:0;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#c8a96e;font-family:sans-serif;">The Artyst · Cambridge</p>
        <p style="margin:6px 0 0;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#555;font-family:sans-serif;">${esc(typeLabel)}</p>
      </td></tr>

      <!-- Title -->
      <tr><td style="background:#fff;padding:32px 32px 24px;border-left:1px solid #e8e4de;border-right:1px solid #e8e4de;">
        <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1a1614;line-height:1.2;">${esc(label)}</h1>
        ${note ? `<p style="margin:0 0 0;font-size:16px;color:#8a7e72;font-style:italic;line-height:1.6;">${esc(note)}</p>` : ''}
      </td></tr>

      <!-- CTA -->
      <tr><td style="background:#fff;padding:0 32px 32px;border-left:1px solid #e8e4de;border-right:1px solid #e8e4de;">
        <table cellpadding="0" cellspacing="0">
          <tr><td style="background:#1a1614;border-radius:3px;">
            <a href="${esc(pageUrl)}" style="display:inline-block;padding:14px 28px;color:#ede8df;font-family:Georgia,serif;font-size:15px;font-weight:700;text-decoration:none;">
              ${type === 'opportunity' ? 'View job &amp; apply →' : 'Find out more →'}
            </a>
          </td></tr>
        </table>
        <p style="margin:12px 0 0;font-size:12px;color:#aaa;font-family:sans-serif;">
          Or copy this link: <a href="${esc(redirectUrl)}" style="color:#8a7e72;">${esc(redirectUrl)}</a>
        </p>
      </td></tr>

      ${isInternal ? `
      <!-- Internal note -->
      <tr><td style="background:#f4f4f4;padding:16px 32px;border:1px solid #e8e4de;border-top:none;">
        <p style="margin:0;font-size:12px;color:#888;font-family:sans-serif;font-style:italic;">
          This is an internal notification from CA-022 QR Engine. The listing is live at <a href="${esc(pageUrl)}" style="color:#555;">${esc(pageUrl)}</a>
        </p>
      </td></tr>` : ''}

      <!-- Footer -->
      <tr><td style="padding:24px 32px 0;">
        <p style="margin:0;font-size:12px;color:#bbb;font-family:sans-serif;text-align:center;">
          The Artyst &nbsp;·&nbsp; 54–56 Chesterton Road &nbsp;·&nbsp; Cambridge CB4 1EN
        </p>
        ${!isInternal ? `<p style="margin:8px 0 0;font-size:11px;color:#ccc;font-family:sans-serif;text-align:center;">
          You're receiving this because you subscribed to updates from The Artyst.
        </p>` : ''}
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    qr_code_id,
    slug,
    label,
    type,
    redirect_url,
    destination_url,
    group_ids = [],
    staff_name,
    note,
    reply_to = NOTIFY_EMAIL,
  } = req.body ?? {};

  if (!slug || !label) {
    return res.status(400).json({ error: 'slug and label are required' });
  }

  const pageUrl     = destination_url || `https://go.theartyst.co.uk/opportunity/${slug}`;
  const redirectUrl = redirect_url    || `https://go.theartyst.co.uk/e/${slug}`;
  const subject     = type === 'opportunity'
    ? `Now hiring: ${label} — The Artyst, Cambridge`
    : `${label} — The Artyst, Cambridge`;

  const results = { internal: false, broadcast: 0, errors: [] as string[] };

  // ── 1. Internal notification ─────────────────────────────────────────────
  try {
    await resend.emails.send({
      from:    `${FROM_NAME} <${FROM_EMAIL}>`,
      to:      NOTIFY_EMAIL,
      replyTo: reply_to,
      subject: `[CA-022] ${subject}`,
      html:    buildHtml({ title: subject, label, type: type||'generic', pageUrl, redirectUrl, note, isInternal: true }),
    });
    results.internal = true;
  } catch (e: any) {
    console.error('Internal notify failed:', e.message);
    results.errors.push(`Internal notify: ${e.message}`);
  }

  // ── 2. Subscriber broadcast ──────────────────────────────────────────────
  // Fetch members from selected groups
  let members: { email: string; name: string }[] = [];

  if (group_ids.length > 0) {
    try {
      const { data } = await supabase
        .from('group_members')
        .select('name, email')
        .in('group_id', group_ids)
        .not('email', 'is', null);

      members = (data || []).filter(m => m.email?.includes('@'));
    } catch (e: any) {
      console.error('Group member fetch failed:', e.message);
      results.errors.push(`Member fetch: ${e.message}`);
    }
  }

  // Send to each subscriber individually (Resend free tier: no bulk send)
  const broadcastHtml = buildHtml({ title: subject, label, type: type||'generic', pageUrl, redirectUrl, note, isInternal: false });

  for (const member of members) {
    try {
      await resend.emails.send({
        from:    `${FROM_NAME} <${FROM_EMAIL}>`,
        to:      member.email,
        replyTo: reply_to,
        subject,
        html:    broadcastHtml,
      });
      results.broadcast++;
    } catch (e: any) {
      console.error(`Failed to send to ${member.email}:`, e.message);
      results.errors.push(`${member.email}: ${e.message}`);
    }
  }

  // ── 3. Log distribution ──────────────────────────────────────────────────
  if (qr_code_id && (results.internal || results.broadcast > 0)) {
    try {
      let staffId: string | null = null;
      if (staff_name) {
        const { data: existing } = await supabase
          .from('staff')
          .select('id')
          .eq('name', staff_name)
          .maybeSingle();

        if (existing) {
          staffId = existing.id;
        } else {
          const { data: created } = await supabase
            .from('staff')
            .insert({ name: staff_name })
            .select('id')
            .single();
          staffId = created?.id ?? null;
        }
      }

      await supabase.from('distributions').insert({
        qr_code_id,
        staff_id:   staffId,
        note:       note || null,
        channels:   ['email'],
        groups:     group_ids,
        status:     'sent',
      });

      await supabase
        .from('qr_codes')
        .update({ last_distributed_at: new Date().toISOString() })
        .eq('id', qr_code_id);
    } catch (e: any) {
      console.error('Distribution log failed:', e.message);
    }
  }

  const success = results.internal || results.broadcast > 0;

  return res.status(success ? 200 : 500).json({
    success,
    internal:  results.internal,
    broadcast: results.broadcast,
    errors:    results.errors,
  });
}
