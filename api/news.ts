import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Missing Supabase config' });

  // Which surface is asking — 'menu' or 'takeaway'. Default: menu.
  const rawSurface = (req.query.surface as string) || 'menu';
  const surface = rawSurface === 'takeaway' ? 'takeaway' : 'menu';
  const surfaceFilter = surface === 'takeaway' ? 'show_on_takeaway=eq.true' : 'show_on_menu=eq.true';

  // Current timestamp in ISO for starts_at/ends_at filtering
  const now = new Date().toISOString();

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    // Filter: active=true, surface toggle true, starts_at null OR past, ends_at null OR future
    // PostgREST 'or' syntax for nullable date range
    const startsOk = `or=(starts_at.is.null,starts_at.lte.${now})`;
    const endsOk   = `and=(or(ends_at.is.null,ends_at.gte.${now}))`;

    // Simpler: use two separate queries joined client-side would be messy. PostgREST chained filter:
    // ?active=eq.true&show_on_menu=eq.true&or=(starts_at.is.null,starts_at.lte.{now})&or=(ends_at.is.null,ends_at.gte.{now})
    // But chained 'or=' params override each other in PostgREST — we must AND them manually with 'and='.
    // Use: and=(or(starts_at.is.null,starts_at.lte.NOW),or(ends_at.is.null,ends_at.gte.NOW))
    const andFilter = `and=(or(starts_at.is.null,starts_at.lte.${encodeURIComponent(now)}),or(ends_at.is.null,ends_at.gte.${encodeURIComponent(now)}))`;

    const query = `active=eq.true&${surfaceFilter}&${andFilter}&order=sort_order`;

    const r = await fetch(`${url}/rest/v1/news_messages?${query}`, { headers });
    if (!r.ok) {
      const txt = await r.text();
      console.error('[api/news] Supabase', r.status, txt);
      throw new Error('Supabase fetch failed');
    }

    const rows = await r.json();
    const news = (Array.isArray(rows) ? rows : []).map((n: any) => ({
      id: n.id,
      label: n.label,
      headline: n.headline,
      href: n.href || null,
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ news });
  } catch (err) {
    console.error('[api/news]', err);
    return res.status(500).json({ error: 'Failed to fetch news' });
  }
}
