// ─────────────────────────────────────────────────────────────────
// api/notices.ts
//
// CA-030 Notices — admin CRUD endpoint.
//
// Routes by HTTP method:
//   GET    /api/notices        → list notices (with filters)
//   GET    /api/notices?id=X   → single notice by id
//   POST   /api/notices        → create notice (admin only)
//   PATCH  /api/notices?id=X   → update notice (admin or matching language editor)
//   DELETE /api/notices?id=X   → soft delete (admin only)
//
// Auth model matches api/users.ts:
//   - Authorization: Bearer <token>
//   - Token validated against ca022_sessions joined to ca022_users
//
// Permission rules:
//   - admin: full CRUD on every notice
//   - language_editor: can list and update language-specific fields on any
//                       notice; cannot create or delete; v1 only role exists,
//                       no language editor users assigned yet
//   - viewer: read-only
// ─────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

async function db(path: string, method = 'GET', body?: object) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey:        SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer:        'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

type AuthUser = {
  id:         string;
  username:   string;
  name:       string;
  role:       'admin' | 'viewer' | 'language_editor';
  active:     boolean;
};

async function getAuthUser(token: string): Promise<AuthUser | null> {
  if (!token) return null;
  const now = new Date().toISOString();
  const sessions = await db(
    `ca022_sessions?token=eq.${token}&expires_at=gt.${encodeURIComponent(now)}` +
    `&select=user_id,ca022_users(id,username,name,role,active)`
  );
  if (!sessions?.length) return null;
  const u = sessions[0].ca022_users;
  if (!u?.active) return null;
  return u as AuthUser;
}

// ── Allowed values ─────────────────────────────────────────────
const PROPERTIES = new Set(['artyst','alcademy','ic','bedegame','othersyde']);
const PRIORITIES = new Set(['info','important','urgent']);
const STYLES     = new Set(['strip','banner','modal']);

// Fields a language_editor is allowed to modify on any notice:
const LANGUAGE_FIELDS_BY_CODE: Record<string, string[]> = {
  zh: ['title_zh','body_zh','cta_label_zh','xiaohongshu_post_url'],
  // future: fr, es, etc.
};

// ── Helpers ─────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug || `notice-${Date.now()}`;
  let suffix = 0;
  while (true) {
    const tryS = suffix === 0 ? slug : `${slug}-${suffix}`;
    const existing = await db(`notices?slug=eq.${encodeURIComponent(tryS)}&select=id`);
    if (!existing?.length) return tryS;
    suffix += 1;
    if (suffix > 50) {
      // Failsafe — append timestamp
      return `${slug}-${Date.now()}`;
    }
  }
}

// Validate and clean a notice payload — used for both POST and PATCH.
// Returns { ok: true, data } or { ok: false, error }.
function validatePayload(body: any, isCreate: boolean) {
  const out: Record<string, any> = {};
  const errors: string[] = [];

  if (isCreate) {
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      errors.push('title is required');
    }
    if (!body.body || typeof body.body !== 'string' || !body.body.trim()) {
      errors.push('body is required');
    }
    if (!body.property || !PROPERTIES.has(body.property)) {
      errors.push('property must be one of: artyst, alcademy, ic, bedegame, othersyde');
    }
  } else {
    if ('property' in body && !PROPERTIES.has(body.property)) {
      errors.push('property must be one of: artyst, alcademy, ic, bedegame, othersyde');
    }
  }

  if ('priority' in body && !PRIORITIES.has(body.priority)) {
    errors.push('priority must be one of: info, important, urgent');
  }

  if ('website_style' in body && body.website_style !== null && !STYLES.has(body.website_style)) {
    errors.push('website_style must be one of: strip, banner, modal');
  }

  if (errors.length) return { ok: false as const, error: errors.join('; ') };

  // Whitelist allowed columns
  const allowed = [
    'slug','property',
    'title','body','cta_label','cta_url',
    'title_zh','body_zh','cta_label_zh',
    'xiaohongshu_post_url',
    'priority','starts_at','ends_at',
    'show_on_print','show_on_screens','show_on_website',
    'show_in_emails','show_on_whatsapp','show_on_xiaohongshu',
    'website_style','active','created_by','created_by_role',
  ];
  for (const k of allowed) {
    if (k in body) out[k] = body[k];
  }

  // Empty strings → null for nullable text fields
  for (const k of ['cta_label','cta_url','title_zh','body_zh','cta_label_zh','xiaohongshu_post_url']) {
    if (out[k] === '') out[k] = null;
  }

  return { ok: true as const, data: out };
}

