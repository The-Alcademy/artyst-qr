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

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    const [catsRes, itemsRes] = await Promise.all([
      fetch(`${url}/rest/v1/play_categories?active=eq.true&order=sort_order`, { headers }),
      fetch(`${url}/rest/v1/play_items?active=eq.true&order=sort_order`, { headers }),
    ]);

    if (!catsRes.ok || !itemsRes.ok) {
      const txt = !catsRes.ok ? await catsRes.text() : await itemsRes.text();
      console.error('[api/play] Supabase fetch failed', txt);
      return res.status(500).json({ error: 'Supabase fetch failed', detail: txt });
    }

    const cats = await catsRes.json();
    const items = await itemsRes.json();

    const categories = (Array.isArray(cats) ? cats : []).map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      sort_order: c.sort_order,
      items: (Array.isArray(items) ? items : [])
        .filter((i: any) => i.category_id === c.id)
        .map((i: any) => ({
          id: i.id,
          title: i.title,
          subtitle: i.subtitle || null,
          description: i.description || null,
          when_text: i.when_text || null,
          href: i.href || null,
          cta_label: i.cta_label || null,
          image_url: i.image_url || null,
        })),
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ categories });
  } catch (err: any) {
    console.error('[api/play]', err?.message || err);
    return res.status(500).json({
      error: 'Failed to fetch play content',
      detail: err?.message || String(err),
    });
  }
}
