import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, property, employment_type, hours, pay, responsibilities, requirements, apply_email, context } = req.body ?? {};

  if (!title?.trim() || !responsibilities?.trim()) {
    return res.status(400).json({ error: 'title and responsibilities are required' });
  }

  const prompt = `Write a job description for ${property || 'The Artyst'}, a distinctive arts and culture venue in Cambridge, UK. Use a warm, intellectual, slightly theatrical tone — not corporate.

Role: ${title}
Employment type: ${employment_type || 'Not specified'}${hours ? ', ' + hours : ''}${pay ? ', ' + pay : ''}
Key responsibilities: ${responsibilities}
Looking for: ${requirements || 'Not specified'}
Apply to: ${apply_email || 'jobs@theartyst.co.uk'}
Additional context: ${context || 'None'}

Format the response with EXACTLY these section headers:

## Overview
[2–3 warm, specific sentences about the role and why it's interesting]

## The Role
- [responsibility]
- [responsibility]
- [responsibility]
- [responsibility]
- [responsibility]

## About You
- [quality or skill]
- [quality or skill]
- [quality or skill]
- [quality or skill]

## What We Offer
- [benefit]
- [benefit]
- [benefit]

## To Apply
[One clear sentence directing applications to ${apply_email || 'jobs@theartyst.co.uk'}]

## Poster Line
[A single complete sentence for the printed poster — warm, specific, ends with a full stop. Max 160 characters.]`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!anthropicRes.ok) throw new Error(`Anthropic HTTP ${anthropicRes.status}`);
    const data = await anthropicRes.json();
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text || '';
    if (!text) throw new Error('empty response');

    return res.status(200).json({ description: text });

  } catch (e) {
    console.error('generate-jd error:', e);
    return res.status(500).json({ error: 'Generation failed' });
  }
}
