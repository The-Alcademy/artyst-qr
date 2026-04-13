import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const BUCKET = 'poster-images';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { base64, filename, contentType } = req.body;
  if (!base64 || !filename) return res.status(400).json({ error: 'base64 and filename required' });

  const buffer = Buffer.from(base64, 'base64');
  const uniqueName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${uniqueName}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': contentType || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: buffer,
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: err });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${uniqueName}`;
    return res.json({ url: publicUrl });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
