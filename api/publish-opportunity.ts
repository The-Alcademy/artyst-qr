import type { VercelRequest, VercelResponse } from '@vercel/node';

// Thin proxy — receives the publish request from the job engine browser UI,
// attaches the CA022_SECRET server-side, and forwards to create-opportunity-code.
// The secret never touches the browser.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    title, slug, property, employment_type,
    hours, pay, description, apply_email, ca025_opportunity_id
  } = req.body ?? {};

  if (!title?.trim() || !slug?.trim()) {
    return res.status(400).json({ error: 'title and slug are required' });
  }

  try {
    const forwarded = await fetch(
      `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['host']}/api/create-opportunity-code`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ca022-secret': process.env.CA022_SECRET!
        },
        body: JSON.stringify({
          title, slug, property, employment_type,
          hours, pay, description, apply_email, ca025_opportunity_id
        })
      }
    );

    const data = await forwarded.json();
    return res.status(forwarded.status).json(data);

  } catch (e) {
    console.error('publish-opportunity error:', e);
    return res.status(500).json({ error: 'Publish failed' });
  }
}
