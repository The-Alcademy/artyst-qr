import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY!);

// Group slugs — must match names in distribution_groups table
const LIST_SLUGS: Record<string, string> = {
  artyst: 'All subscribers',
  tours:  'Mailchimp mailing list',
  ic:     'All subscribers', // IC members also go into all subscribers for now
};

function esc(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── GET — serve the signup page ───────────────────────────────────────────
function renderPage(status?: 'success' | 'error' | 'duplicate'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stay in touch — The Artyst</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #faf9f7; color: #1a1614; font-family: 'Crimson Pro', Georgia, serif; font-size: 18px; line-height: 1.7; min-height: 100vh; }

  .site-header { background: #fff; border-bottom: 1px solid #e8e4de; padding: 16px 32px; }
  .site-name { font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 700; color: #1a1614; text-decoration: none; }

  .hero { background: #1a1614; color: #ede8df; padding: 56px 32px 48px; text-align: center; }
  .hero-eyebrow { font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: #c8a96e; margin-bottom: 16px; font-family: 'Crimson Pro', serif; }
  .hero-title { font-family: 'Playfair Display', serif; font-size: clamp(32px, 6vw, 56px); font-weight: 900; line-height: 1.1; margin-bottom: 16px; }
  .hero-sub { font-size: 18px; color: #8a7e72; font-style: italic; max-width: 560px; margin: 0 auto; line-height: 1.65; }

  .main { max-width: 560px; margin: 0 auto; padding: 48px 24px 64px; }

  .list-options { margin-bottom: 32px; }
  .list-label { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #8a7e72; display: block; margin-bottom: 14px; }
  .list-option { display: flex; align-items: flex-start; gap: 14px; padding: 14px 16px; border: 1px solid #e8e4de; border-radius: 3px; margin-bottom: 8px; cursor: pointer; transition: border-color 0.15s, background 0.15s; background: #fff; }
  .list-option:has(input:checked) { border-color: #1a1614; background: #faf9f7; }
  .list-option input[type=checkbox] { margin-top: 3px; width: 16px; height: 16px; flex-shrink: 0; accent-color: #1a1614; cursor: pointer; }
  .list-option-text { flex: 1; }
  .list-option-name { font-size: 16px; font-weight: 600; color: #1a1614; display: block; margin-bottom: 2px; }
  .list-option-desc { font-size: 14px; color: #8a7e72; font-style: italic; }

  .fg { margin-bottom: 20px; }
  label.field-label { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #8a7e72; display: block; margin-bottom: 6px; }
  .req { color: #c84040; }
  input[type=text], input[type=email] { width: 100%; padding: 12px 16px; border: 1px solid #e8e4de; border-radius: 3px; font-family: 'Crimson Pro', serif; font-size: 17px; color: #1a1614; background: #fff; outline: none; transition: border-color 0.15s; }
  input:focus { border-color: #1a1614; }
  input::placeholder { color: #c0b8b0; }

  .submit-btn { width: 100%; padding: 16px; background: #1a1614; color: #faf9f7; border: none; border-radius: 3px; font-family: 'Playfair Display', serif; font-size: 17px; font-weight: 700; cursor: pointer; transition: opacity 0.15s; margin-top: 8px; }
  .submit-btn:hover { opacity: 0.85; }
  .submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .note { font-size: 13px; color: #aaa; text-align: center; margin-top: 14px; font-style: italic; }

  .success-card { background: #fff; border: 1px solid #e8e4de; border-radius: 4px; padding: 40px 32px; text-align: center; }
  .success-icon { font-size: 32px; margin-bottom: 16px; }
  .success-title { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 700; margin-bottom: 10px; }
  .success-sub { font-size: 16px; color: #8a7e72; font-style: italic; line-height: 1.65; }
  .success-address { margin-top: 24px; font-size: 13px; color: #bbb; }

  .err-msg { background: #fce8e8; border: 1px solid #e8c0c0; color: #c04040; padding: 12px 16px; border-radius: 3px; font-size: 14px; margin-bottom: 16px; display: none; }
  .err-msg.show { display: block; }

  .duplicate-card { background: #faf9f7; border: 1px solid #e8e4de; border-radius: 4px; padding: 32px; text-align: center; }
  .duplicate-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 700; margin-bottom: 8px; }
  .duplicate-sub { font-size: 16px; color: #8a7e72; font-style: italic; }

  .footer { background: #1a1614; color: #555; text-align: center; padding: 32px; font-size: 14px; font-style: italic; margin-top: 40px; }
  .footer strong { color: #8a7e72; font-style: normal; }

  @media (max-width: 600px) {
    .hero { padding: 40px 20px 36px; }
    .main { padding: 32px 20px 48px; }
  }
</style>
</head>
<body>

<header class="site-header">
  <a href="https://theartyst.co.uk" class="site-name">The Artyst</a>
</header>

<div class="hero">
  <div class="hero-eyebrow">54–56 Chesterton Road · Cambridge</div>
  <h1 class="hero-title">Stay in touch.</h1>
  <p class="hero-sub">Cambridge's only Syd Barrett heritage venue. Events, talks, tours, and the occasional dispatch from the Invysible College.</p>
</div>

<div class="main">

  ${status === 'success' ? `
  <div class="success-card">
    <div class="success-icon">✓</div>
    <div class="success-title">You're on the list.</div>
    <p class="success-sub">Thank you — we'll be in touch with things worth reading.</p>
    <p class="success-address">The Artyst · 54–56 Chesterton Road · Cambridge CB4 1EN</p>
  </div>
  ` : status === 'duplicate' ? `
  <div class="duplicate-card">
    <div class="duplicate-title">You're already signed up.</div>
    <p class="duplicate-sub">We already have you on our list — we'll be in touch.</p>
  </div>
  ` : `

  <div class="err-msg" id="err-msg">Something went wrong — please try again.</div>

  <form id="signup-form" method="POST" action="/join">

    <div class="list-options">
      <span class="list-label">What would you like to hear about? <span class="req">*</span></span>

      <label class="list-option">
        <input type="checkbox" name="lists" value="artyst" checked>
        <span class="list-option-text">
          <span class="list-option-name">The Artyst</span>
          <span class="list-option-desc">Events, wine tastings, live music, cultural nights, venue news</span>
        </span>
      </label>

      <label class="list-option">
        <input type="checkbox" name="lists" value="tours">
        <span class="list-option-text">
          <span class="list-option-name">Alcademy Tours</span>
          <span class="list-option-desc">Syd Barrett's Cambridge, Wittgenstein & Friends, new tours as they launch</span>
        </span>
      </label>

      <label class="list-option">
        <input type="checkbox" name="lists" value="ic">
        <span class="list-option-text">
          <span class="list-option-name">Invysible College</span>
          <span class="list-option-desc">Always Open - Open to All : Courses, Faculties, BedeGame developments</span>
        </span>
      </label>
    </div>

    <div class="fg">
      <label class="field-label" for="name">Your name <span class="req">*</span></label>
      <input type="text" id="name" name="name" required placeholder="Your name" autocomplete="name">
    </div>

    <div class="fg">
      <label class="field-label" for="email">Email address <span class="req">*</span></label>
      <input type="email" id="email" name="email" required placeholder="your@email.com" autocomplete="email">
    </div>

    <button type="submit" class="submit-btn" id="submit-btn">Sign me up →</button>
    <p class="note">No spam. Unsubscribe any time.</p>

  </form>

  <script>
    document.getElementById('signup-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      const errEl = document.getElementById('err-msg');
      btn.disabled = true;
      btn.textContent = 'Signing up…';
      errEl.classList.remove('show');

      const lists = Array.from(document.querySelectorAll('input[name=lists]:checked')).map(el => el.value);
      if (!lists.length) {
        errEl.textContent = 'Please select at least one list.';
        errEl.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Sign me up →';
        return;
      }

      try {
        const res = await fetch('/api/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:  document.getElementById('name').value,
            email: document.getElementById('email').value,
            lists,
          })
        });
        const data = await res.json();
        if (data.duplicate) { window.location.href = '/join?status=duplicate'; return; }
        if (!res.ok) throw new Error();
        window.location.href = '/join?status=success';
      } catch {
        errEl.textContent = 'Something went wrong — please try again.';
        errEl.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Sign me up →';
      }
    });
  </script>
  `}

</div>

<footer class="footer">
  <strong>The Artyst</strong> &nbsp;·&nbsp; 54–56 Chesterton Road &nbsp;·&nbsp; Cambridge CB4 1EN
</footer>

</body>
</html>`;
}

// ── POST — handle form submission ─────────────────────────────────────────
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { name, email, lists = [] } = req.body ?? {};

  if (!name?.trim() || !email?.trim() || !lists.length) {
    return res.status(400).json({ error: 'name, email and at least one list are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName  = name.trim();

  // ── Fetch group IDs for selected list keys ────────────────────────────
  const groupNames = [...new Set((lists as string[]).map(l => LIST_SLUGS[l]).filter(Boolean))];

  const { data: groups } = await supabase
    .from('distribution_groups')
    .select('id, name')
    .in('name', groupNames);

  if (!groups?.length) {
    return res.status(500).json({ error: 'Could not find groups' });
  }

  // ── Check for duplicate per group ─────────────────────────────────────
  const groupIds = groups.map(g => g.id);
  const { data: existing } = await supabase
    .from('group_members')
    .select('id')
    .eq('email', cleanEmail)
    .in('group_id', groupIds)
    .limit(1);

  if (existing?.length) {
    return res.status(200).json({ duplicate: true });
  }

  // ── Insert one row per group ──────────────────────────────────────────
  const rows = groupIds.map(group_id => ({
    group_id,
    name:  cleanName,
    email: cleanEmail,
  }));

  const { error } = await supabase.from('group_members').insert(rows);
  if (error) {
    console.error('Insert error:', error.message);
    return res.status(500).json({ error: 'Failed to save signup' });
  }

  // ── Send welcome email ────────────────────────────────────────────────
  try {
    await resend.emails.send({
      from:    'The Artyst <hello@theartyst.co.uk>',
      to:      cleanEmail,
      replyTo: 'hello@theartyst.co.uk',
      subject: 'Welcome — you\'re on the list',
      html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="font-family:Georgia,serif;background:#faf9f7;padding:40px 20px;color:#1a1614;">
<table width="600" style="max-width:600px;margin:0 auto;">
  <tr><td style="background:#1a1614;padding:24px 32px;">
    <p style="margin:0;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#c8a96e;font-family:sans-serif;">The Artyst · Cambridge</p>
  </td></tr>
  <tr><td style="background:#fff;padding:32px;border:1px solid #e8e4de;border-top:none;">
    <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:26px;margin:0 0 16px;color:#1a1614;">You're on the list, ${cleanName.split(' ')[0]}.</h1>
    <p style="font-size:16px;line-height:1.75;color:#3a3028;margin:0 0 16px;">Thank you for signing up. We'll be in touch with things worth reading — events, tours, news from the Invysible College, and occasional dispatches from Cambridge's only Syd Barrett heritage venue.</p>
    <p style="font-size:16px;line-height:1.75;color:#3a3028;margin:0;">Come in and say hello.</p>
  </td></tr>
  <tr><td style="padding:20px 32px 0;text-align:center;">
    <p style="font-size:12px;color:#bbb;font-family:sans-serif;">The Artyst · 54–56 Chesterton Road · Cambridge CB4 1EN</p>
    <p style="font-size:11px;color:#ccc;font-family:sans-serif;margin-top:6px;">You signed up at go.theartyst.co.uk/join</p>
  </td></tr>
</table>
</body></html>`
    });
  } catch (e) {
    console.error('Welcome email failed:', e);
    // Non-fatal
  }

  return res.status(200).json({ success: true });
}

// ── Router ────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', req.method === 'GET' ? 'text/html; charset=utf-8' : 'application/json');

  if (req.method === 'GET') {
    const status = req.query.status as string | undefined;
    const validStatus = status === 'success' || status === 'error' || status === 'duplicate'
      ? status : undefined;
    return res.status(200).send(renderPage(validStatus));
  }

  if (req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    return handlePost(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
