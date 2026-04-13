import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { zone } = req.query;
  if (!zone || typeof zone !== 'string') return res.status(400).json({ error: 'Zone required' });

  try {
    const zoneRes = await fetch(
      `${SUPABASE_URL}/rest/v1/screen_zones?slug=eq.${zone}&select=*`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const zones = await zoneRes.json();
    if (!zones?.length) return res.status(404).json({ error: 'Zone not found' });

    const zoneData = zones[0];
    const assignRes = await fetch(
      `${SUPABASE_URL}/rest/v1/screen_assignments?zone_id=eq.${zoneData.id}&active=eq.true&select=*,qr_codes(*)&order=display_order.asc`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const assignments = await assignRes.json();

    res.setHeader('Content-Type', 'text/html');
    res.send(generateDisplayHTML(zoneData, assignments || []));
  } catch (err) {
    console.error('Display error:', err);
    res.status(500).send('Display error');
  }
}

function generateDisplayHTML(zone: any, assignments: any[]) {
  const codes = assignments.map(a => a.qr_codes).filter(Boolean);
  const isLandscape = zone.format.includes('landscape');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${zone.name} Display — The Artyst</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #111; color: #fff; font-family: Georgia, serif; overflow: hidden; width: 100vw; height: 100vh; }
    .slide { position: absolute; inset: 0; display: flex; flex-direction: ${isLandscape ? 'row' : 'column'}; align-items: center; justify-content: center; padding: 5%; opacity: 0; transition: opacity 1s; }
    .slide.active { opacity: 1; }
    .slide-content { display: flex; flex-direction: column; align-items: center; gap: 2vh; text-align: center; max-width: ${isLandscape ? '60%' : '100%'}; }
    .venue { font-size: 1.2vh; letter-spacing: 0.3em; text-transform: uppercase; color: #888; }
    .accent { width: 60px; height: 3px; background: #c0392b; }
    .title { font-size: ${isLandscape ? '5vh' : '6vh'}; line-height: 1.2; }
    .description { font-size: 2vh; color: #aaa; line-height: 1.6; }
    .meta { font-size: 2.2vh; color: #ccc; }
    .price { font-size: 3vh; font-weight: bold; }
    .qr-side { display: flex; flex-direction: column; align-items: center; gap: 2vh; padding: ${isLandscape ? '0 5%' : '4vh 0 0'}; }
    .cta { font-size: 1.5vh; letter-spacing: 0.2em; text-transform: uppercase; color: #888; }
    #qr-container canvas, #qr-container img { width: ${isLandscape ? '20vh' : '25vh'}; height: ${isLandscape ? '20vh' : '25vh'}; }
    .empty { display: flex; align-items: center; justify-content: center; height: 100vh; color: #444; font-size: 2vh; letter-spacing: 0.2em; text-transform: uppercase; }
    .zone-label { position: fixed; bottom: 1vh; right: 1vh; font-size: 1vh; color: #333; letter-spacing: 0.1em; text-transform: uppercase; }
    .progress { position: fixed; bottom: 0; left: 0; height: 2px; background: #c0392b; transition: width linear; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head>
<body>
${!codes.length ? `<div class="empty">No active posters assigned to this display</div>` : codes.map((c, i) => `
  <div class="slide${i === 0 ? ' active' : ''}" data-index="${i}">
    <div class="slide-content">
      <div class="venue">The Artyst · Cambridge</div>
      <div class="accent"></div>
      <div class="title">${c.label}</div>
      ${c.description ? `<div class="description">${c.description}</div>` : ''}
      ${c.date_text ? `<div class="meta">${c.date_text}</div>` : ''}
      ${c.price_text ? `<div class="price">${c.price_text}</div>` : ''}
    </div>
    <div class="qr-side">
      <div id="qr-${i}"></div>
      <div class="cta">Scan to find out more</div>
    </div>
  </div>`).join('')}
<div class="zone-label">${zone.name}</div>
<div class="progress" id="progress"></div>
<script>
  const codes = ${JSON.stringify(codes)};
  const baseUrl = window.location.origin;
  let current = 0;
  const duration = 8000;

  codes.forEach((c, i) => {
    const el = document.getElementById('qr-' + i);
    if (el) new QRCode(el, { text: baseUrl + '/e/' + c.slug, width: 200, height: 200, colorDark: '#111', colorLight: '#fff' });
  });

  function showSlide(i) {
    document.querySelectorAll('.slide').forEach(s => s.classList.remove('active'));
    const slide = document.querySelector('[data-index="' + i + '"]');
    if (slide) slide.classList.add('active');
    const progress = document.getElementById('progress');
    if (progress) { progress.style.transition = 'none'; progress.style.width = '0%'; setTimeout(() => { progress.style.transition = 'width ' + duration + 'ms linear'; progress.style.width = '100%'; }, 50); }
  }

  if (codes.length > 1) {
    setInterval(() => { current = (current + 1) % codes.length; showSlide(current); }, duration);
  } else if (codes.length === 1) {
    document.getElementById('progress').style.display = 'none';
  }

  // Refresh assignments every 60 seconds
  setInterval(() => window.location.reload(), 60000);
</script>
</body>
</html>`;
}
