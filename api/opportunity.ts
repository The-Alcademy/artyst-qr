// ─────────────────────────────────────────────────────────────────
// api/opportunity.ts
//
// Public HTML page at /opportunity/[slug] (via vercel.json rewrite).
// Renders the opportunity as a branded job listing with apply form.
//
// Replaces the previous version of this file that mistakenly returned
// the JSON list of all opportunities.
// ─────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const CANONICAL_HOST    = "https://go.theartyst.co.uk";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Helpers ─────────────────────────────────────────────────────
function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Tiny markdown renderer — handles headings, bullets, bold, italic, paragraphs.
// Deliberately minimal; the content is admin-controlled, not user-supplied.
function renderMarkdown(md: string): string {
  if (!md) return "";

  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inUL = false;
  let paraBuffer: string[] = [];

  const flushPara = () => {
    if (paraBuffer.length) {
      const text = paraBuffer.join(" ").trim();
      if (text) out.push(`<p>${inline(text)}</p>`);
      paraBuffer = [];
    }
  };
  const closeUL = () => {
    if (inUL) {
      out.push("</ul>");
      inUL = false;
    }
  };
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,     "<em>$1</em>")
      .replace(/`([^`]+)`/g,     "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" rel="noopener">$1</a>');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      closeUL();
      continue;
    }
    const h = /^(#{1,4})\s+(.+)$/.exec(line);
    if (h) {
      flushPara();
      closeUL();
      const lvl = Math.min(6, h[1].length + 1); // ## becomes h3 to keep h1 for the page
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      if (!inUL) { out.push("<ul>"); inUL = true; }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    closeUL();
    paraBuffer.push(line);
  }
  flushPara();
  closeUL();
  return out.join("\n");
}

// Strip the "## Poster Line\n…" tail so it doesn't appear in the public page.
// (Tracked as a Phase 1.5 fix to do this in CA-025 at write time instead.)
function stripPosterLine(md: string): string {
  if (!md) return "";
  const idx = md.search(/\n#{1,6}\s+poster\s+line\b/i);
  return idx >= 0 ? md.slice(0, idx).trimEnd() : md;
}

function deriveExcerpt(row: any): string {
  const e = (row.embed_excerpt || "").trim();
  if (e) return e;
  const desc = stripPosterLine(row.description || "").trim();
  if (!desc) return "";
  const plain = desc
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
  return plain.length > 200 ? plain.slice(0, 197) + "…" : plain;
}

// ─── 404 page ────────────────────────────────────────────────────
function render404(slug: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Opportunity not found · The Artyst</title>
  <meta name="robots" content="noindex" />
  <style>${baseCSS()}</style>
</head>
<body>
  <main class="page">
    <header class="masthead">
      <a href="https://theartyst.co.uk" class="brand">THE ARTYST</a>
    </header>
    <section class="not-found">
      <h1>Not found</h1>
      <p>The opportunity <code>${esc(slug)}</code> doesn't exist or has been withdrawn.</p>
      <p><a href="https://theartyst.co.uk">Visit The Artyst →</a></p>
    </section>
  </main>
</body>
</html>`;
}

