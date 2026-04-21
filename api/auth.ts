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

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + process.env.AUTH_SALT!).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Login
  if (req.method === 'POST' && req.query.action !== 'verify') {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const hash = hashPassword(password);
    const users = await db(`ca022_users?username=eq.${encodeURIComponent(username)}&password_hash=eq.${encodeURIComponent(hash)}&active=eq.true&select=id,username,name,role`);

    if (!users?.length) return res.status(401).json({ error: 'Invalid username or password' });

    const user = users[0];
    const token = generateToken();
    const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

    await db('ca022_sessions', 'POST', {
      user_id: user.id,
      token,
      expires_at: expires,
      last_active: new Date().toISOString(),
    });

    return res.status(200).json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  }

  // Verify token
  if (req.method === 'POST' && req.query.action === 'verify') {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const now = new Date().toISOString();
    const sessions = await db(`ca022_sessions?token=eq.${token}&expires_at=gt.${encodeURIComponent(now)}&select=user_id,ca022_users(id,username,name,role,active)`);

    if (!sessions?.length) return res.status(401).json({ error: 'Invalid or expired session' });

    const user = sessions[0].ca022_users;
    if (!user?.active) return res.status(401).json({ error: 'Account inactive' });

    // Update last_active
    await db(`ca022_sessions?token=eq.${token}`, 'PATCH', { last_active: now });

    return res.status(200).json({ user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  }

  // Logout
  if (req.method === 'DELETE') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) await db(`ca022_sessions?token=eq.${token}`, 'DELETE');
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