// Trim a payload to only fields that a given language_editor is allowed to modify.
function restrictToLanguageEditor(payload: Record<string, any>, langCode: string): Record<string, any> {
  const allowed = LANGUAGE_FIELDS_BY_CODE[langCode] || [];
  const restricted: Record<string, any> = {};
  for (const k of allowed) {
    if (k in payload) restricted[k] = payload[k];
  }
  return restricted;
}

// ── Handler ─────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  const token = req.headers.authorization?.replace('Bearer ', '') || '';
  const user  = await getAuthUser(token);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const id = (req.query.id as string) || '';

  // ── GET ───────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (id) {
      // Single notice
      const rows = await db(`notices?id=eq.${encodeURIComponent(id)}&select=*`);
      if (!rows?.length) return res.status(404).json({ error: 'Notice not found' });
      return res.status(200).json(rows[0]);
    }

    // List with filters
    const params: string[] = [];
    if (req.query.property) {
      params.push(`property=eq.${encodeURIComponent(String(req.query.property))}`);
    }
    if (req.query.active === 'true') {
      params.push(`active=eq.true`);
    }
    if (req.query.surface) {
      const surfaceMap: Record<string, string> = {
        print:       'show_on_print',
        screens:     'show_on_screens',
        website:     'show_on_website',
        emails:      'show_in_emails',
        whatsapp:    'show_on_whatsapp',
        xiaohongshu: 'show_on_xiaohongshu',
      };
      const col = surfaceMap[String(req.query.surface)];
      if (col) params.push(`${col}=eq.true`);
    }
    params.push('order=created_at.desc');
    params.push('select=*');

    const rows = await db(`notices?${params.join('&')}`);
    return res.status(200).json(rows || []);
  }

  // Everything below requires write capability — admin or language_editor
  if (user.role === 'viewer') {
    return res.status(403).json({ error: 'Read-only role; cannot modify notices' });
  }

  // ── POST (create) ─────────────────────────────────────────────
  if (req.method === 'POST') {
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can create notices' });
    }

    const v = validatePayload(req.body || {}, true);
    if (!v.ok) return res.status(400).json({ error: v.error });

    const data = v.data;

    // Auto-generate slug from title if not provided
    if (!data.slug) {
      data.slug = slugify(data.title);
    } else {
      data.slug = slugify(data.slug);
    }
    data.slug = await ensureUniqueSlug(data.slug);

    data.created_by      = user.username;
    data.created_by_role = user.role;

    const inserted = await db('notices', 'POST', data);
    if (!inserted?.length) {
      return res.status(500).json({ error: 'Failed to create notice' });
    }
    return res.status(201).json(inserted[0]);
  }

  // ── PATCH (update) ────────────────────────────────────────────
  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'id query param required' });

    const v = validatePayload(req.body || {}, false);
    if (!v.ok) return res.status(400).json({ error: v.error });

    let payload = v.data;

    // Language editors can only touch their language fields
    if (user.role === 'language_editor') {
      // For v1 we hard-code zh — when other languages exist, this reads
      // user.language_code from an extended user model.
      const langCode = 'zh';
      payload = restrictToLanguageEditor(payload, langCode);
      if (!Object.keys(payload).length) {
        return res.status(403).json({
          error: 'Language editors can only modify their language-specific fields'
        });
      }
    }

    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const updated = await db(
      `notices?id=eq.${encodeURIComponent(id)}`,
      'PATCH',
      payload
    );
    if (!updated?.length) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    return res.status(200).json(updated[0]);
  }

  // ── DELETE (soft delete) ──────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id query param required' });
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete notices' });
    }

    const updated = await db(
      `notices?id=eq.${encodeURIComponent(id)}`,
      'PATCH',
      { active: false }
    );
    if (!updated?.length) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    return res.status(200).json({ ok: true, id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
