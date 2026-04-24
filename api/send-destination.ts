import type { VercelRequest, VercelResponse } from '@vercel/node';
import QRCode from 'qrcode';

// CA-022 — Send destination info + QR code by email via Resend
// Requires RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY in Vercel env vars

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const SUPABASE_URL   = process.env.SUPABASE_URL!;
const SUPABASE_KEY   = process.env.SUPABASE_ANON_KEY!;
const FROM = 'The Artyst <events@theartyst.co.uk>';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtPrice(pence: number | null): string {
  if (!pence) return 'Free';
  return `\u00a3${(pence / 100).toFixed(2)}`;
}

// Extract event UUID from destination URLs like:
//   https://invysible-college-events-engine.vercel.app/?event=UUID
function extractEventId(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get('event');
  } catch {
    return null;
  }
}

// Fetch event record directly from Supabase
async function fetchEvent(eventId: string): Promise<any | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/events?id=eq.${eventId}&select=*&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch {
    return null;
  }
}

const PURPOSE_LABELS: Record<string, string> = {
  dining: 'Dining', afternoon_tea: 'Afternoon Tea', game_playing: 'Game Playing',
  talk_lecture: 'Talk / Lecture', book_reading: 'Book Reading', tour: 'Tour',
  music_performance: 'Live Music', wine_tasting: 'Wine Tasting', quiz_night: 'Quiz Night',
  workshop: 'Workshop', exhibition: 'Exhibition', ceremony_celebration: 'Celebration / Ceremony',
  tarot_reading: 'Tarot Reading', film_screening: 'Film Screening',
  meeting_conference: 'Meeting / Conference', private_hire: 'Private Hire', other: 'Other',
};

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, label, url, scan_url, slug } = req.body || {};

  if (!to || !label || !url) {
    return res.status(400).json({ error: 'to, label and url are required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const qrTarget = scan_url || url;

  // Try to fetch full event data if this is an event destination
  const eventId = extractEventId(url);
  const event   = eventId ? await fetchEvent(eventId) : null;

  try {
    const qrDataUrl = await QRCode.toDataURL(qrTarget, {
      width: 300, margin: 2,
      color: { dark: '#111111', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });
    const qrBase64 = qrDataUrl.split(',')[1];

    // Build event details block
    let eventBlock = '';
    if (event) {
      const date    = event.starts_at ? fmtDate(event.starts_at) : '';
      const time    = event.starts_at ? fmtTime(event.starts_at) : '';
      const endTime = event.ends_at   ? fmtTime(event.ends_at)   : '';
      const price   = fmtPrice(event.price_pence);
      const purpose = PURPOSE_LABELS[event.event_purpose] || event.event_purpose || '';

      const rows = [
        date     ? `<tr><td class="lbl">Date</td><td class="val"><strong>${date}</strong></td></tr>` : '',
        time     ? `<tr><td class="lbl">Time</td><td class="val">${time}${endTime ? ` \u2013 ${endTime}` : ''}</td></tr>` : '',
        event.location ? `<tr><td class="lbl">Location</td><td class="val">${event.location}</td></tr>` : '',
        purpose  ? `<tr><td class="lbl">Type</td><td class="val">${purpose}</td></tr>` : '',
        event.organiser ? `<tr><td class="lbl">With</td><td class="val">${event.organiser}</td></tr>` : '',
        `<tr><td class="lbl">Price</td><td class="val"><strong>${price}</strong></td></tr>`,
        event.capacity ? `<tr><td class="lbl">Capacity</td><td class="val">${event.capacity} places</td></tr>` : '',
      ].filter(Boolean).join('');

      eventBlock = `
    <div style="background:#fff8f5;border:1px solid #e8d0c0;border-radius:6px;padding:20px;margin-bottom:24px;">
      <p style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#8a4a2e;margin:0 0 14px;font-weight:600;">Event Details</p>
      <style>.lbl{padding:5px 12px 5px 0;color:#999;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;width:90px;vertical-align:top}.val{padding:5px 0;color:#1a1a18;font-size:13px;vertical-align:top}</style>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      ${event.description ? `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e8d0c0;">
        <p style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#999;margin:0 0 8px;">About this event</p>
        <p style="font-size:13px;color:#3a3a38;line-height:1.7;margin:0;">${event.description}</p>
      </div>` : ''}
    </div>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#faf8f4;color:#1a1a18;">
  <div style="background:#fff;border-radius:8px;padding:32px;border:1px solid #ddd9d0;">
    <p style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#999;margin:0 0 8px;">The Artyst \u00b7 QR Engine</p>
    <h1 style="font-size:24px;font-weight:600;color:#1a1a18;margin:0 0 24px;">${label}</h1>

    ${eventBlock}

    <div style="background:#f5eedf;border-left:3px solid #8a6a2e;border-radius:4px;padding:16px;margin-bottom:${scan_url ? '16px' : '24px'};">
      <p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8a6a2e;margin:0 0 6px;font-weight:600;">Booking URL</p>
      <a href="${url}" style="font-size:14px;color:#8a6a2e;word-break:break-all;">${url}</a>
    </div>

    ${scan_url ? `
    <div style="background:#f7f5f1;border:1px solid #ddd9d0;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#999;margin:0 0 6px;font-weight:600;">Scan URL (tracked)</p>
      <a href="${scan_url}" style="font-size:14px;color:#555;word-break:break-all;">${scan_url}</a>
    </div>` : ''}

    <div style="text-align:center;margin:24px 0;">
      <p style="font-size:12px;color:#999;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.1em;">QR Code</p>
      <img src="cid:qr-code" alt="QR Code" width="200" height="200" style="display:block;margin:0 auto;border:1px solid #ddd;border-radius:4px;"/>
      <p style="font-size:11px;color:#aaa;margin:8px 0 0;">Scan to open: ${qrTarget}</p>
    </div>

    <div style="border-top:1px solid #ddd9d0;padding-top:16px;margin-top:24px;">
      <p style="font-size:12px;color:#aaa;margin:0;">Sent from The Artyst QR Engine \u00b7 go.theartyst.co.uk/admin</p>
    </div>
  </div>
</body>
</html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: event
          ? `${event.title || label}${event.starts_at ? ' \u2014 ' + fmtDate(event.starts_at) : ''}`
          : `QR Code: ${label}`,
        html,
        attachments: [{
          filename: `qr-${slug || 'code'}.png`,
          content: qrBase64,
          content_id: 'qr-code',
        }],
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}));
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Email send failed', detail: err });
    }

    return res.status(200).json({ ok: true, to, label });

  } catch (err: any) {
    console.error('Send destination error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
