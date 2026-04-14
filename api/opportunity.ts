import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

interface Opportunity {
  id: string;
  slug: string;
  title: string;
  property: string;
  employment_type: string | null;
  hours: string | null;
  pay: string | null;
  description: string | null;
  apply_email: string;
  status: 'open' | 'filled' | 'suspended';
}

// Parse the Claude-generated JD markdown into HTML.
// Skips the ## Poster Line section — that's poster-only.
function parseJD(text: string): string {
  const lines = text.split('\n');
  let html = '';
  let inList = false;
  let inSection = false;
  let skipSection = false;

  for (const line of lines) {
    const t = line.trim();

    if (t.startsWith('## ')) {
      if (inList)    { html += '</ul>'; inList = false; }
      if (inSection) { html += '</div>'; inSection = false; }

      const title = t.replace(/^##\s*/, '');
      skipSection = title.toLowerCase().includes('poster');

      if (!skipSection) {
        html += `<div class="jd-section"><h3 class="jd-h">${title}</h3>`;
        inSection = true;
      }
      continue;
    }

    if (skipSection || !t) {
      if (!t && inList) { html += '</ul>'; inList = false; }
      continue;
    }

    if (t.startsWith('- ')) {
      if (!inList) { html += '<ul class="jd-list">'; inList = true; }
      html += `<li>${t.replace(/^-\s*/, '')}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p class="jd-p">${t}</p>`;
    }
  }

  if (inList)    html += '</ul>';
  if (inSection) html += '</div>';
  return html;
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Page states ────────────────────────────────────────────────────────────

function renderPage(opp: Opportunity): string {
  const metaItems: { label: string; value: string }[] = [];
  if (opp.employment_type) metaItems.push({ label: 'Type',     value: opp.employment_type });
  if (opp.hours)           metaItems.push({ label: 'Hours',    value: opp.hours });
  if (opp.pay)             metaItems.push({ label: 'Pay',      value: opp.pay });
  metaItems.push({ label: 'Location', value: 'Cambridge' });

  const jdHtml   = opp.description ? parseJD(opp.description) : '';
  const metaHtml = metaItems.map(m =>
    `<div class="meta-item"><span class="meta-label">${esc(m.label)}</span><span class="meta-value">${esc(m.value)}</span></div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(opp.title)} — ${esc(opp.property)}</title>
<meta name="description" content="Apply for ${esc(opp.title)} at ${esc(opp.property)}, Cambridge.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #faf9f7; color: #1a1614; font-family: 'Crimson Pro', Georgia, serif; font-size: 18px; line-height: 1.7; }

  /* Header */
  .site-header { background: #fff; border-bottom: 1px solid #e8e4de; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; }
  .site-name { font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 700; color: #1a1614; text-decoration: none; }
  .breadcrumb { font-size: 11px; color: #8a7e72; letter-spacing: 0.2em; text-transform: uppercase; }

  /* Hero */
  .hero { background: #fff; border-bottom: 1px solid #e8e4de; padding: 48px 32px 40px; }
  .inner { max-width: 760px; margin: 0 auto; }
  .property-name { font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: #8a7e72; margin-bottom: 10px; }
  .job-title { font-family: 'Playfair Display', serif; font-size: clamp(30px, 5vw, 52px); font-weight: 900; line-height: 1.1; color: #1a1614; margin-bottom: 24px; }
  .meta-strip { display: flex; flex-wrap: wrap; border: 1px solid #e8e4de; border-radius: 3px; overflow: hidden; }
  .meta-item { flex: 1; min-width: 110px; padding: 10px 16px; border-right: 1px solid #e8e4de; background: #faf9f7; }
  .meta-item:last-child { border-right: none; }
  .meta-label { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #8a7e72; display: block; margin-bottom: 2px; }
  .meta-value { font-size: 15px; font-weight: 600; color: #1a1614; }

  /* JD */
  .jd-body { padding: 40px 0; border-bottom: 1px solid #e8e4de; }
  .jd-section { margin-bottom: 28px; }
  .jd-h { font-size: 11px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: #8a7e72; margin-bottom: 10px; }
  .jd-p { margin-bottom: 10px; color: #3a3028; }
  .jd-list { list-style: none; padding: 0; }
  .jd-list li { padding-left: 22px; position: relative; color: #3a3028; margin-bottom: 6px; }
  .jd-list li::before { content: '—'; position: absolute; left: 0; color: #8a7e72; }

  /* Application form */
  .apply-section { padding: 48px 0 64px; }
  .apply-title { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; margin-bottom: 6px; }
  .apply-sub { font-size: 16px; color: #8a7e72; font-style: italic; margin-bottom: 32px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .fg { display: flex; flex-direction: column; gap: 6px; }
  .fg-full { grid-column: 1 / -1; }
  label { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #8a7e72; }
  .req { color: #c84040; }
  input, textarea { width: 100%; padding: 12px 16px; border: 1px solid #e8e4de; border-radius: 3px; font-family: 'Crimson Pro', serif; font-size: 17px; color: #1a1614; background: #fff; outline: none; transition: border-color 0.15s; }
  input:focus, textarea:focus { border-color: #8a7e72; }
  input[type="file"] { padding: 10px 16px; cursor: pointer; background: #faf9f7; font-size: 14px; }
  textarea { resize: vertical; min-height: 120px; }
  .submit-btn { width: 100%; padding: 16px; background: #1a1614; color: #faf9f7; border: none; border-radius: 3px; font-family: 'Playfair Display', serif; font-size: 17px; font-weight: 700; cursor: pointer; letter-spacing: 0.04em; transition: opacity 0.15s; }
  .submit-btn:hover { opacity: 0.85; }
  .submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .form-note { font-size: 13px; color: #8a7e72; font-style: italic; text-align: center; margin-top: 10px; }
  .success-msg { display: none; background: #f4f8f4; border: 1px solid #c8dcc8; border-radius: 3px; padding: 32px; text-align: center; }
  .success-msg h3 { font-family: 'Playfair Display', serif; font-size: 24px; margin-bottom: 8px; }
  .err-msg { font-size: 14px; color: #c84040; margin-top: 8px; display: none; }
  .err-msg a { color: #c84040; }

  /* Footer */
  .site-footer { background: #1a1614; color: #8a7e72; text-align: center; padding: 32px; font-size: 15px; font-style: italic; }
  .site-footer strong { color: #ede8df; font-style: normal; }

  @media (max-width: 600px) {
    .form-grid { grid-template-columns: 1fr; }
    .fg-full { grid-column: 1; }
    .hero, .inner { padding-left: 20px; padding-right: 20px; }
    .site-header { padding: 14px 20px; }
  }
</style>
</head>
<body>

<header class="site-header">
  <a href="https://theartyst.co.uk" class="site-name">The Artyst</a>
  <span class="breadcrumb">Opportunities</span>
</header>

<div class="hero">
  <div class="inner">
    <div class="property-name">${esc(opp.property)}</div>
    <h1 class="job-title">${esc(opp.title)}</h1>
    <div class="meta-strip">${metaHtml}</div>
  </div>
</div>

<div class="inner" style="padding: 0 32px;">

  <div class="jd-body">${jdHtml}</div>

  <div class="apply-section">
    <h2 class="apply-title">Apply for this role</h2>
    <p class="apply-sub">Fill in the form below and we'll be in touch.</p>

    <div id="success-msg" class="success-msg">
      <h3>Application received.</h3>
      <p>Thank you for applying for <strong>${esc(opp.title)}</strong>. We'll be in touch soon.</p>
    </div>

    <form id="apply-form">
      <div class="form-grid">
        <div class="fg">
          <label>Full name <span class="req">*</span></label>
          <input type="text" id="a-name" required placeholder="Your name">
        </div>
        <div class="fg">
          <label>Email address <span class="req">*</span></label>
          <input type="email" id="a-email" required placeholder="your@email.com">
        </div>
        <div class="fg fg-full">
          <label>Phone number</label>
          <input type="tel" id="a-phone" placeholder="+44 7700 000000">
        </div>
        <div class="fg fg-full">
          <label>Why are you interested in this role? <span class="req">*</span></label>
          <textarea id="a-message" required placeholder="Tell us a little about yourself and why this role appeals to you."></textarea>
        </div>
        <div class="fg fg-full">
          <label>Attach CV <span style="letter-spacing:0;text-transform:none;font-style:italic;font-size:12px;">(PDF or Word, max 5MB — optional)</span></label>
          <input type="file" id="a-cv" accept=".pdf,.doc,.docx">
        </div>
        <div class="fg fg-full" style="margin-top:8px;">
          <button type="submit" class="submit-btn" id="submit-btn">Send application →</button>
          <div class="err-msg" id="err-msg">Something went wrong — please try again or email <a href="mailto:${esc(opp.apply_email)}">${esc(opp.apply_email)}</a>.</div>
          <p class="form-note">Applications go to ${esc(opp.apply_email)}</p>
        </div>
      </div>
    </form>
  </div>

</div>

<footer class="site-footer">
  <p>Or come in and talk to us.</p>
  <p style="margin-top:6px;"><strong>The Artyst</strong> &nbsp;·&nbsp; 54–56 Chesterton Road &nbsp;·&nbsp; Cambridge CB4 1EN</p>
</footer>

<script>
  const OPP_SLUG = '${esc(opp.slug)}';
  const OPP_ID   = '${esc(opp.id)}';

  document.getElementById('apply-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn    = document.getElementById('submit-btn');
    const errEl  = document.getElementById('err-msg');
    const succEl = document.getElementById('success-msg');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    errEl.style.display = 'none';

    const cvFile = document.getElementById('a-cv').files[0];
    let cvData = null;

    if (cvFile) {
      if (cvFile.size > 5 * 1024 * 1024) {
        errEl.textContent = 'CV file must be under 5MB.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Send application →';
        return;
      }
      cvData = await new Promise(resolve => {
        const r = new FileReader();
        r.onload = () => resolve({ filename: cvFile.name, mimeType: cvFile.type, data: r.result.split(',')[1] });
        r.readAsDataURL(cvFile);
      });
    }

    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunitySlug: OPP_SLUG,
          opportunityId:   OPP_ID,
          name:    document.getElementById('a-name').value,
          email:   document.getElementById('a-email').value,
          phone:   document.getElementById('a-phone').value,
          message: document.getElementById('a-message').value,
          cv: cvData
        })
      });
      if (!res.ok) throw new Error();
      document.getElementById('apply-form').style.display = 'none';
      succEl.style.display = 'block';
      succEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Send application →';
    }
  });
</script>

</body>
</html>`;
}

function renderFilled(opp: Opportunity): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(opp.title)} — Position Filled — The Artyst</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Crimson+Pro:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
<style>
  body { font-family:'Crimson Pro',serif; background:#faf9f7; color:#1a1614; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:32px; text-align:center; }
  .card { max-width:480px; }
  .eyebrow { font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:#8a7e72; margin-bottom:16px; }
  h1 { font-family:'Playfair Display',serif; font-size:32px; margin-bottom:12px; }
  p { font-size:18px; color:#8a7e72; font-style:italic; line-height:1.6; }
  a { color:#1a1614; }
</style>
</head>
<body>
<div class="card">
  <p class="eyebrow">The Artyst &nbsp;·&nbsp; Opportunities</p>
  <h1>This position has been filled.</h1>
  <p>${esc(opp.title)} is no longer accepting applications.</p>
  <p style="margin-top:20px;">Visit <a href="https://theartyst.co.uk">theartyst.co.uk</a> for other opportunities,<br>or come in and talk to us at 54–56 Chesterton Road, Cambridge.</p>
</div>
</body>
</html>`;
}

function renderNotFound(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Not Found — The Artyst</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Crimson+Pro:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
<style>
  body { font-family:'Crimson Pro',serif; background:#faf9f7; color:#1a1614; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:32px; text-align:center; }
  .card { max-width:480px; }
  .eyebrow { font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:#8a7e72; margin-bottom:16px; }
  h1 { font-family:'Playfair Display',serif; font-size:32px; margin-bottom:12px; }
  p { font-size:18px; color:#8a7e72; font-style:italic; }
  a { color:#1a1614; }
</style>
</head>
<body>
<div class="card">
  <p class="eyebrow">The Artyst &nbsp;·&nbsp; Opportunities</p>
  <h1>Opportunity not found.</h1>
  <p>This link may have expired or been removed.<br>Visit <a href="https://theartyst.co.uk">theartyst.co.uk</a> for current opportunities.</p>
</div>
</body>
</html>`;
}

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = req.url?.split('/opportunity/')[1]?.split('?')[0];
  if (!slug) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(renderNotFound());
  }

  const { data: opp, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (error || !opp) return res.status(404).send(renderNotFound());
  if (opp.status === 'filled' || opp.status === 'suspended') return res.status(200).send(renderFilled(opp));

  return res.status(200).send(renderPage(opp));
}