// ─── Page CSS ────────────────────────────────────────────────────
function baseCSS(): string {
  return `
    :root {
      --bg:        #faf9f7;
      --paper:     #ffffff;
      --ink:       #1a1614;
      --ink-soft:  #5a4f48;
      --ink-faint: #8a7e72;
      --line:      #e8e4de;
      --accent:    #9a3a26;
      --accent-soft: #fbf0ec;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 17px/1.65 Georgia, "Times New Roman", serif;
      -webkit-font-smoothing: antialiased;
    }
    .page { max-width: 720px; margin: 0 auto; padding: 32px 24px 80px; }
    .masthead { padding: 6px 0 28px; border-bottom: 1px solid var(--line); margin-bottom: 36px; }
    .brand {
      font-size: 13px; letter-spacing: 0.28em; text-transform: uppercase;
      text-decoration: none; color: var(--ink); font-weight: 600;
    }
    .property-tag {
      display: inline-block; font-size: 11px; letter-spacing: 0.22em;
      text-transform: uppercase; color: var(--ink-faint); margin-bottom: 10px;
    }
    h1 {
      font-family: "Playfair Display", Georgia, serif;
      font-size: 38px; line-height: 1.15; margin: 0 0 18px; font-weight: 600;
    }
    h2, h3, h4 {
      font-family: "Playfair Display", Georgia, serif;
      font-weight: 600; line-height: 1.25; margin: 32px 0 12px;
    }
    h3 { font-size: 22px; }
    h4 { font-size: 18px; }
    p, li { color: var(--ink-soft); }
    p { margin: 0 0 14px; }
    ul { padding-left: 20px; margin: 0 0 16px; }
    li { margin-bottom: 6px; }
    a { color: var(--accent); }
    code { font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; background: var(--accent-soft); padding: 1px 5px; border-radius: 3px; color: var(--ink); }
    .meta-row {
      display: flex; flex-wrap: wrap; gap: 18px 24px;
      padding: 16px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
      margin: 8px 0 32px; font-size: 14px;
    }
    .meta-item { display: flex; flex-direction: column; gap: 2px; }
    .meta-label { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-faint); }
    .meta-value { color: var(--ink); }
    .closed-banner {
      background: var(--accent-soft); border-left: 3px solid var(--accent);
      padding: 14px 18px; margin: 0 0 28px; font-size: 15px; color: var(--ink);
    }
    .body { margin-bottom: 56px; }
    .body h3 { margin-top: 28px; }
    .body p { color: var(--ink); }

    .apply-card {
      background: var(--paper); border: 1px solid var(--line);
      border-radius: 4px; padding: 32px 28px; margin-top: 24px;
    }
    .apply-card h2 { margin-top: 0; }
    .field { margin-bottom: 18px; }
    .field label {
      display: block; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--ink-faint); margin-bottom: 6px;
    }
    .field input, .field textarea {
      width: 100%; font: inherit; font-size: 16px;
      padding: 10px 12px; border: 1px solid var(--line); background: #fff;
      border-radius: 3px; color: var(--ink);
    }
    .field input:focus, .field textarea:focus {
      outline: 0; border-color: var(--accent);
    }
    .field textarea { min-height: 140px; resize: vertical; }
    .field-help { font-size: 12px; color: var(--ink-faint); margin-top: 4px; }
    .submit {
      background: var(--ink); color: #fff; border: 0; padding: 12px 24px;
      font: inherit; font-size: 15px; letter-spacing: 0.06em;
      border-radius: 3px; cursor: pointer; margin-top: 8px;
    }
    .submit:hover { background: var(--accent); }
    .submit:disabled { opacity: 0.55; cursor: not-allowed; }
    .form-status { margin-top: 14px; padding: 10px 14px; border-radius: 3px; font-size: 14px; }
    .form-status.is-success { background: #eef7ee; color: #1d5b1d; border: 1px solid #c6e2c6; }
    .form-status.is-error   { background: #fbecec; color: #8a1f1f; border: 1px solid #e8c2c2; }

    .footer {
      margin-top: 56px; padding-top: 22px; border-top: 1px solid var(--line);
      font-size: 13px; color: var(--ink-faint); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
    }
    .footer a { color: var(--ink-faint); text-decoration: none; }
    .footer a:hover { color: var(--accent); }
    .not-found { text-align: center; padding: 80px 0; }
    .not-found h1 { font-size: 32px; }
  `;
}

