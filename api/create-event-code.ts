import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const EVENTS_BASE = 'https://invysible-college-events-engine.vercel.app';

async function db(path: string, method = 'GET', body?: any, prefer?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function slugify(s: string) {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 40);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-ca022-secret'];
  if (secret !== process.env.CA022_SECRET) return res.status(401).json({ error: 'Unauthorised' });

  const { event_id, title, management_type, external_ticket_url } = req.body;
  if (!event_id || !title) return res.status(400).json({ error: 'event_id and title required' });

  // Check if code already exists for this event
  const existing = await db(`/rest/v1/qr_codes?linked_ca017_event_id=eq.${event_id}&select=*`);
  if (Array.isArray(existing) && existing.length > 0) {
    return res.json({ code: existing[0], created: false });
  }

  // Determine destination URL
  const destinationUrl = (management_type === 'external' && external_ticket_url)
    ? external_ticket_url
   : `${EVENTS_BASE}/?event=${event_id}`;

  // Find or create destination record
  const destCheck = await db(`/rest/v1/destinations?url=eq.${encodeURIComponent(destinationUrl)}&select=id`);
  let destinationId: string | null = null;
  if (Array.isArray(destCheck) && destCheck.length > 0) {
    destinationId = destCheck[0].id;
  } else {
    const newDest = await db('/rest/v1/destinations', 'POST',
      { label: title, url: destinationUrl, type: 'event' },
      'return=representation'
    );
    destinationId = Array.isArray(newDest) ? newDest[0]?.id : newDest?.id;
  }

  // Find unique slug
  let baseSlug = slugify(title);
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const check = await db(`/rest/v1/qr_codes?slug=eq.${slug}&select=id`);
    if (!Array.isArray(check) || check.length === 0) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  // Create QR code
  const code = await db('/rest/v1/qr_codes', 'POST', {
    slug, type: 'event', label: title,
    destination_url: destinationUrl,
    destination_id: destinationId,
    linked_ca017_event_id: String(event_id),
    active: true,
  }, 'return=representation');

  const created = Array.isArray(code) ? code[0] : code;
  return res.json({ code: created, created: true });
}
