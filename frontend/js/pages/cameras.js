// pages/cameras.js — live webkameraer (foreløpig én, lett å utvide)
//
// Camera-kilder: Schibsted Media stream-ID-er fungerer som ren iframe-embed.
// Port of Kristiansand sin egen nettside bruker samme CDN, så embed-en er
// offentlig tilgjengelig uten paywall.

const CAMERAS = [
  {
    id:          'bystranda',
    name:        'Bystranda',
    location:    'Kristiansand',
    description: 'Live-kamera over Bystranda med utsyn mot innseilingen.',
    embedUrl:    'https://cdn.stream.schibsted.media/embed/latest/iframe.html?id=1001407&provider=fvn&sharing=true&play=true&next=false',
    credit:      'Fædrelandsvennen i samarbeid med Scandic Kristiansand Bystranda',
  },
  // Legg til flere kameraer her — samme struktur
];

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Kameraer</div>
      <div class="ph-s">Live webkameraer · ${CAMERAS.length} ${CAMERAS.length === 1 ? 'kamera' : 'kameraer'}</div>
    </div>

    ${CAMERAS.length ? `
      <div class="cam-tabs" role="tablist">
        ${CAMERAS.map((c, i) => `
          <button class="cam-tab${i === 0 ? ' cam-tab-active' : ''}" data-cam="${c.id}" role="tab">${escapeHtml(c.name)}</button>
        `).join('')}
      </div>

      ${CAMERAS.map((c, i) => `
        <div id="cam-panel-${c.id}" class="cam-panel${i === 0 ? ' cam-panel-active' : ''}" ${i === 0 ? '' : 'hidden'}>
          <div class="cam-frame-wrap">
            <iframe
              class="cam-frame"
              src="${c.embedUrl}"
              title="${escapeHtml(c.name)} webkamera"
              allow="autoplay; fullscreen"
              allowfullscreen
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
            ></iframe>
          </div>
          <div class="cam-meta">
            <div class="cam-title">${escapeHtml(c.name)}</div>
            <div class="cam-loc">📍 ${escapeHtml(c.location)}</div>
            ${c.description ? `<div class="cam-desc">${escapeHtml(c.description)}</div>` : ''}
            ${c.credit      ? `<div class="cam-credit">Kilde: ${escapeHtml(c.credit)}</div>` : ''}
          </div>
        </div>
      `).join('')}
    ` : '<div class="empty" style="padding:20px;color:var(--ink-light);font-size:12px;text-align:center">Ingen kameraer konfigurert.</div>'}

    <style>
      .cam-tabs {
        display:flex; gap:0; margin-bottom:16px;
        border-bottom:1px solid var(--line); overflow-x:auto;
      }
      .cam-tab {
        padding:10px 16px; background:transparent; border:none; cursor:pointer;
        font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:12px;
        letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light);
        border-bottom:2px solid transparent; white-space:nowrap;
        transition: color .15s, border-color .15s;
      }
      .cam-tab:hover { color:var(--ink); }
      .cam-tab-active { color:var(--blue); border-bottom-color:var(--blue); }

      .cam-panel[hidden] { display:none; }
      .cam-frame-wrap {
        position:relative; width:100%; aspect-ratio:16/9;
        background:#000; border:1px solid var(--line); overflow:hidden;
      }
      .cam-frame { width:100%; height:100%; border:none; display:block; }

      .cam-meta {
        padding:12px 14px; border:1px solid var(--line); border-top:none;
        background:var(--white);
      }
      .cam-title {
        font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:16px;
        letter-spacing:.04em; color:var(--ink); margin-bottom:2px;
      }
      .cam-loc { font-size:11px; color:var(--ink-light); margin-bottom:6px; }
      .cam-desc { font-size:13px; color:var(--ink); line-height:1.5; margin-bottom:6px; }
      .cam-credit {
        font-size:10px; color:var(--ink-light); font-style:italic;
      }
    </style>
  `;

  // Tab-switching
  container.querySelectorAll('.cam-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.cam;
      container.querySelectorAll('.cam-tab').forEach(b => b.classList.toggle('cam-tab-active', b === btn));
      container.querySelectorAll('.cam-panel').forEach(p => {
        const match = p.id === 'cam-panel-' + id;
        p.hidden = !match;
        p.classList.toggle('cam-panel-active', match);
      });
    });
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
