import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase  = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const BASE_URL  = 'https://artyst-qr.vercel.app'; // interim — update to go.theartyst.co.uk once DNS is live

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // ── Auth ──────────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.headers['x-ca022-secret'] !== process.env.CA022_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  // ── Payload ───────────────────────────────────────────────────────────
  const {
    title,
    slug,
    property         = 'The Artyst',
    employment_type  = null,
    hours            = null,
    pay              = null,
    description      = null,
    apply_email      = 'jobs@theartyst.co.uk',
    ca025_opportunity_id = null,
  } = req.body ?? {};

  if (!title?.trim() || !slug?.trim()) {
    return res.status(400).json({ error: 'title and slug are required' });
  }

  const destinationUrl = `${BASE_URL}/opportunity/${slug}`;

  // ── 1. Upsert destination record ──────────────────────────────────────
  // destinations.url has no unique constraint in the base schema, so we
  // check first to avoid duplicates on repeated calls.
  let destinationId: string;

  const { data: existingDest } = await supabase
    .from('destinations')
    .select('id')
    .eq('url', destinationUrl)
    .maybeSingle();

  if (existingDest) {
    destinationId = existingDest.id;
  } else {
    const { data: newDest, error: destError } = await supabase
      .from('destinations')
      .insert({ label: title.trim(), url: destinationUrl, type: 'opportunity' })
      .select('id')
      .single();

    if (destError || !newDest) {
      console.error('Destination insert error:', destError?.message);
      return res.status(500).json({ error: 'Failed to create destination record' });
    }
    destinationId = newDest.id;
  }

  // ── 2. Upsert opportunity ─────────────────────────────────────────────
  // Idempotent on slug — re-sending the same payload updates rather than duplicates.
  const { data: opp, error: oppError } = await supabase
    .from('opportunities')
    .upsert({
      slug:             slug.trim(),
      title:            title.trim(),
      property,
      employment_type,
      hours,
      pay,
      description,
      apply_email,
      status:           'open',
      active:           true,
      linked_ca025_id:  ca025_opportunity_id,
    }, { onConflict: 'slug' })
    .select('id')
    .single();

  if (oppError || !opp) {
    console.error('Opportunity upsert error:', oppError?.message);
    return res.status(500).json({ error: 'Failed to create opportunity record' });
  }

  // ── 3. Upsert QR code ─────────────────────────────────────────────────
  // Idempotent on slug — re-sending updates destination if changed.
  const { data: qr, error: qrError } = await supabase
    .from('qr_codes')
    .upsert({
      slug:                        slug.trim(),
      type:                        'opportunity',
      label:                       title.trim(),
      destination_url:             destinationUrl,
      destination_id:              destinationId,
      active:                      true,
      scan_count:                  0,
      linked_ca025_opportunity_id: opp.id,
      opportunity_status:          'open',
    }, { onConflict: 'slug' })
    .select('id')
    .single();

  if (qrError || !qr) {
    console.error('QR code upsert error:', qrError?.message);
    return res.status(500).json({ error: 'Failed to create QR code record' });
  }

  // ── 4. Write qr_code_id back onto the opportunity row ─────────────────
  await supabase
    .from('opportunities')
    .update({ qr_code_id: qr.id })
    .eq('id', opp.id);

  // ── Response ──────────────────────────────────────────────────────────
  return res.status(200).json({
    success:          true,
    qr_code_id:       qr.id,
    opportunity_id:   opp.id,
    destination_url:  destinationUrl,
    redirect_url:     `${BASE_URL}/e/${slug}`,   // interim
    // Once DNS is live, redirect will resolve via go.theartyst.co.uk/e/[slug]
  });
}
