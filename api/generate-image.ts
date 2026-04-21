import type { VercelRequest, VercelResponse } from '@vercel/node';

// Event type → visual style prompt fragments
const EVENT_STYLES: Record<string, string> = {
  wine_tasting:    'candlelit wine cellar atmosphere, elegant wine glasses, warm amber light, bottles of wine, intimate setting',
  music_performance: 'atmospheric concert venue, dramatic stage lighting, warm spotlight, musical atmosphere, intimate Cambridge venue',
  talk_lecture:    'atmospheric lecture hall, warm lamp light, books and ideas, intellectual gathering, Cambridge academic setting',
  workshop:        'creative workshop space, hands-on making, warm natural light, craft and creativity',
  quiz_night:      'warm pub atmosphere, chalkboard, friendly gathering, evening light, community feel',
  exhibition:      'gallery white walls, dramatic art lighting, contemplative space, cultural venue',
  book_reading:    'intimate reading nook, warm lamplight, stacked books, quiet atmosphere, literary gathering',
  game_playing:    'chess pieces, candlelight, warm tones, focused concentration, game night atmosphere',
  dining:          'beautifully set table, warm candlelight, atmospheric restaurant, intimate dining',
  afternoon_tea:   'elegant afternoon tea setting, fine china, warm afternoon light, cakes and sandwiches',
  tour:            'Cambridge streets, atmospheric heritage, morning light, historic architecture',
  default:         'atmospheric Cambridge venue, warm candlelight, cultural event, intimate gathering, evening mood',
};

const BASE_STYLE = 'photographic, moody atmospheric lighting, warm tones, high quality, editorial photography style, Cambridge arts venue, Syd Barrett era psychedelic influence, no text, no words';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, event_purpose, description } = req.body || {};

  const styleKey = event_purpose && EVENT_STYLES[event_purpose] ? event_purpose : 'default';
  const styleFragment = EVENT_STYLES[styleKey];

  const prompt = [
    styleFragment,
    BASE_STYLE,
    title ? `event titled "${title}"` : '',
    description ? description.substring(0, 100) : '',
  ].filter(Boolean).join(', ');

  try {
    const falRes = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${process.env.FAL_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        image_size: 'portrait_4_3',
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: true,
      }),
    });

    if (!falRes.ok) {
      const err = await falRes.text();
      console.error('fal.ai error:', err);
      return res.status(500).json({ error: 'Image generation failed', detail: err });
    }

    const data = await falRes.json();
    const url = data?.images?.[0]?.url;
    if (!url) return res.status(500).json({ error: 'No image returned' });

    return res.status(200).json({ url });
  } catch (err) {
    console.error('Generate image error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
