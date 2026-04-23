import type { VercelRequest, VercelResponse } from '@vercel/node';
import QRCode from 'qrcode';

// CA-022 — Send destination info + QR code by email via Resend
// Requires RESEND_API_KEY in Vercel env vars

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM = 'The Artyst <events@theartyst.co.uk>';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, label, url, scan_url, slug } = req.body || {};

  if (!to || !label || !url) {
    return res.status(400).json({ error: 'to, label and url are required' });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const qrTarget = scan_url || url;

  try {
    // Generate QR code as base64 PNG
    const qrDataUrl = await QRCode.toDataURL(qrTarget, {
      width: 300,
      margin: 2,
      color: { dark: '#111111', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });
    const qrBase64 = qrDataUrl.split(',')[1];

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#faf8f4;color:#1a1a18;">
  <div style="background:#fff;border-radius:8px;padding:32px;border:1px solid #ddd9d0;">
    <p style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#999;margin:0 0 8px;">The Artyst · QR Engine</p>
    <h1 style="font-size:24px;font-weight:600;color:#1a1a18;margin:0 0 24px;">${label}</h1>

    <div style="background:#f5eedf;border-left:3px solid #8a6a2e;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8a6a2e;margin:0 0 6px;font-weight:600;">Destination URL</p>
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
      <p style="font-size:12px;color:#aaa;margin:0;">Sent from The Artyst QR Engine · go.theartyst.co.uk/admin</p>
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
        subject: `QR Code: ${label}`,
        html,
        attachments: [
          {
            filename: `qr-${slug || 'code'}.png`,
            content: qrBase64,
            content_id: 'qr-code',
          },
        ],
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
