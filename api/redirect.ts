import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const FALLBACK_URL = 'https://theartyst.co.uk';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.redirect(302, FALLBACK_URL);
  }

  try {
    // Increment scan count and get destination in one call
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/increment_scan_count`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ p_slug: slug }),
      }
    );

    if (!response.ok) {
      return res.redirect(302, FALLBACK_URL);
    }

    const data = await response.json();

    if (!data || !data.destination_url) {
      return res.redirect(302, FALLBACK_URL);
    }

    return res.redirect(302, data.destination_url);

  } catch (err) {
    console.error('QR redirect error:', err);
    return res.redirect(302, FALLBACK_URL);
  }
}
