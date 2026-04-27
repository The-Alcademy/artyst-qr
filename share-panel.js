// ─────────────────────────────────────────────────────────────────
// share-panel.js
//
// CA-022 Sharing & Embedding extension — Phase 1 admin component.
//
// Drop this script tag into admin.html ONCE:
//   <script src="/share-panel.js"></script>
//
// Set the admin secret ONCE (used by the visibility toggle):
//   <script>
//     window.SHARE_PANEL_CONFIG = { adminSecret: '<your CA022_SECRET>' };
//   </script>
//
// Mount a panel for a given opportunity wherever you want it to render:
//   SharePanel.mount(targetElement, opportunityRow);
//
// `opportunityRow` is the row from your Supabase opportunities table —
// at minimum it must have { slug, share_disabled }. Optional but useful:
// title, embed_excerpt, description, og_image_url. The panel constructs
// canonical URLs from the slug, so a partial row is fine.
// ─────────────────────────────────────────────────────────────────

(function () {
  const CANONICAL_HOST = "https://go.theartyst.co.uk";

  // ─── One-time CSS injection ─────────────────────────────────────
  const STYLE_ID = "cs-share-panel-styles";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .cs-share-panel {
        --cs-bg:        var(--bg-raised, #ffffff);
        --cs-bg-soft:   var(--bg-soft, #f7f7f4);
        --cs-border:    var(--border, #e1e1dc);
        --cs-text:      var(--text-1, #1a1a1a);
        --cs-text-dim:  var(--text-2, #6b6b6b);
        --cs-accent:    var(--accent, #9a6e1a);
        --cs-success:   #2f8f4f;
        --cs-danger:    #b3261e;
        font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: var(--cs-text);
        background: var(--cs-bg);
        border: 1px solid var(--cs-border);
        border-radius: 10px;
        padding: 18px 18px 14px;
        margin: 18px 0;
      }
      .cs-share-panel * { box-sizing: border-box; }
      .cs-share-header { margin-bottom: 14px; }
      .cs-share-title {
        font-size: 13px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.08em;
        color: var(--cs-text-dim);
        margin: 0 0 4px;
      }
      .cs-share-sub {
        font-size: 13px; color: var(--cs-text-dim); margin: 0;
      }
      .cs-card {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px; margin-top: 8px;
        background: var(--cs-bg-soft);
        border: 1px solid var(--cs-border);
        border-radius: 8px;
      }
      .cs-card-label {
        flex: 0 0 110px;
        font-size: 12px; font-weight: 600;
        color: var(--cs-text-dim);
      }
      .cs-card-url {
        flex: 1 1 auto;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 12.5px;
        color: var(--cs-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        background: transparent;
        border: 0;
        padding: 0;
      }
      .cs-card-actions { display: flex; gap: 6px; flex: 0 0 auto; }
      .cs-btn {
        font: inherit; font-size: 12px; font-weight: 500;
        padding: 5px 10px;
        background: var(--cs-bg);
        color: var(--cs-text);
        border: 1px solid var(--cs-border);
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      }
      .cs-btn:hover { background: var(--cs-bg-soft); border-color: var(--cs-text-dim); }
      .cs-btn.is-success { color: var(--cs-success); border-color: var(--cs-success); }
      .cs-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .cs-json-pre {
        margin: 8px 0 4px;
        padding: 12px 14px;
        background: #1f1d18;
        color: #e8e2d0;
        border-radius: 8px;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 12px;
        line-height: 1.45;
        max-height: 320px;
        overflow: auto;
        white-space: pre;
      }
      .cs-social {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px dashed var(--cs-border);
      }
      .cs-social-label {
        font-size: 11px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.08em;
        color: var(--cs-text-dim);
        margin-bottom: 8px;
      }
      .cs-social-card {
        display: flex; gap: 12px;
        max-width: 540px;
        border: 1px solid var(--cs-border);
        border-radius: 8px;
        overflow: hidden;
        background: var(--cs-bg-soft);
      }
      .cs-social-img {
        flex: 0 0 140px;
        background: #ddd;
        display: flex; align-items: center; justify-content: center;
        color: #999; font-size: 11px;
      }
      .cs-social-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .cs-social-meta { flex: 1; padding: 10px 12px; min-width: 0; }
      .cs-social-host { font-size: 11px; color: var(--cs-text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
      .cs-social-title { font-size: 14px; font-weight: 600; margin: 2px 0 4px; line-height: 1.3; }
      .cs-social-excerpt { font-size: 12.5px; color: var(--cs-text-dim); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .cs-toggle-row {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px dashed var(--cs-border);
        display: flex; flex-direction: column; gap: 4px;
      }
      .cs-toggle {
        display: inline-flex; align-items: center; gap: 8px;
        cursor: pointer;
        font-size: 13.5px; font-weight: 500;
      }
      .cs-toggle input { width: 16px; height: 16px; cursor: pointer; }
      .cs-toggle-help { font-size: 12px; color: var(--cs-text-dim); padding-left: 24px; }
      .cs-toggle-status { font-size: 12px; padding-left: 24px; min-height: 16px; }
      .cs-toggle-status.is-success { color: var(--cs-success); }
      .cs-toggle-status.is-danger  { color: var(--cs-danger); }
      .cs-error { color: var(--cs-danger); padding: 4px 0; }
    `;
    document.head.appendChild(style);
  }

  // ─── Helpers ────────────────────────────────────────────────────
  const escapeHtml = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const escapeAttr = escapeHtml;

  function buildUrls(slug) {
    const enc = encodeURIComponent(slug);
    return {
      public: `${CANONICAL_HOST}/opportunity/${enc}`,
      short:  `${CANONICAL_HOST}/e/${enc}`,
      json:   `${CANONICAL_HOST}/api/opportunities/${enc}`,
    };
  }

  function deriveExcerpt(opp) {
    const e = (opp.embed_excerpt || "").trim();
    if (e) return e;
    const desc = (opp.description || "").trim();
    if (!desc) return "";
    const plain = desc
      .replace(/^#+\s+/gm, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\n+/g, " ")
      .trim();
    return plain.length > 240 ? plain.slice(0, 237) + "…" : plain;
  }

  // ─── Render ─────────────────────────────────────────────────────
  function render(target, opp) {
    if (!opp || !opp.slug) {
      target.innerHTML = '<div class="cs-share-panel cs-error">SharePanel: missing slug</div>';
      return;
    }
    const urls = buildUrls(opp.slug);
    const title = opp.title || opp.slug;
    const excerpt = deriveExcerpt(opp);
    const ogImage = opp.og_image_url || null;
    const shareDisabled = !!opp.share_disabled;

    target.innerHTML = `
      <section class="cs-share-panel">
        <header class="cs-share-header">
          <div class="cs-share-title">Share &amp; Embed</div>
          <p class="cs-share-sub">This opportunity can be linked to, fetched as JSON, or embedded.</p>
        </header>

        <div class="cs-card" data-row="public">
          <div class="cs-card-label">Public page</div>
          <input class="cs-card-url" readonly value="${escapeAttr(urls.public)}" />
          <div class="cs-card-actions">
            <button class="cs-btn" data-action="open" data-url="${escapeAttr(urls.public)}">Open</button>
            <button class="cs-btn" data-action="copy" data-text="${escapeAttr(urls.public)}">Copy</button>
          </div>
        </div>

        <div class="cs-card" data-row="short">
          <div class="cs-card-label">Short link</div>
          <input class="cs-card-url" readonly value="${escapeAttr(urls.short)}" />
          <div class="cs-card-actions">
            <button class="cs-btn" data-action="copy" data-text="${escapeAttr(urls.short)}">Copy</button>
          </div>
        </div>

        <div class="cs-card" data-row="json">
          <div class="cs-card-label">JSON record</div>
          <input class="cs-card-url" readonly value="${escapeAttr(urls.json)}" />
          <div class="cs-card-actions">
            <button class="cs-btn" data-action="preview-json" data-slug="${escapeAttr(opp.slug)}">Preview</button>
            <button class="cs-btn" data-action="copy" data-text="${escapeAttr(urls.json)}">Copy</button>
          </div>
        </div>
        <pre class="cs-json-pre" data-role="json-pre" hidden></pre>

        <div class="cs-social">
          <div class="cs-social-label">Social preview</div>
          <div class="cs-social-card">
            <div class="cs-social-img">
              ${ogImage
                ? `<img src="${escapeAttr(ogImage)}" alt="" />`
                : `<span>No og:image set</span>`}
            </div>
            <div class="cs-social-meta">
              <div class="cs-social-host">go.theartyst.co.uk</div>
              <div class="cs-social-title">${escapeHtml(title)}</div>
              <div class="cs-social-excerpt">${escapeHtml(excerpt || "—")}</div>
            </div>
          </div>
        </div>

        <div class="cs-toggle-row">
          <label class="cs-toggle">
            <input type="checkbox" data-role="share-disabled" ${shareDisabled ? "checked" : ""} />
            <span>Hide from JSON feed and embed</span>
          </label>
          <span class="cs-toggle-help">Public page and short link still work; only the API surface is suppressed.</span>
          <span class="cs-toggle-status" data-role="toggle-status"></span>
        </div>
      </section>
    `;

    bindHandlers(target, opp);
  }

  // ─── Handlers ───────────────────────────────────────────────────
  function bindHandlers(root, opp) {
    root.querySelectorAll('[data-action="copy"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const text = btn.dataset.text || "";
        try {
          await navigator.clipboard.writeText(text);
          flashButton(btn, "Copied");
        } catch {
          // Fallback for browsers without clipboard API permission
          const input = btn.closest(".cs-card")?.querySelector(".cs-card-url");
          if (input) {
            input.select();
            document.execCommand("copy");
            flashButton(btn, "Copied");
          }
        }
      });
    });

    root.querySelectorAll('[data-action="open"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        window.open(btn.dataset.url, "_blank", "noopener");
      });
    });

    const previewBtn = root.querySelector('[data-action="preview-json"]');
    const previewPre = root.querySelector('[data-role="json-pre"]');
    if (previewBtn && previewPre) {
      previewBtn.addEventListener("click", async () => {
        if (!previewPre.hidden) {
          previewPre.hidden = true;
          previewBtn.textContent = "Preview";
          return;
        }
        previewBtn.disabled = true;
        previewBtn.textContent = "Loading…";
        try {
          const res = await fetch(`/api/opportunities/${encodeURIComponent(opp.slug)}`);
          const text = res.ok
            ? JSON.stringify(await res.json(), null, 2)
            : `// HTTP ${res.status}\n${await res.text()}`;
          previewPre.textContent = text;
          previewPre.hidden = false;
          previewBtn.textContent = "Hide";
        } catch (err) {
          previewPre.textContent = `// Failed to load: ${err.message}`;
          previewPre.hidden = false;
          previewBtn.textContent = "Hide";
        } finally {
          previewBtn.disabled = false;
        }
      });
    }

    const toggleInput = root.querySelector('[data-role="share-disabled"]');
    const toggleStatus = root.querySelector('[data-role="toggle-status"]');
    if (toggleInput) {
      toggleInput.addEventListener("change", async () => {
        const newVal = toggleInput.checked;
        toggleInput.disabled = true;
        toggleStatus.className = "cs-toggle-status";
        toggleStatus.textContent = "Saving…";
        try {
          const adminSecret = (window.SHARE_PANEL_CONFIG || {}).adminSecret || "";
          const res = await fetch("/api/admin/opportunity-share", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-admin-secret": adminSecret,
            },
            body: JSON.stringify({ slug: opp.slug, share_disabled: newVal }),
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body || "request failed"}`);
          }
          opp.share_disabled = newVal;
          toggleStatus.className = "cs-toggle-status is-success";
          toggleStatus.textContent = newVal
            ? "Hidden from JSON feed."
            : "Visible in JSON feed.";
        } catch (err) {
          toggleInput.checked = !newVal; // revert
          toggleStatus.className = "cs-toggle-status is-danger";
          toggleStatus.textContent = `Could not save: ${err.message}`;
        } finally {
          toggleInput.disabled = false;
        }
      });
    }
  }

  function flashButton(btn, text) {
    const original = btn.textContent;
    btn.textContent = text;
    btn.classList.add("is-success");
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("is-success");
    }, 1400);
  }

  // ─── Public API ─────────────────────────────────────────────────
  window.SharePanel = {
    mount(target, opportunity) {
      if (typeof target === "string") target = document.querySelector(target);
      if (!target) {
        console.warn("SharePanel.mount: target not found");
        return;
      }
      render(target, opportunity || {});
    },
  };
})();
