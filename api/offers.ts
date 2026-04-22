import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Missing config' });

  try {
    const r = await fetch(`${url}/rest/v1/slot_offers?order=slot`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!r.ok) throw new Error('Supabase error');
    const offers = await r.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ offers });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch offers' });
  }
}
