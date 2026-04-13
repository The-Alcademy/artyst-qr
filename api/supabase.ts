import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { path, method, body, prefer } = req.body;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };

  if (prefer) headers['Prefer'] = prefer;

  try {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      method: method || 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('Supabase proxy error:', err);
    return res.status(500).json({ error: 'Supabase proxy error' });
  }
}