// ─── Main render ─────────────────────────────────────────────────
function renderPage(opp: any): string {
  const title       = opp.title || opp.slug;
  const property    = opp.property || "The Artyst";
  const isClosed    = opp.status === "closed";
  const cleanedDesc = stripPosterLine(opp.description || "");
  const bodyHtml    = renderMarkdown(cleanedDesc);
  const excerpt     = deriveExcerpt(opp);
  const ogImage     = opp.og_image_url || "";
  const canonical   = `${CANONICAL_HOST}/opportunity/${opp.slug}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} · ${esc(property)}</title>
  <meta name="description" content="${esc(excerpt)}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${esc(canonical)}" />
  <meta property="og:title"       content="${esc(title)} · ${esc(property)}" />
  <meta property="og:description" content="${esc(excerpt)}" />
  ${ogImage ? `<meta property="og:image" content="${esc(ogImage)}" />` : ""}
  <meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&display=swap" />
  <style>${baseCSS()}</style>
</head>
<body>
  <main class="page">

    <header class="masthead">
      <a href="https://theartyst.co.uk" class="brand">${esc(property.toUpperCase())}</a>
    </header>

    <span class="property-tag">${esc(property)} · ${esc(opp.employment_type || "Opportunity")}</span>
    <h1>${esc(title)}</h1>

    ${isClosed ? `<div class="closed-banner"><strong>This role is now closed.</strong> Thank you for your interest. The page is preserved for reference; new opportunities are listed at <a href="https://theartyst.co.uk">theartyst.co.uk</a>.</div>` : ""}

    <div class="meta-row">
      ${opp.employment_type ? `<div class="meta-item"><span class="meta-label">Type</span><span class="meta-value">${esc(opp.employment_type)}</span></div>` : ""}
      ${opp.hours          ? `<div class="meta-item"><span class="meta-label">Hours</span><span class="meta-value">${esc(opp.hours)}</span></div>` : ""}
      ${opp.pay            ? `<div class="meta-item"><span class="meta-label">Compensation</span><span class="meta-value">${esc(opp.pay)}</span></div>` : ""}
      <div class="meta-item"><span class="meta-label">Location</span><span class="meta-value">${esc(property)}, Cambridge</span></div>
    </div>

    <article class="body">
      ${bodyHtml}
    </article>

    ${isClosed ? "" : `
    <section class="apply-card" id="apply">
      <h2>Apply</h2>
      <p>Send us your details and we'll be in touch. CV optional — but a short note about why this role appeals to you matters more.</p>
      <form id="apply-form" novalidate>
        <div class="field">
          <label for="apply-name">Your name</label>
          <input type="text" id="apply-name" name="name" required autocomplete="name" />
        </div>
        <div class="field">
          <label for="apply-email">Email</label>
          <input type="email" id="apply-email" name="email" required autocomplete="email" />
        </div>
        <div class="field">
          <label for="apply-phone">Phone (optional)</label>
          <input type="tel" id="apply-phone" name="phone" autocomplete="tel" />
        </div>
        <div class="field">
          <label for="apply-message">Why this role?</label>
          <textarea id="apply-message" name="message" required placeholder="A few sentences is plenty."></textarea>
        </div>
        <div class="field">
          <label for="apply-cv">CV (optional)</label>
          <input type="file" id="apply-cv" name="cv" accept=".pdf,.doc,.docx,.txt,.rtf" />
          <div class="field-help">PDF, Word, or plain text. Max ~5MB.</div>
        </div>
        <button type="submit" class="submit" id="apply-submit">Send application</button>
        <div class="form-status" id="apply-status" hidden></div>
      </form>
    </section>
    `}

    <footer class="footer">
      <span>Posted ${new Date(opp.created_at).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}</span>
      <a href="${esc(CANONICAL_HOST)}/api/opportunities/${esc(opp.slug)}">JSON</a>
    </footer>

  </main>

  <script>
    (function () {
      const form    = document.getElementById("apply-form");
      if (!form) return;
      const status  = document.getElementById("apply-status");
      const submit  = document.getElementById("apply-submit");

      function show(msg, kind) {
        status.hidden = false;
        status.className = "form-status is-" + kind;
        status.textContent = msg;
      }

      async function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = () => {
            const result = reader.result || "";
            const comma  = String(result).indexOf(",");
            resolve(comma >= 0 ? String(result).slice(comma + 1) : "");
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
      }

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        status.hidden = true;
        submit.disabled = true;
        submit.textContent = "Sending…";

        const data = {
          opportunitySlug: ${JSON.stringify(opp.slug)},
          opportunityId:   ${JSON.stringify(opp.id || null)},
          name:    document.getElementById("apply-name").value.trim(),
          email:   document.getElementById("apply-email").value.trim(),
          phone:   document.getElementById("apply-phone").value.trim(),
          message: document.getElementById("apply-message").value.trim(),
        };

        if (!data.name || !data.email || !data.message) {
          show("Please fill in your name, email, and a short note.", "error");
          submit.disabled = false;
          submit.textContent = "Send application";
          return;
        }

        const cvInput = document.getElementById("apply-cv");
        const file = cvInput && cvInput.files && cvInput.files[0];
        if (file) {
          if (file.size > 5 * 1024 * 1024) {
            show("CV is too large — please keep it under 5MB.", "error");
            submit.disabled = false;
            submit.textContent = "Send application";
            return;
          }
          try {
            data.cv = {
              data:     await readFileAsBase64(file),
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
            };
          } catch (err) {
            show("Couldn't read your CV file. Please try again or send without it.", "error");
            submit.disabled = false;
            submit.textContent = "Send application";
            return;
          }
        }

        try {
          const res = await fetch("/api/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || ("HTTP " + res.status));
          }
          form.reset();
          show("Thanks — your application has been received. We'll be in touch.", "success");
          submit.textContent = "Sent ✓";
        } catch (err) {
          show("Couldn't send: " + (err.message || err) + ". Email jobs@theartyst.co.uk directly if this persists.", "error");
          submit.disabled = false;
          submit.textContent = "Send application";
        }
      });
    })();
  </script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  const slug = String(req.query.slug || "").trim();
  if (!slug) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(400).send(render404(""));
    return;
  }

  // Match the JSON API's visibility floor: must be active, must not be share_disabled.
  // Closed opportunities ARE rendered (with a banner) so direct links keep working.
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .eq("share_disabled", false)
    .maybeSingle();

  if (error) {
    console.error("opportunity page fetch error:", error);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(500).send(render404(slug));
    return;
  }

  if (!data) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(404).send(render404(slug));
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.status(200).send(renderPage(data));
}
