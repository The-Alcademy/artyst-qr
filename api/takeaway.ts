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
    const [catRes, itemsRes] = await Promise.all([
      fetch(`${url}/rest/v1/menu_categories?active=eq.true&order=side,sort_order`, { headers }),
      fetch(`${url}/rest/v1/menu_items?takeaway=eq.true&available=eq.true&order=category_id,sort_order`, { headers }),
    ]);
    if (!catRes.ok || !itemsRes.ok) throw new Error('Supabase fetch failed');

    const categories = await catRes.json();
    const items = await itemsRes.json();

    const grouped = categories
      .map((cat: any) => ({
        id: cat.id, name: cat.name, slug: cat.slug, side: cat.side,
        items: items.filter((item: any) => item.category_id === cat.id).map((item: any) => ({
          id: item.id, name: item.name, description: item.description,
          price_display: item.price_display, dietary_tags: item.dietary_tags || [],
          available: item.available, details: item.details || null,
          options: item.options || null,
        })),
      }))
      .filter((cat: any) => cat.items.length > 0);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ categories: grouped });
  } catch (err) {
    console.error('[api/takeaway]', err);
    return res.status(500).json({ error: 'Failed to fetch takeaway menu' });
  }
}
