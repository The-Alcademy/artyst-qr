// CA-022 — Admin password check
// Reads ADMIN_PASSWORD from Vercel env vars; returns {ok:true} on match.
// Falls back to 'alcademy' if no env var is set (same fallback as CA-011).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { password } = req.body || {};
    if (typeof password !== 'string') {
      return res.status(400).json({ error: 'Password required' });
    }

    const expected = process.env.ADMIN_PASSWORD || 'alcademy';

    // Constant-time-ish comparison — good enough at this scale
    if (password.length !== expected.length) {
      return res.status(200).json({ ok: false });
    }
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= password.charCodeAt(i) ^ expected.charCodeAt(i);
    }

    return res.status(200).json({ ok: mismatch === 0 });
  } catch (err) {
    return res.status(500).json({ error: 'Auth check failed' });
  }
}
