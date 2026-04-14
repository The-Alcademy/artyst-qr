import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    qr_code_id,
    slug,
    label,
    type,
    redirect_url,
    destination_url,
    channel = 'artyst',
    staff_name,
    note,
  } = req.body ?? {};

  if (!slug || !label) {
    return res.status(400).json({ error: 'slug and label are required' });
  }

  const url = redirect_url || destination_url || '';

  // ── Build a prompt describing the content ────────────────────────────────
  // The prompt varies by QR code type so Claude can write an appropriate message.
  let prompt: string;

  if (type === 'opportunity') {
    prompt = `New job opportunity at The Artyst, Cambridge: ${label}. Apply now at ${url}`;
  } else if (type === 'event') {
    prompt = `New event at The Artyst, Cambridge: ${label}. Find out more and book at ${url}`;
  } else if (type === 'enrolment') {
    prompt = `Join the Invysible College — enrol now at ${url}`;
  } else {
    prompt = note
      ? `${note} — ${url}`
      : `${label} — find out more at ${url}`;
  }

  if (note && type !== 'generic') {
    prompt += `. ${note}`;
  }

  // ── Call Claude Dispatch ─────────────────────────────────────────────────
  const dispatchUrl = process.env.DISPATCH_URL!;
  const secret      = process.env.DISPATCH_SECRET!;

  try {
    const dispatchRes = await fetch(dispatchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event:   'manual',
        channel,
        secret,
        dryRun:  false,
        data: {
          prompt,
          wordLimit: 40,
        },
      }),
    });

    const dispatchData = await dispatchRes.json();

    if (!dispatchRes.ok) {
      console.error('Dispatch error:', dispatchData);
      return res.status(500).json({ error: dispatchData.error || 'Dispatch failed' });
    }

    // ── Log the send in Supabase ─────────────────────────────────────────
    if (qr_code_id) {
      // Find or create staff record
      let staffId: string | null = null;
      if (staff_name) {
        const { data: existing } = await supabase
          .from('staff')
          .select('id')
          .eq('name', staff_name)
          .maybeSingle();

        if (existing) {
          staffId = existing.id;
        } else {
          const { data: created } = await supabase
            .from('staff')
            .insert({ name: staff_name })
            .select('id')
            .single();
          staffId = created?.id ?? null;
        }
      }

      // Log distribution
      await supabase.from('distributions').insert({
        qr_code_id,
        staff_id:   staffId,
        note:       note || null,
        channels:   ['whatsapp'],
        groups:     [],
        status:     'sent',
      });

      // Update last_distributed_at on the code
      await supabase
        .from('qr_codes')
        .update({ last_distributed_at: new Date().toISOString() })
        .eq('id', qr_code_id);
    }

    return res.status(200).json({
      success: true,
      message: dispatchData.message || '',
      channel,
    });

  } catch (e) {
    console.error('send-whatsapp error:', e);
    return res.status(500).json({ error: 'Send failed' });
  }
}
