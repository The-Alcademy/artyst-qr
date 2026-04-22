import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { path, method = 'GET', body, prefer } = req.body || {};

  if (!path) return res.status(400).json({ error: 'path required' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Supabase env vars not set' });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };

  // Critical: PATCH/POST need Prefer header so PostgREST processes the request
  if (method === 'PATCH' || method === 'PUT') {
    headers['Prefer'] = prefer || 'return=minimal';
  } else if (method === 'POST') {
    headers['Prefer'] = prefer || 'return=representation';
  } else if (prefer) {
    headers['Prefer'] = prefer;
  }

  try {
    const upstream = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // PATCH with return=minimal returns 204 No Content — handle gracefully
    if (upstream.status === 204) {
      return res.status(200).json({ success: true });
    }

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    return res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (err) {
    console.error('Supabase proxy error:', err);
    return res.status(500).json({ error: 'Proxy error' });
  }
}
