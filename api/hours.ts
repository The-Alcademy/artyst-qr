import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Missing Supabase config' });

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    const r = await fetch(`${url}/rest/v1/opening_hours?order=day_of_week`, { headers });
    if (!r.ok) {
      const txt = await r.text();
      console.error('[api/hours] Supabase', r.status, txt);
      return res.status(500).json({ error: 'Supabase fetch failed', detail: txt });
    }

    const rows = await r.json();
    const days: any[] = Array.isArray(rows) ? rows : [];

    // ── Determine "now" in Europe/London ──
    // Use toLocaleString trick — works reliably in Node serverless
    let todayNum = 0;
    let currentMinutes = 0;
    try {
      const londonStr = new Date().toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      // e.g. "Sat, 19:42" or "Sat, 19:42:11"
      const match = londonStr.match(/^(\w+),?\s+(\d{1,2}):(\d{2})/);
      if (match) {
        const weekdayShort = match[1];
        const hour = parseInt(match[2], 10);
        const minute = parseInt(match[3], 10);
        const weekdayMap: Record<string, number> = {
          Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
        };
        todayNum = weekdayMap[weekdayShort] ?? 0;
        currentMinutes = (isNaN(hour) ? 0 : hour) * 60 + (isNaN(minute) ? 0 : minute);
      }
    } catch (e) {
      // Fallback to UTC if locale parsing fails — not ideal but won't crash
      const now = new Date();
      todayNum = now.getUTCDay();
      currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    }

    // ── Helpers ──
    const toMinutes = (t: string | null | undefined): number | null => {
      if (!t || typeof t !== 'string') return null;
      const bits = t.split(':');
      const h = parseInt(bits[0], 10);
      const m = parseInt(bits[1], 10);
      if (isNaN(h) || isNaN(m)) return null;
      return h * 60 + m;
    };

    const formatTime = (t: string | null | undefined): string => {
      if (!t || typeof t !== 'string') return '';
      return t.substring(0, 5);
    };

    // ── Find today / tomorrow ──
    const today = days.find(d => d.day_of_week === todayNum);
    const tomorrowNum = (todayNum + 1) % 7;
    const tomorrow = days.find(d => d.day_of_week === tomorrowNum);

    // ── Compute state ──
    const state: any = {
      is_open: false,
      closes_at: null,
      opens_at: null,
      opens_day: null,
      today_label: today?.day_label || '',
    };

    if (today && today.active && today.opens_at && today.closes_at) {
      const opensMin = toMinutes(today.opens_at);
      const closesMin = toMinutes(today.closes_at);
      if (opensMin !== null && closesMin !== null) {
        if (currentMinutes >= opensMin && currentMinutes < closesMin) {
          state.is_open = true;
          state.closes_at = formatTime(today.closes_at);
        } else if (currentMinutes < opensMin) {
          state.opens_at = formatTime(today.opens_at);
          state.opens_day = 'today';
        } else {
          // Closed for the night — find next open day
          if (tomorrow && tomorrow.active && tomorrow.opens_at) {
            state.opens_at = formatTime(tomorrow.opens_at);
            state.opens_day = tomorrow.day_label || 'tomorrow';
          }
        }
      }
    } else {
      // Closed today — find next open day
      for (let i = 1; i <= 7; i++) {
        const checkNum = (todayNum + i) % 7;
        const d = days.find(x => x.day_of_week === checkNum);
        if (d && d.active && d.opens_at) {
          state.opens_at = formatTime(d.opens_at);
          state.opens_day = i === 1 ? (d.day_label || 'tomorrow') : (d.day_label || '');
          break;
        }
      }
    }

    const formattedDays = days.map(d => ({
      day_of_week: d.day_of_week,
      day_label: d.day_label,
      opens_at: formatTime(d.opens_at),
      closes_at: formatTime(d.closes_at),
      notes: d.notes || null,
      active: !!d.active,
      is_today: d.day_of_week === todayNum,
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ days: formattedDays, state });
  } catch (err: any) {
    console.error('[api/hours]', err?.message || err);
    return res.status(500).json({
      error: 'Failed to fetch hours',
      detail: err?.message || String(err),
    });
  }
}
