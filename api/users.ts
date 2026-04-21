import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

async function db(path: string, method = 'GET', body?: object) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function verifyAdmin(token: string): Promise<boolean> {
  if (!token) return false;
  const now = new Date().toISOString();
  const sessions = await db(`ca022_sessions?token=eq.${token}&expires_at=gt.${encodeURIComponent(now)}&select=user_id,ca022_users(role,active)`);
  if (!sessions?.length) return false;
  const user = sessions[0].ca022_users;
  return user?.active && user?.role === 'admin';
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + process.env.AUTH_SALT!).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || '';
  const isAdmin = await verifyAdmin(token);
  if (!isAdmin) return res.status(401).json({ error: 'Admin access required' });

  // List users
  if (req.method === 'GET') {
    const users = await db('ca022_users?select=id,username,name,role,active,created_at&order=created_at.asc');
    return res.status(200).json(users || []);
  }

  // Create user
  if (req.method === 'POST') {
    const { username, password, role, name } = req.body;
    if (!username || !password || !role || !name) return res.status(400).json({ error: 'All fields required' });
    const hash = hashPassword(password);
    const user = await db('ca022_users', 'POST', { username, password_hash: hash, role, name, active: true });
    return res.status(201).json(user?.[0] || {});
  }

  // Update user
  if (req.method === 'PATCH') {
    const { id, password, ...updates } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    if (password) updates.password_hash = hashPassword(password);
    await db(`ca022_users?id=eq.${id}`, 'PATCH', updates);
    return res.status(200).json({ ok: true });
  }

  // Delete user
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    await db(`ca022_sessions?user_id=eq.${id}`, 'DELETE');
    await db(`ca022_users?id=eq.${id}`, 'DELETE');
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
