// pages/system.js — Bavapp-programvare: arkitektur, endringslogg, features
const BASE = () => localStorage.getItem('backend_url') || 'http://localhost:3001';

const PRIO = [
  { label: 'Framtid',  color: '#4caf50', groupTitle: 'Framtid / eksperimentelt' },
  { label: 'Nice',     color: '#ffc107', groupTitle: 'Nice to have' },
  { label: 'Bør',      color: '#ff9800', groupTitle: 'Bør (høy daglig verdi)' },
  { label: 'Må',       color: '#f44336', groupTitle: 'Må (sikkerhet/kritisk)' },
];

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">System</div>
      <div class="ph-s">Bavapp-programvare · arkitektur · endringslogg · features</div>
    </div>
    <div class="sys-tabs" role="tablist">
      <button class="sys-tab sys-tab-active" data-tab="arch"      role="tab">Arkitektur</button>
      <button class="sys-tab"                data-tab="changelog" role="tab">Endringslogg</button>
      <button class="sys-tab"                data-tab="features"  role="tab">Features</button>
      <button class="sys-tab"                data-tab="status"    role="tab">Status</button>
      <button class="sys-tab"                data-tab="router"    role="tab">Konnektivitet</button>
    </div>
    <div id="sys-panel-arch"      class="sys-panel sys-panel-active"></div>
    <div id="sys-panel-changelog" class="sys-panel" hidden></div>
    <div id="sys-panel-features"  class="sys-panel" hidden></div>
    <div id="sys-panel-status"    class="sys-panel" hidden></div>
    <div id="sys-panel-router"    class="sys-panel" hidden></div>

    ${styles()}
  `;

  renderArch(document.getElementById('sys-panel-arch'));

  const loaded = { changelog: false, features: false, status: false, router: false };
  container.querySelectorAll('.sys-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      container.querySelectorAll('.sys-tab').forEach(b => b.classList.toggle('sys-tab-active', b === btn));
      for (const t of ['arch', 'changelog', 'features', 'status', 'router']) {
        const el = document.getElementById('sys-panel-' + t);
        el.hidden = t !== tab;
        el.classList.toggle('sys-panel-active', t === tab);
      }
      if (tab === 'changelog' && !loaded.changelog) {
        loaded.changelog = true;
        renderChangelogTab(document.getElementById('sys-panel-changelog'));
      }
      if (tab === 'features' && !loaded.features) {
        loaded.features = true;
        renderFeaturesTab(document.getElementById('sys-panel-features'));
      }
      if (tab === 'status' && !loaded.status) {
        loaded.status = true;
        renderStatusTab(document.getElementById('sys-panel-status'));
      }
      if (tab === 'router' && !loaded.router) {
        loaded.router = true;
        renderRouterTab(document.getElementById('sys-panel-router'));
      }
      if (tab === 'router') startRouterPolling(); else stopRouterPolling();
      if (tab === 'status') startStatusPolling(); else stopStatusPolling();
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// ARKITEKTUR-TAB
// ══════════════════════════════════════════════════════════════════════
function renderArch(panel) {
  panel.innerHTML = `
    <div class="arch-intro">
      BavApp er en <strong>Progressive Web App (PWA)</strong> som fungerer som en digital tvilling
      av Bavaria Sport 32. Appen henter sensordata i sanntid fra båtens elektriske og mekaniske
      systemer, lagrer tidsseriedata lokalt, og presenterer alt i et responsivt brukergrensesnitt
      optimalisert for iPad i cockpit. Arkitekturen er bygget rundt
      <strong>tre distinkte lag</strong> — datainnsamling, persistering og presentasjon —
      med en tydelig separasjon mellom live-data og historisk analyse.
    </div>

    <div class="arch-flow">
      <div class="arch-flow-title">Datapipeline — fra sensor til skjerm</div>
      <div class="arch-pipeline">
        <div class="arch-pipe-step plan"><div class="arch-pipe-icon">⚙️</div><div class="arch-pipe-label">Sensorer</div><div class="arch-pipe-sub">NMEA 2000<br>VE.Direct · W-Bus</div></div>
        <div class="arch-pipe-arrow">→</div>
        <div class="arch-pipe-step plan"><div class="arch-pipe-icon">🖥</div><div class="arch-pipe-label">Cerbo GX</div><div class="arch-pipe-sub">Venus OS<br>Signal K server</div></div>
        <div class="arch-pipe-arrow">→</div>
        <div class="arch-pipe-step"><div class="arch-pipe-icon">📡</div><div class="arch-pipe-label">Signal K API</div><div class="arch-pipe-sub">REST + WebSocket<br>lokalt nettverk</div></div>
        <div class="arch-pipe-arrow">→</div>
        <div class="arch-pipe-step"><div class="arch-pipe-icon">🗄</div><div class="arch-pipe-label">Backend</div><div class="arch-pipe-sub">Node.js + Express<br>SQLite database</div></div>
        <div class="arch-pipe-arrow">→</div>
        <div class="arch-pipe-step"><div class="arch-pipe-icon">📱</div><div class="arch-pipe-label">Frontend</div><div class="arch-pipe-sub">PWA · Vanilla JS<br>iPad / iPhone</div></div>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-light);font-style:italic">Stiplede bokser er planlagte komponenter.</div>
    </div>

    <div class="arch-stack">
      ${archCard('📡','Signal K','Åpen maritim datastandard · JSON over HTTP/WS',
        `<p>Signal K normaliserer data fra NMEA 0183, NMEA 2000 og proprietære protokoller til et felles JSON-skjema. Alle sensorverdier adresseres via dot-notation paths, f.eks. <code class="ac">electrical.batteries.279.capacity.stateOfCharge</code>.</p>`,
        [['ok','Implementert'],['ok','Cerbo GX installert']])}
      ${archCard('🗄','Backend — Node.js + SQLite','Express REST API · lokal persistering',
        `<p>Persistenslag med tre oppgaver: tidsserielagring, domeneobjekter (hendelseslogg, vedlikehold, turer), og turdeteksjon — en tilstandsmaskin som poller Signal K og beregner distanse med Haversine.</p>`,
        [['ok','Implementert'],['','SQLite'],['','Express 4']])}
      ${archCard('📱','Frontend — PWA','Vanilla JS · ES modules · ingen bundler',
        `<p>SPA i ren JavaScript med ES modules. Hash-basert routing, hvert side-modul eksporterer <code class="ac">render()</code> og <code class="ac">onSkUpdate()</code> for live-data.</p>`,
        [['ok','Implementert'],['','Service Worker'],['','ES Modules']])}
      ${archCard('🖥','Victron Cerbo GX','Edge-datamaskin · Venus OS Large · planlagt',
        `<p>ARM-basert datamaskin fra Victron. Cerbo GX aggregerer data fra SmartShunt (VE.Direct) og NMEA 2000-backbone, og eksponerer alt som et Signal K endepunkt på båtnettverket.</p>`,
        [['plan','Planlagt'],['plan','VE.Direct'],['plan','NMEA 2000']])}
      ${archCard('◈','Koblingsskjemaer — React Flow','Interaktive diagrammer · Vite + React + @xyflow/react',
        `<p>Koblingsskjemaene er bygget som en separat Vite + React-app og embeddes som iframe på <a href="#vessel">Båten</a>-siden. Nodene er trekkbare og zoombare.</p>`,
        [['ok','Implementert'],['','React Flow v12'],['','Vite 5']])}
      ${archCard('🤖','Claude AI-integrasjon','Anthropic API · direkte fra browser',
        `<p>Dokumentarkiv scanner bilder og PDFer med Claude Vision. Sensordata genererer norsk haiku via Anthropic API. API-nøkkel i localStorage. Modell: claude-sonnet-4-20250514.</p>`,
        [['ok','Implementert'],['','Claude Sonnet 4'],['','Vision API']])}
    </div>

    <div class="arch-note">
      <strong>Teknologier:</strong>
      Frontend — Vanilla JS ES Modules, Chart.js 4, Leaflet, React Flow (koblingsskjemaer), Service Worker PWA.
      Backend — Node.js v20, Express 4, better-sqlite3, multer 2, uuid.
      Protokoller — Signal K (JSON/WebSocket), NMEA 2000, VE.Direct, MET Norway Locationforecast 2.0.
      Planlagt — Venus OS Large (Cerbo GX), InfluxDB, Node-RED, Tailscale VPN.
      Bygd og vedlikeholdt av Tom Erik Thorsen med Claude (Anthropic) som parprogrammerer.
    </div>
  `;
}

function archCard(icon, title, sub, body, tags) {
  return `<div class="arch-card">
    <div class="arch-card-head">
      <span class="arch-card-icon">${icon}</span>
      <div><div class="arch-card-title">${title}</div><div class="arch-card-sub">${sub}</div></div>
    </div>
    <div class="arch-card-body">
      ${body}
      <div>${tags.map(([cls, lbl]) => `<span class="arch-tag${cls ? ' ' + cls : ''}">${lbl}</span>`).join('')}</div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// ENDRINGSLOGG-TAB
// ══════════════════════════════════════════════════════════════════════
let _showAuto    = false;
let _filterType  = 'all';

async function renderChangelogTab(panel) {
  panel.innerHTML = `
    <div class="cl-controls">
      <button class="btn-primary" id="cl-add-btn" style="font-size:11px;padding:8px 14px">+ Legg til endring</button>
      <label class="cl-toggle">
        <input type="checkbox" id="cl-show-auto"> Vis automatiske oppføringer
      </label>
      <select id="cl-filter-type" class="cl-select">
        <option value="all">Alle typer</option>
        <option value="feat">feat — funksjonalitet</option>
        <option value="fix">fix — bugfix</option>
        <option value="hardware">hardware — maskinvare</option>
        <option value="plan">plan — planlegging</option>
      </select>
    </div>

    <div id="cl-form" hidden>
      <div class="cl-form-grid">
        <input id="clf-title" placeholder="Tittel *" class="cl-form-input">
        <select id="clf-type" class="cl-form-input">
          <option value="feat">feat — funksjonalitet</option>
          <option value="fix">fix — bugfix</option>
          <option value="hardware">hardware — maskinvare</option>
        </select>
        <input id="clf-version" placeholder="Versjon (valgfri, f.eks. v0.11)" class="cl-form-input">
      </div>
      <textarea id="clf-desc" placeholder="Beskrivelse (valgfri)" rows="2" class="cl-form-input cl-form-textarea"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-primary" id="clf-save" style="font-size:11px;padding:8px 14px">Lagre</button>
        <button class="btn-secondary" id="clf-cancel" style="font-size:11px;padding:7px 12px">Avbryt</button>
      </div>
    </div>

    <div id="cl-list"><div class="wx-load"><div class="spin"></div>Laster endringslogg…</div></div>
  `;

  document.getElementById('cl-show-auto').addEventListener('change', e => {
    _showAuto = e.target.checked;
    loadChangelog();
  });
  document.getElementById('cl-filter-type').addEventListener('change', e => {
    _filterType = e.target.value;
    loadChangelog();
  });
  document.getElementById('cl-add-btn').addEventListener('click', () => {
    document.getElementById('cl-form').hidden = false;
    document.getElementById('clf-title').focus();
  });
  document.getElementById('clf-cancel').addEventListener('click', () => {
    document.getElementById('cl-form').hidden = true;
    clearForm();
  });
  document.getElementById('clf-save').addEventListener('click', addChangelogEntry);

  loadChangelog();
}

async function loadChangelog() {
  const list = document.getElementById('cl-list');
  if (!list) return;
  try {
    const { data } = await fetch(`${BASE()}/api/changelog`).then(r => r.json());
    const filtered = (data || []).filter(e => {
      if (!_showAuto   && e.auto) return false;
      if (_filterType !== 'all' && e.type !== _filterType) return false;
      return true;
    });
    if (!filtered.length) {
      list.innerHTML = '<div class="empty" style="padding:20px;text-align:center;color:var(--ink-light);font-size:12px">Ingen oppføringer med gjeldende filter.</div>';
      return;
    }

    // Grupper per versjon
    const byVersion = new Map();
    for (const e of filtered) {
      const v = e.version || 'uten versjon';
      if (!byVersion.has(v)) byVersion.set(v, []);
      byVersion.get(v).push(e);
    }
    const sortedVersions = [...byVersion.keys()].sort(compareVersionsDesc);

    list.innerHTML = sortedVersions.map(v => `
      <div class="cl-group">
        <div class="cl-version-header">${v}</div>
        <div class="cl-entries">
          ${byVersion.get(v).map(renderEntry).join('')}
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.cl-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Slette denne oppføringen?')) return;
        await fetch(`${BASE()}/api/changelog/${btn.dataset.id}`, { method: 'DELETE' });
        loadChangelog();
      });
    });
  } catch (e) {
    list.innerHTML = `<div class="empty" style="padding:20px;color:var(--danger);font-size:12px">Feil: ${e.message}</div>`;
  }
}

function compareVersionsDesc(a, b) {
  const parse = v => {
    const m = /^v?(\d+)\.(\d+)/.exec(v);
    return m ? [+m[1], +m[2]] : [-1, -1];
  };
  const [ma, na] = parse(a);
  const [mb, nb] = parse(b);
  if (ma !== mb) return mb - ma;
  return nb - na;
}

const TYPE_ICON = { feat: '✨', fix: '🔧', hardware: '⚡', plan: '📋' };
const TYPE_LBL  = { feat: 'feat', fix: 'fix', hardware: 'hardware', plan: 'plan' };

function renderEntry(e) {
  const dt    = e.date ? new Date(e.date).toLocaleDateString('no', { day:'2-digit', month:'short' }) : '';
  const icon  = TYPE_ICON[e.type] || '•';
  const badge = e.auto ? '<span class="cl-auto-badge">auto</span>' : '';
  return `
    <div class="cl-entry">
      <div class="cl-entry-icon">${icon}</div>
      <div class="cl-entry-body">
        <div class="cl-entry-top">
          <span class="cl-entry-type">${TYPE_LBL[e.type] || e.type}</span>
          <span class="cl-entry-title">${escapeHtml(e.title)}</span>
          ${badge}
        </div>
        ${e.description ? `<div class="cl-entry-desc">${escapeHtml(e.description)}</div>` : ''}
        <div class="cl-entry-meta">${dt} · kilde: ${e.source || 'manual'}</div>
      </div>
      <button class="cl-del" data-id="${e.id}" title="Slett">×</button>
    </div>
  `;
}

async function addChangelogEntry() {
  const title = document.getElementById('clf-title').value.trim();
  if (!title) { alert('Tittel er påkrevd'); return; }
  const type    = document.getElementById('clf-type').value;
  const version = document.getElementById('clf-version').value.trim();
  const desc    = document.getElementById('clf-desc').value.trim();

  await fetch(`${BASE()}/api/changelog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title, type, description: desc || null,
      version: version || null, source: 'manual', auto: 0,
      date: new Date().toISOString().slice(0, 10),
    }),
  });
  clearForm();
  document.getElementById('cl-form').hidden = true;
  loadChangelog();
}

function clearForm() {
  ['clf-title', 'clf-version', 'clf-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

// ══════════════════════════════════════════════════════════════════════
// FEATURES-TAB
// ══════════════════════════════════════════════════════════════════════
let _featuresShowDone = false;

async function renderFeaturesTab(panel) {
  panel.innerHTML = `
    <div class="feat-controls">
      <button class="btn-primary" id="feat-add-btn" style="font-size:11px;padding:8px 14px">+ Ny feature</button>
      <label class="cl-toggle">
        <input type="checkbox" id="feat-show-done"> Vis implementerte (read-only)
      </label>
    </div>

    <div id="feat-form" hidden>
      <div class="cl-form-grid">
        <input id="featf-title" placeholder="Tittel *" class="cl-form-input">
        <select id="featf-prio" class="cl-form-input">
          <option value="3">Må (rød)</option>
          <option value="2" selected>Bør (oransje)</option>
          <option value="1">Nice (gul)</option>
          <option value="0">Framtid (grønn)</option>
        </select>
      </div>
      <textarea id="featf-desc" placeholder="Beskrivelse (valgfri)" rows="3" class="cl-form-input cl-form-textarea"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-primary" id="featf-save" style="font-size:11px;padding:8px 14px">Lagre</button>
        <button class="btn-secondary" id="featf-cancel" style="font-size:11px;padding:7px 12px">Avbryt</button>
      </div>
    </div>

    <div id="feat-list"><div class="wx-load"><div class="spin"></div>Laster features…</div></div>
  `;

  document.getElementById('feat-show-done').addEventListener('change', e => {
    _featuresShowDone = e.target.checked;
    loadFeatures();
  });
  document.getElementById('feat-add-btn').addEventListener('click', () => {
    document.getElementById('feat-form').hidden = false;
    document.getElementById('featf-title').focus();
  });
  document.getElementById('featf-cancel').addEventListener('click', () => {
    document.getElementById('feat-form').hidden = true;
    clearFeatureForm();
  });
  document.getElementById('featf-save').addEventListener('click', saveNewFeature);

  loadFeatures();
}

async function loadFeatures() {
  const list = document.getElementById('feat-list');
  if (!list) return;
  try {
    const { data } = await fetch(`${BASE()}/api/features`).then(r => r.json());
    const planned   = (data || []).filter(f => f.status === 'planned' || f.status === 'in_progress');
    const done      = (data || []).filter(f => f.status === 'done');

    // Grupper planlagte per prioritet (3 først)
    const byPrio = new Map();
    for (let p = 3; p >= 0; p--) byPrio.set(p, []);
    for (const f of planned) {
      if (byPrio.has(f.priority)) byPrio.get(f.priority).push(f);
    }

    let html = '';
    for (let p = 3; p >= 0; p--) {
      const items = byPrio.get(p) || [];
      if (!items.length) continue;
      html += `
        <div class="feat-group">
          <div class="feat-group-head" style="border-left-color:${PRIO[p].color}">
            <span class="feat-group-badge" style="background:${PRIO[p].color}">${PRIO[p].label}</span>
            <span class="feat-group-title">${PRIO[p].groupTitle}</span>
            <span class="feat-group-count">${items.length}</span>
          </div>
          <div class="feat-items">
            ${items.map(renderFeatureItem).join('')}
          </div>
        </div>`;
    }

    if (!planned.length) {
      html += `<div class="empty" style="padding:20px;text-align:center;color:var(--ink-light);font-size:12px">Ingen planlagte features. Trykk <strong>+ Ny feature</strong> for å legge til.</div>`;
    }

    if (_featuresShowDone && done.length) {
      html += `
        <div class="feat-group feat-group-done">
          <div class="feat-group-head" style="border-left-color:var(--ink-light)">
            <span class="feat-group-badge" style="background:var(--ink-light)">Implementert</span>
            <span class="feat-group-title">Ferdig utviklet (read-only)</span>
            <span class="feat-group-count">${done.length}</span>
          </div>
          <div class="feat-items">
            ${done.map(renderFeatureDone).join('')}
          </div>
        </div>`;
    }

    list.innerHTML = html;
    wireFeatureHandlers();
  } catch (e) {
    list.innerHTML = `<div class="empty" style="padding:20px;color:var(--danger);font-size:12px">Feil: ${e.message}</div>`;
  }
}

function renderFeatureItem(f) {
  const color = PRIO[f.priority]?.color || '#999';
  return `
    <div class="feat-item" data-id="${f.id}" style="border-left-color:${color}">
      <div class="feat-item-body">
        <div class="feat-item-title" data-field="title">${escapeHtml(f.title)}</div>
        ${f.description ? `<div class="feat-item-desc" data-field="description">${escapeHtml(f.description)}</div>` : '<div class="feat-item-desc feat-item-desc-empty" data-field="description">(ingen beskrivelse)</div>'}
      </div>
      <div class="feat-item-actions">
        <select class="feat-prio-select" data-id="${f.id}" title="Endre prioritet">
          <option value="3"${f.priority===3?' selected':''}>Må</option>
          <option value="2"${f.priority===2?' selected':''}>Bør</option>
          <option value="1"${f.priority===1?' selected':''}>Nice</option>
          <option value="0"${f.priority===0?' selected':''}>Framtid</option>
        </select>
        <button class="feat-btn feat-complete" data-id="${f.id}" title="Marker som implementert">✓</button>
        <button class="feat-btn feat-edit"     data-id="${f.id}" title="Rediger">✏</button>
        <button class="feat-btn feat-delete"   data-id="${f.id}" title="Slett">🗑</button>
      </div>
    </div>`;
}

function renderFeatureDone(f) {
  const v  = f.completed_version || '';
  const dt = f.completed_at ? new Date(f.completed_at).toLocaleDateString('no', { day:'2-digit', month:'short', year:'2-digit' }) : '';
  return `
    <div class="feat-item feat-item-done">
      <div class="feat-item-body">
        <div class="feat-item-title">✓ ${escapeHtml(f.title)}</div>
        ${f.description ? `<div class="feat-item-desc">${escapeHtml(f.description)}</div>` : ''}
        <div class="feat-item-meta">${[v, dt].filter(Boolean).join(' · ')}</div>
      </div>
    </div>`;
}

function wireFeatureHandlers() {
  document.querySelectorAll('.feat-prio-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      await fetch(`${BASE()}/api/features/${sel.dataset.id}/priority`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: +sel.value }),
      });
      loadFeatures();
    });
  });

  document.querySelectorAll('.feat-complete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Marker som implementert? Dette oppretter en changelog-entry og bumper versjonen.')) return;
      const r = await fetch(`${BASE()}/api/features/${btn.dataset.id}/complete`, { method: 'POST' });
      if (!r.ok) { alert('Kunne ikke fullføre'); return; }
      const { version } = await r.json();
      alert(`Implementert. Ny versjon: ${version}`);
      loadFeatures();
    });
  });

  document.querySelectorAll('.feat-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Slette denne featuren?')) return;
      await fetch(`${BASE()}/api/features/${btn.dataset.id}`, { method: 'DELETE' });
      loadFeatures();
    });
  });

  document.querySelectorAll('.feat-edit').forEach(btn => {
    btn.addEventListener('click', () => toggleEditInline(btn.dataset.id));
  });
}

function toggleEditInline(id) {
  const item = document.querySelector(`.feat-item[data-id="${id}"]`);
  if (!item) return;
  const titleEl = item.querySelector('[data-field="title"]');
  const descEl  = item.querySelector('[data-field="description"]');
  const curTitle = titleEl.textContent;
  const curDesc  = descEl.classList.contains('feat-item-desc-empty') ? '' : descEl.textContent;

  titleEl.innerHTML = `<input type="text" class="feat-edit-input" value="${escapeAttr(curTitle)}">`;
  descEl.innerHTML  = `<textarea class="feat-edit-input feat-edit-textarea" rows="2">${escapeHtml(curDesc)}</textarea>`;
  descEl.classList.remove('feat-item-desc-empty');

  const actions = item.querySelector('.feat-item-actions');
  actions.innerHTML = `
    <button class="feat-btn feat-save-edit" data-id="${id}">Lagre</button>
    <button class="feat-btn feat-cancel-edit" data-id="${id}">Avbryt</button>
  `;

  actions.querySelector('.feat-save-edit').addEventListener('click', async () => {
    const title = titleEl.querySelector('input').value.trim();
    const desc  = descEl.querySelector('textarea').value.trim();
    if (!title) { alert('Tittel er påkrevd'); return; }
    await fetch(`${BASE()}/api/features/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: desc }),
    });
    loadFeatures();
  });
  actions.querySelector('.feat-cancel-edit').addEventListener('click', loadFeatures);
}

async function saveNewFeature() {
  const title = document.getElementById('featf-title').value.trim();
  if (!title) { alert('Tittel er påkrevd'); return; }
  const priority = +document.getElementById('featf-prio').value;
  const desc     = document.getElementById('featf-desc').value.trim();

  await fetch(`${BASE()}/api/features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description: desc, priority }),
  });
  clearFeatureForm();
  document.getElementById('feat-form').hidden = true;
  loadFeatures();
}

function clearFeatureForm() {
  ['featf-title', 'featf-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('featf-prio').value = '2';
}

// ── Utils ───────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

// ══════════════════════════════════════════════════════════════════════
// STATUS-TAB (Cerbo-systeminformasjon)
// ══════════════════════════════════════════════════════════════════════
let _statusPollTimer = null;

function renderStatusTab(panel) {
  panel.innerHTML = `
    <div class="rt-controls">
      <button class="btn-secondary" id="st-refresh" style="font-size:11px;padding:7px 14px">↻ Oppdater</button>
      <label class="cl-toggle"><input type="checkbox" id="st-autorefresh" checked> Auto-oppdater (30 s)</label>
    </div>
    <div id="st-body"><div class="wx-load"><div class="spin"></div>Henter systemstatus…</div></div>
  `;
  document.getElementById('st-refresh').addEventListener('click', loadSysInfo);
  document.getElementById('st-autorefresh').addEventListener('change', e => {
    if (e.target.checked) startStatusPolling();
    else                  stopStatusPolling();
  });
  loadSysInfo();
  startStatusPolling();
}

async function loadSysInfo() {
  const body = document.getElementById('st-body');
  if (!body) return;
  try {
    const d = await fetch(`${BASE()}/api/diag/sysinfo`).then(r => r.json());
    body.innerHTML = renderSysInfoBody(d);
  } catch (e) {
    body.innerHTML = `<div style="padding:20px;color:var(--danger);font-size:12px">Feil: ${escapeHtml(e.message)}</div>`;
  }
}

function renderSysInfoBody(d) {
  const { system, bavapp, signalK, ts } = d;
  const l = system.loadavg;
  const memPct = Math.round((1 - system.mem.free / system.mem.total) * 100);

  const loadCls = v => v > 2 ? 'danger' : v > 1 ? 'warn' : null;
  const memCls  = memPct > 85 ? 'danger' : memPct > 70 ? 'warn' : null;

  return `
    <div class="st-cards">
      <div class="st-card">
        <div class="st-card-lbl">System oppe i</div>
        <div class="st-card-val">${fmtUptime(system.uptime)}</div>
        <div class="st-card-sub">${escapeHtml(system.hostname)}</div>
      </div>
      <div class="st-card">
        <div class="st-card-lbl">Bavapp oppe i</div>
        <div class="st-card-val">${fmtUptime(bavapp.uptime)}</div>
        <div class="st-card-sub">${escapeHtml(bavapp.nodeVersion)}</div>
      </div>
      <div class="st-card st-card-sk st-card-sk-${signalK.ok ? 'ok' : 'err'}">
        <div class="st-card-lbl">Signal K</div>
        <div class="st-card-val">${signalK.ok ? 'Tilkoblet' : 'Nede'}</div>
        <div class="st-card-sub">${signalK.latencyMs != null ? signalK.latencyMs + ' ms' : '—'}</div>
      </div>
    </div>

    <div class="cl-version-header" style="margin-top:20px">CPU</div>
    <div class="st-metric-row">
      ${stStat('1 min',  l[0].toFixed(2), loadCls(l[0]))}
      ${stStat('5 min',  l[1].toFixed(2), loadCls(l[1]))}
      ${stStat('15 min', l[2].toFixed(2), loadCls(l[2]))}
    </div>

    <div class="cl-version-header" style="margin-top:16px">Minne</div>
    <div class="st-metric-row">
      ${stStat('Brukt',  memPct + '%',               memCls)}
      ${stStat('Ledig',  fmtBytes(system.mem.free),  null)}
      ${stStat('Total',  fmtBytes(system.mem.total), null)}
    </div>

    <div class="rt-meta" style="margin-top:16px">Sist oppdatert ${new Date(ts).toLocaleTimeString('no')}</div>
  `;
}

function stStat(lbl, val, cls) {
  return `<div class="rt-stat">
    <div class="rt-stat-lbl">${escapeHtml(lbl)}</div>
    <div class="rt-stat-val${cls ? ' st-' + cls : ''}">${escapeHtml(String(val))}</div>
  </div>`;
}

function startStatusPolling() {
  stopStatusPolling();
  const cb = document.getElementById('st-autorefresh');
  if (cb && !cb.checked) return;
  _statusPollTimer = setInterval(() => loadSysInfo(), 30_000);
}

function stopStatusPolling() {
  if (_statusPollTimer) { clearInterval(_statusPollTimer); _statusPollTimer = null; }
}

// ══════════════════════════════════════════════════════════════════════
// RUTER-TAB (Teltonika RUT200)
// ══════════════════════════════════════════════════════════════════════
let _routerPollTimer = null;
let _routerReachable = null;  // null = ikke testet, true/false = siste status

async function renderRouterTab(panel) {
  panel.innerHTML = `
    <div class="rt-controls">
      <button class="btn-secondary" id="rt-refresh"   style="font-size:11px;padding:7px 14px">↻ Oppdater</button>
      <button class="btn-secondary" id="rt-reboot"    style="font-size:11px;padding:7px 14px">⟲ Reboot ruter</button>
      <button class="btn-secondary" id="rt-sms-toggle" style="font-size:11px;padding:7px 14px">📨 Send SMS</button>
      <label class="cl-toggle"><input type="checkbox" id="rt-autorefresh" checked> Auto-oppdater (30 s)</label>
    </div>

    <div id="rt-sms-form" class="rt-sms-compose" hidden>
      <div class="rt-sms-compose-row">
        <label class="rt-sms-lbl">Til</label>
        <input id="rt-sms-number" class="rt-sms-input" placeholder="+47 …" type="tel" autocomplete="tel">
      </div>
      <div class="rt-sms-compose-row">
        <label class="rt-sms-lbl">Melding</label>
        <div class="rt-sms-textarea-wrap">
          <textarea id="rt-sms-message" class="rt-sms-textarea" placeholder="Skriv melding…" rows="3" maxlength="160"></textarea>
          <span class="rt-sms-counter" id="rt-sms-counter">0/160</span>
        </div>
      </div>
      <div class="rt-sms-compose-foot">
        <button class="btn-primary"   id="rt-sms-send"   style="font-size:11px;padding:8px 18px">Send</button>
        <button class="btn-secondary" id="rt-sms-cancel" style="font-size:11px;padding:7px 12px">Avbryt</button>
      </div>
    </div>

    <div id="rt-body"><div class="wx-load"><div class="spin"></div>Henter ruterstatus…</div></div>
  `;

  document.getElementById('rt-refresh').addEventListener('click', () => loadRouterStatus());
  document.getElementById('rt-reboot').addEventListener('click', doRouterReboot);
  document.getElementById('rt-sms-toggle').addEventListener('click', () => {
    const f = document.getElementById('rt-sms-form');
    f.hidden = !f.hidden;
    if (!f.hidden) document.getElementById('rt-sms-number').focus();
  });
  document.getElementById('rt-sms-cancel').addEventListener('click', () => {
    document.getElementById('rt-sms-form').hidden = true;
  });
  document.getElementById('rt-sms-send').addEventListener('click', doRouterSms);
  document.getElementById('rt-sms-message').addEventListener('input', (e) => {
    const n = e.target.value.length;
    const el = document.getElementById('rt-sms-counter');
    if (el) { el.textContent = `${n}/160`; el.style.color = n > 140 ? 'var(--warn)' : 'var(--ink-light)'; }
  });
  document.getElementById('rt-autorefresh').addEventListener('change', (e) => {
    if (e.target.checked) startRouterPolling();
    else                  stopRouterPolling();
  });

  await loadRouterStatus();
  startRouterPolling();
}

async function loadRouterStatus() {
  const body = document.getElementById('rt-body');
  if (!body) return;
  try {
    const [status, cfg, traffic] = await Promise.all([
      fetch(`${BASE()}/api/router/status`).then(r => r.json()),
      fetch(`${BASE()}/api/router/config`).then(r => r.json()),
      fetch(`${BASE()}/api/router/traffic`).then(r => r.json()).catch(() => null),
    ]);
    _routerReachable = !!status.reachable;
    body.innerHTML = renderRouterBody(status, cfg, traffic);

    if (_routerReachable) {
      loadWifiClients();
      loadSmsInbox();
      loadRouterCharts();
      loadDeviceTraffic();
      document.getElementById('rt-debug-btn')?.addEventListener('click', loadRouterDebug);
    }
  } catch (e) {
    body.innerHTML = `<div class="empty" style="padding:20px;color:var(--danger);font-size:12px">Feil: ${escapeHtml(e.message)}</div>`;
  }
}

function renderRouterBody(status, cfg, traffic) {
  if (!status.reachable) {
    return `
      <div class="rt-offline">
        <div class="rt-offline-icon">🔌</div>
        <div class="rt-offline-title">Ruteren er ikke tilgjengelig</div>
        <div class="rt-offline-reason">${escapeHtml(status.error || 'Ukjent årsak')}</div>
        <div class="rt-offline-steps">
          <strong>For å aktivere:</strong>
          <ol>
            <li>Koble RUT200 til strøm (9-30 V DC) og nettverk</li>
            <li>Sett <code>ROUTER_PASS=&lt;passord&gt;</code> i <code>backend/.env</code></li>
            <li>Sett evt. <code>ROUTER_IP</code> (standard: <code>192.168.1.1</code>) og <code>ROUTER_TLS=1</code> hvis HTTPS</li>
            <li>Synk og restart backend: <code>./sync-to-cerbo.sh</code></li>
          </ol>
        </div>
        <div class="rt-offline-cfg">
          <span>IP: <code>${escapeHtml(cfg.ip || '?')}</code></span>
          <span>Bruker: <code>${escapeHtml(cfg.user || '?')}</code></span>
          <span>Passord: <code>${cfg.passSet ? '✓ satt' : '⚠ ikke satt'}</code></span>
          <span>TLS: <code>${cfg.tls ? 'ja' : 'nei'}</code></span>
        </div>
      </div>
    `;
  }

  const m = status.mobile;
  const w = status.wan || {};
  const src = status.wanSource || 'none';

  // WAN-kilde — etikett, ikon og klasse
  const wanLabel = {
    cellular: 'SIM / Mobil',
    wifi:     'WiFi-hotspot',
    wan:      'Kablet WAN',
    none:     'Ingen tilkobling',
    unknown:  'Ukjent kilde',
  }[src] ?? src;
  const wanIcon = { cellular: '📶', wifi: '📡', wan: '🔌', none: '✗', unknown: '?' }[src] ?? '?';
  const wanCls  = w.up ? (src === 'cellular' ? 'excellent'
                       : src === 'wifi'      ? 'good'
                       : src === 'wan'       ? 'good'
                                              : 'fair')
                       : 'offline';

  const trafficSummary = (traffic && !traffic.error && (traffic.rx_bytes != null || traffic.tx_bytes != null))
    ? ` · ↓ ${fmtBytes(traffic.rx_bytes)} ↑ ${fmtBytes(traffic.tx_bytes)} (siden reset)`
    : '';

  const cellularHtml = m ? `
    <div class="cl-version-header" style="margin-top:14px;margin-bottom:8px">Mobilsignal</div>
    <div class="rt-cell-grid">
      ${rtStat('RSSI', fmtSignal(m.signal), '', signalBars(m.signal))}
      ${rtStat('SINR', fmtOrDash(m.sinr, ' dB'))}
      ${rtStat('RSRP', fmtOrDash(m.rsrp, ' dBm'))}
      ${rtStat('RSRQ', fmtOrDash(m.rsrq, ' dB'))}
      ${rtStat('Operatør', m.operator || '—')}
      ${rtStat('Nettverk', [m.networkType, m.band].filter(Boolean).join(' · ') || '—')}
    </div>
  ` : '';

  // Andre kolonne avhenger av WAN-kilde
  const col2 = (() => {
    if (src === 'wifi' && w.ssid) {
      return {
        lbl: 'Hotspot (SSID)',
        val: w.ssid,
        sub: [w.signal != null ? `${w.signal} dBm` : null,
              w.bitrate ? `${Math.round(w.bitrate / 1000)} Mbit/s` : null,
              w.encryption || null].filter(Boolean).join(' · ') || '—',
      };
    }
    if (src === 'cellular') {
      return {
        lbl: 'Signal',
        val: fmtSignal(m?.signal),
        sub: signalBars(m?.signal),
      };
    }
    return {
      lbl: 'Protokoll / interface',
      val: w.proto || '—',
      sub: w.ifname ? `${w.ifname}${w.device ? ' (' + w.device + ')' : ''}` : '—',
    };
  })();

  // Alternative WAN-kilder (vises hvis det finnes flere kandidater)
  const alts = (status.wanCandidates || []).filter(c => c.ifname !== w.ifname);
  const altsHtml = alts.length ? `
    <div class="rt-meta" style="margin-top:-8px;margin-bottom:14px;text-align:left;font-style:normal">
      Andre tilgjengelige kilder:
      ${alts.map(a => `<code style="margin-left:6px">${escapeHtml(a.source)} via ${escapeHtml(a.ifname)}${a.ipv4 ? ' (' + escapeHtml(a.ipv4) + ')' : ''}</code>`).join(' ')}
    </div>
  ` : '';

  // Diagnostikk hvis ingen WAN ble funnet (hjelper å skille "ingen nett" fra "klarte ikke å lese")
  const diag = status._diag || {};
  const noWanDiagHtml = src === 'none' ? `
    <div class="rt-nodata" style="margin-bottom:14px;flex-direction:column;align-items:flex-start;gap:6px">
      <div>
        <strong>Ingen WAN-kilde detektert.</strong>
        ${diag.dumpFallback ? '<code>network.interface.dump</code> feilet — brukte fallback med faste navn. ' : ''}
        ${diag.ifaceCount === 0 ? 'Ingen interfaces returnert fra ruteren.' : `Så ${diag.ifaceCount} interface(s), men ingen oppfylte WAN-kriteriene (oppe + IPv4 eller default-rute).`}
      </div>
      ${Array.isArray(diag.seenInterfaces) && diag.seenInterfaces.length ? `
        <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--ink-medium)">
          ${diag.seenInterfaces.map(i => `${i.name} (${i.up ? 'opp' : 'ned'}, ${i.proto || '?'}, ${i.hasIp4 ? 'IPv4' : 'no-ip'})`).join(' · ')}
        </div>
      ` : ''}
      <button class="rt-debug-btn" id="rt-debug-btn">Vis full ubus-diagnose</button>
      <div id="rt-debug-out" style="width:100%"></div>
    </div>
  ` : '';

  return `
    <div class="cl-version-header">Internett-tilkobling</div>
    <div class="rt-hero rt-hero-${wanCls}">
      <div class="rt-hero-row">
        <div class="rt-hero-cell">
          <div class="rt-hero-lbl">Kilde</div>
          <div class="rt-hero-val" style="font-size:1.5rem">${wanIcon}</div>
          <div class="rt-hero-sub"><strong>${escapeHtml(wanLabel)}</strong></div>
        </div>
        <div class="rt-hero-cell">
          <div class="rt-hero-lbl">${escapeHtml(col2.lbl)}</div>
          <div class="rt-hero-val" style="font-size:1rem">${escapeHtml(col2.val)}</div>
          <div class="rt-hero-sub">${escapeHtml(col2.sub)}</div>
        </div>
        <div class="rt-hero-cell">
          <div class="rt-hero-lbl">IP-adresse</div>
          <div class="rt-hero-val" style="font-size:1rem;font-family:'DM Mono',monospace">${escapeHtml(w.ipv4 || '—')}</div>
          <div class="rt-hero-sub">${w.uptime != null ? 'oppe ' + fmtUptime(w.uptime) : (w.up ? 'oppe' : 'nede')}</div>
        </div>
      </div>
    </div>
    ${altsHtml}
    ${noWanDiagHtml}

    ${cellularHtml}
    ${!status.hasSim ? `
      <div class="cl-version-header" style="margin-top:14px">Mobilsignal</div>
      <div class="rt-clients-empty">Ingen SIM-kort installert i ruteren.</div>
    ` : ''}

    <div class="rt-ruter-meta">
      Uptime: <strong>${fmtUptime(status.uptime)}</strong>
      · WiFi: <strong id="rt-wifi-client-count">…</strong>
      · SIM: <strong>${status.hasSim ? '✓ Installert' : '✗ Ikke installert'}</strong>${escapeHtml(trafficSummary)}
    </div>

    <div class="rt-charts-row">
      <div class="rt-chart-wrap">
        <div class="rt-chart-title">Mobilsignal · siste 6t</div>
        <div id="rt-signal-empty" class="rt-chart-empty">Historikk akkumuleres — grafen oppdateres automatisk.</div>
        <div id="rt-chart-signal-wrap" class="rt-chart-canvas-wrap" style="display:none"><canvas id="rt-signal-chart"></canvas></div>
      </div>
      <div class="rt-chart-wrap">
        <div class="rt-chart-title">Databruk · siste 6t</div>
        <div id="rt-usage-empty" class="rt-chart-empty">Historikk akkumuleres — grafen oppdateres automatisk.</div>
        <div id="rt-chart-usage-wrap" class="rt-chart-canvas-wrap" style="display:none"><canvas id="rt-usage-chart"></canvas></div>
      </div>
    </div>

    <div id="rt-clients-wrap" style="margin-top:16px"></div>
    <div id="rt-devices-wrap" style="margin-top:16px"></div>
    ${!status.hasSim ? `
      <div class="cl-version-header" style="margin-top:20px">SMS-innboks</div>
      <div class="rt-clients-empty">Ingen SIM-kort installert.</div>
    ` : '<div id="rt-sms-inbox-wrap" style="margin-top:20px"></div>'}

    <div class="rt-meta" style="margin-top:12px">Sist oppdatert ${new Date(status.ts).toLocaleTimeString('no')} · ${escapeHtml(cfg.ip)}${cfg.tls ? ' TLS' : ''}</div>
  `;
}

function rtStat(lbl, val, id = '', sub = null) {
  return `<div class="rt-stat">
    <div class="rt-stat-lbl">${lbl}</div>
    <div class="rt-stat-val"${id ? ` id="${id}"` : ''}>${escapeHtml(String(val))}</div>
    ${sub != null ? `<div class="rt-stat-sub">${escapeHtml(String(sub))}</div>` : ''}
  </div>`;
}

function signalClass(dbm) {
  if (dbm == null) return 'offline';
  if (dbm >= -70) return 'excellent';
  if (dbm >= -85) return 'good';
  if (dbm >= -100) return 'fair';
  return 'poor';
}
function fmtSignal(dbm) {
  return dbm == null ? '—' : `${dbm} dBm`;
}
function fmtDbm(dbm)      { return dbm == null ? '—' : `${dbm} dBm`; }
function fmtOrDash(v, u)  { return v == null ? '—' : `${v}${u || ''}`; }
function signalBars(dbm) {
  if (dbm == null) return '○○○○○';
  const bars = dbm >= -70 ? 5 : dbm >= -85 ? 4 : dbm >= -95 ? 3 : dbm >= -105 ? 2 : 1;
  return '●'.repeat(bars) + '○'.repeat(5 - bars);
}
function fmtUptime(s) {
  if (s == null) return '—';
  if (s < 60)   return '<1 min';
  const days = Math.floor(s / 86400);
  const hrs  = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}t`;
  if (hrs > 0)  return `${hrs}t ${mins}m`;
  return `${mins} min`;
}

async function loadWifiClients() {
  const wrap = document.getElementById('rt-clients-wrap');
  if (!wrap) return;
  try {
    const r = await fetch(`${BASE()}/api/router/wifi-clients`);
    if (!r.ok) return;
    const { clients } = await r.json();
    const count = clients?.length ?? 0;
    const countEl = document.getElementById('rt-wifi-client-count');
    if (countEl) countEl.textContent = String(count);
    wrap.innerHTML = `
      <div class="cl-version-header">WiFi-klienter${count ? ' (' + count + ')' : ''}</div>
      ${!count ? '<div class="rt-clients-empty">Ingen tilkoblet.</div>' : `
      <div class="rt-clients">
        ${clients.map(c => {
          const display = c.hostname || c.ip || (c.mac ? c.mac.toUpperCase() : '?');
          const sub     = (c.hostname && c.ip) ? c.ip : (c.hostname && !c.ip ? '' : '');
          const sig     = c.signal;
          const sigBars = sig == null ? '—'
            : sig >= -60 ? '▂▄▆█'
            : sig >= -70 ? '▂▄▆<span style="opacity:.3">█</span>'
            : sig >= -80 ? '▂▄<span style="opacity:.3">▆█</span>'
            : '▂<span style="opacity:.3">▄▆█</span>';
          const sigColor = sig == null ? 'var(--ink-light)'
            : sig >= -70 ? 'var(--ok)' : sig >= -85 ? 'var(--warn)' : 'var(--danger)';
          return `
          <div class="rt-client">
            <div class="rt-client-name">
              <span class="rt-client-host">${escapeHtml(display)}</span>
              ${sub ? `<span class="rt-client-ip">${escapeHtml(sub)}</span>` : ''}
            </div>
            <span class="rt-client-signal" style="color:${sigColor}">${sigBars}${sig != null ? ' ' + sig + ' dBm' : ''}</span>
          </div>`;
        }).join('')}
      </div>`}
    `;
  } catch {
    /* stille feil — ikke blokker hovedvisning */
  }
}

let _deviceTrafficHours = 24;

async function loadDeviceTraffic() {
  const wrap = document.getElementById('rt-devices-wrap');
  if (!wrap) return;
  try {
    const r = await fetch(`${BASE()}/api/router/devices?hours=${_deviceTrafficHours}`);
    if (!r.ok) return;
    const { rows = [] } = await r.json();

    // Pakke-fordeling, ikke bytes — vi kan bare vise relativ andel
    const total = rows.reduce((a, r) => a + (r.rx_packets || 0) + (r.tx_packets || 0), 0);
    const fmtPkts = n => {
      if (n == null) return '—';
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
      return String(n);
    };
    const labelFor = (h) =>
      h === 1   ? 'siste time'
      : h === 6 ? 'siste 6t'
      : h === 24 ? 'siste døgn'
      : h === 72 ? 'siste 3 døgn'
      : h === 168 ? 'siste uke'
      : `siste ${h}t`;

    const head = `
      <div class="cl-version-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span>Trafikkfordeling · ${labelFor(_deviceTrafficHours)}</span>
        <span class="rt-dev-range" id="rt-dev-range">
          ${[1, 6, 24, 72, 168].map(h =>
            `<button class="rt-dev-range-btn ${h === _deviceTrafficHours ? 'active' : ''}" data-h="${h}">${h < 24 ? h + 't' : (h / 24) + 'd'}</button>`
          ).join('')}
        </span>
      </div>
    `;

    if (!rows.length || total === 0) {
      wrap.innerHTML = `
        ${head}
        <div class="rt-clients-empty">
          Historikk akkumuleres — RUT200 logges hvert 2. minutt. Velg lengre vindu eller vent litt.
        </div>
        <div class="rt-dev-note">Pakker (ikke bytes) per WiFi-assosiering. God indikator på <em>relativ</em> bruk, men én videostream gir færre store pakker enn mange små chat-pakker.</div>
      `;
    } else {
      const top = rows.slice(0, 8);
      wrap.innerHTML = `
        ${head}
        <div class="rt-devices">
          ${top.map(r => {
            const sum = (r.rx_packets || 0) + (r.tx_packets || 0);
            const pct = total ? Math.round(sum / total * 1000) / 10 : 0;
            const display = r.alias || r.hostname || (r.mac || '').toLowerCase();
            // Sub-linje: vis hostname hvis alias finnes, ellers IP/MAC
            const subParts = [];
            if (r.alias && r.hostname) subParts.push(r.hostname);
            if (r.ip) subParts.push(r.ip);
            if (!r.hostname && !r.ip && r.mac) subParts.push(r.mac);
            const sub = subParts.join(' · ');
            return `
              <div class="rt-device" data-mac="${escapeHtml(r.mac || '')}" data-alias="${escapeHtml(r.alias || '')}">
                <div class="rt-device-row">
                  <span class="rt-device-name">
                    ${escapeHtml(display)}
                    <button class="rt-device-edit" title="Rediger navn">rediger</button>
                  </span>
                  <span class="rt-device-pct">${pct.toFixed(1)} %</span>
                </div>
                <div class="rt-device-bar"><div class="rt-device-bar-fill" style="width:${pct}%"></div></div>
                <div class="rt-device-meta">
                  ${sub ? `<span>${escapeHtml(sub)}</span>` : ''}
                  <span>↓ ${fmtPkts(r.rx_packets)} pakker</span>
                  <span>↑ ${fmtPkts(r.tx_packets)} pakker</span>
                </div>
              </div>`;
          }).join('')}
        </div>
        <div class="rt-dev-note">
          Pakker (ikke bytes) per WiFi-assosiering — relativ fordeling.
          Total ${fmtPkts(total)} pakker fra ${rows.length} ${rows.length === 1 ? 'enhet' : 'enheter'}.
        </div>
      `;
    }

    // Hook up range-buttons
    wrap.querySelectorAll('.rt-dev-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _deviceTrafficHours = parseInt(btn.dataset.h, 10);
        loadDeviceTraffic();
      });
    });

    // Hook up alias-edit-buttons
    wrap.querySelectorAll('.rt-device-edit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dev   = btn.closest('.rt-device');
        const mac   = dev?.dataset.mac;
        const cur   = dev?.dataset.alias || '';
        if (!mac) return;
        const next = prompt(`Navn for ${mac}\n(blank for å fjerne)`, cur);
        if (next === null) return;  // avbrutt
        const trimmed = next.trim();
        try {
          if (trimmed === '') {
            await fetch(`${BASE()}/api/router/aliases/${encodeURIComponent(mac)}`, { method: 'DELETE' });
          } else {
            const r = await fetch(`${BASE()}/api/router/aliases/${encodeURIComponent(mac)}`, {
              method:  'PUT',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ alias: trimmed }),
            });
            if (!r.ok) {
              const err = await r.json().catch(() => ({}));
              throw new Error(err.error || `HTTP ${r.status}`);
            }
          }
          loadDeviceTraffic();
        } catch (e) {
          alert('Kunne ikke lagre: ' + e.message);
        }
      });
    });
  } catch {
    /* stille feil */
  }
}

async function loadSmsInbox() {
  const wrap = document.getElementById('rt-sms-inbox-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="rt-sms-loading">Laster SMS-innboks…</div>';
  try {
    const r = await fetch(`${BASE()}/api/router/sms-inbox`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { messages } = await r.json();
    if (!messages?.length) {
      wrap.innerHTML = `
        <div class="cl-version-header">SMS-innboks</div>
        <div class="rt-clients-empty">Ingen innkommende SMS.</div>
      `;
      return;
    }
    wrap.innerHTML = `
      <div class="cl-version-header">SMS-innboks (${messages.length})</div>
      <div class="rt-sms-list">
        ${messages.map(m => `
          <div class="rt-sms-item">
            <div class="rt-sms-header">
              <span class="rt-sms-sender">${escapeHtml(m.sender || m.from || '?')}</span>
              <span class="rt-sms-date">${formatSmsDate(m.date || m.timestamp || '')}</span>
              <button class="rt-sms-del" data-index="${m.index ?? ''}" title="Slett">×</button>
            </div>
            <div class="rt-sms-body">${escapeHtml(m.message || m.text || '')}</div>
          </div>
        `).join('')}
      </div>
    `;
    wrap.querySelectorAll('.rt-sms-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Slette denne SMS-meldingen?')) return;
        try {
          await fetch(`${BASE()}/api/router/sms-inbox/${btn.dataset.index}`, { method: 'DELETE' });
          loadSmsInbox();
        } catch (e) {
          alert('Feil: ' + e.message);
        }
      });
    });
  } catch (e) {
    wrap.innerHTML = `
      <div class="cl-version-header">SMS-innboks</div>
      <div class="rt-clients-empty">Ikke tilgjengelig (${escapeHtml(e.message)})</div>
    `;
  }
}

async function loadRouterDebug() {
  const wrap = document.getElementById('rt-debug-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="rt-sms-loading">Kjører diagnostikk…</div>';
  try {
    const { results } = await fetch(`${BASE()}/api/router/debug`).then(r => r.json());
    wrap.innerHTML = `
      <div class="cl-version-header" style="margin-top:12px">Ubus-diagnose</div>
      <div class="rt-debug-table">
        ${results.map(r => `
          <div class="rt-debug-row rt-debug-${r.ok ? 'ok' : 'err'}">
            <code class="rt-debug-path">${escapeHtml(r.path)}</code>
            <span class="rt-debug-status">${r.ok ? '✓' : '✗ ' + escapeHtml(r.error || '')}</span>
            ${r.ok && r.data ? `<details><summary>Data</summary><pre class="rt-debug-pre">${escapeHtml(JSON.stringify(r.data, null, 2))}</pre></details>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    wrap.innerHTML = `<div class="rt-clients-empty">Diagnose feilet: ${escapeHtml(e.message)}</div>`;
  }
}

function formatSmsDate(str) {
  if (!str) return '';
  // RUT200-format: "YY/MM/DD,HH:MM:SS+TZ"
  const m = /^(\d{2})\/(\d{2})\/(\d{2}),(\d{2}:\d{2})/.exec(str);
  if (m) return `${m[3]}.${m[2]}.20${m[1]} ${m[4]}`;
  return str;
}

function fmtBytes(b) {
  if (b == null || b < 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function doRouterReboot() {
  if (!confirm('Reboot ruteren? Den vil være utilgjengelig i ~2 minutter.')) return;
  try {
    const r = await fetch(`${BASE()}/api/router/reboot`, { method: 'POST' });
    const d = await r.json();
    alert(d.message || d.error || 'Reboot sendt');
  } catch (e) {
    alert('Feil: ' + e.message);
  }
}

async function doRouterSms() {
  const number  = document.getElementById('rt-sms-number').value.trim();
  const message = document.getElementById('rt-sms-message').value.trim();
  if (!number || !message) { alert('Nummer + melding påkrevd'); return; }
  try {
    const r = await fetch(`${BASE()}/api/router/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, message }),
    });
    const d = await r.json();
    if (d.ok) {
      alert('SMS sendt.');
      document.getElementById('rt-sms-number').value  = '';
      document.getElementById('rt-sms-message').value = '';
      document.getElementById('rt-sms-form').hidden   = true;
    } else if (d.hint) {
      alert(d.error + '\n\n' + d.hint);
    } else {
      alert('Feil: ' + (d.error || 'ukjent'));
    }
  } catch (e) {
    alert('Feil: ' + e.message);
  }
}

function startRouterPolling() {
  stopRouterPolling();
  // Ikke poll hvis ruteren er kjent utilgjengelig (unngår støy + API-spam)
  if (_routerReachable === false) return;
  const checkbox = document.getElementById('rt-autorefresh');
  if (checkbox && !checkbox.checked) return;
  _routerPollTimer = setInterval(() => loadRouterStatus(), 30_000);
}

function stopRouterPolling() {
  if (_routerPollTimer) { clearInterval(_routerPollTimer); _routerPollTimer = null; }
}

// ── Router charts ────────────────────────────────────────────────────────────

const _rtCharts = {};

async function ensureChartJSRouter() {
  if (window.Chart) return;
  await new Promise((res, rej) => {
    if (document.querySelector('script[src*="chart.js"]')) { res(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function loadRouterCharts() {
  try {
    const r = await fetch(`${BASE()}/api/router/history?hours=6`);
    if (!r.ok) return;
    const { rows } = await r.json();
    await ensureChartJSRouter();
    renderSignalChart(rows || []);
    renderUsageChart(rows || []);
  } catch { /* stille — chart er ikke kritisk */ }
}

function renderSignalChart(rows) {
  if (_rtCharts.signal) { _rtCharts.signal.destroy(); delete _rtCharts.signal; }
  const wrap  = document.getElementById('rt-chart-signal-wrap');
  const empty = document.getElementById('rt-signal-empty');
  const canvas = document.getElementById('rt-signal-chart');
  const pts   = rows.filter(r => r.signal_dbm != null);
  if (!pts.length || !canvas || !window.Chart) {
    if (wrap)  wrap.style.display  = 'none';
    if (empty) empty.style.display = '';
    return;
  }
  wrap.style.display  = '';
  empty.style.display = 'none';

  const sigColor = dbm => dbm >= -70 ? '#1a7040' : dbm >= -85 ? '#b86000' : '#b01020';
  const sigBg    = dbm => dbm >= -70 ? 'rgba(26,112,64,0.10)' : dbm >= -85 ? 'rgba(184,96,0,0.10)' : 'rgba(176,16,32,0.10)';

  _rtCharts.signal = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: pts.map(r => new Date(r.ts).toLocaleTimeString('no', { hour: '2-digit', minute: '2-digit' })),
      datasets: [{
        label: 'RSSI',
        data: pts.map(r => r.signal_dbm),
        borderWidth: 1.5,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 3,
        segment: {
          borderColor: ctx => sigColor(ctx.p1.parsed.y),
          backgroundColor: ctx => sigBg(ctx.p1.parsed.y),
        },
        // fallback farge for første render
        borderColor: sigColor(pts[0]?.signal_dbm),
        backgroundColor: sigBg(pts[0]?.signal_dbm),
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.raw;
              const q = v >= -70 ? 'Utmerket' : v >= -85 ? 'Bra' : v >= -100 ? 'Variabelt' : 'Svakt';
              return `${v} dBm — ${q}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { color: '#f0f0f0' }, ticks: { font: { family: 'Barlow Condensed', size: 10 }, maxTicksLimit: 5, maxRotation: 0 } },
        y: { grid: { color: '#f0f0f0' }, ticks: { font: { family: 'DM Mono', size: 10 }, callback: v => v + ' dBm' } },
      },
    },
  });
}

function renderUsageChart(rows) {
  if (_rtCharts.usage) { _rtCharts.usage.destroy(); delete _rtCharts.usage; }
  const wrap  = document.getElementById('rt-chart-usage-wrap');
  const empty = document.getElementById('rt-usage-empty');
  const canvas = document.getElementById('rt-usage-chart');
  const pts   = rows.filter(r => r.rx_bytes != null || r.tx_bytes != null);
  if (!pts.length || !canvas || !window.Chart) {
    if (wrap)  wrap.style.display  = 'none';
    if (empty) empty.style.display = '';
    return;
  }
  wrap.style.display  = '';
  empty.style.display = 'none';

  const rx0  = pts[0].rx_bytes ?? 0;
  const tx0  = pts[0].tx_bytes ?? 0;
  const toMB = (b, b0) => b != null ? Math.round((b - b0) / 1024 / 1024 * 10) / 10 : null;

  _rtCharts.usage = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: pts.map(r => new Date(r.ts).toLocaleTimeString('no', { hour: '2-digit', minute: '2-digit' })),
      datasets: [
        {
          label: '↓ Ned',
          data: pts.map(r => toMB(r.rx_bytes, rx0)),
          borderColor: '#003b7e', backgroundColor: 'rgba(0,59,126,0.08)',
          borderWidth: 1.5, fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 3,
        },
        {
          label: '↑ Opp',
          data: pts.map(r => toMB(r.tx_bytes, tx0)),
          borderColor: '#b86000', backgroundColor: 'transparent',
          borderWidth: 1.5, fill: false, tension: 0.3, pointRadius: 0, pointHoverRadius: 3,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Barlow Condensed', size: 11 }, boxWidth: 10, padding: 8 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} MB` } },
      },
      scales: {
        x: { grid: { color: '#f0f0f0' }, ticks: { font: { family: 'Barlow Condensed', size: 10 }, maxTicksLimit: 5, maxRotation: 0 } },
        y: { grid: { color: '#f0f0f0' }, ticks: { font: { family: 'DM Mono', size: 10 }, callback: v => v + ' MB' } },
      },
    },
  });
}

// ══════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════
function styles() {
  return `<style>
    /* ── Tabs ── */
    .sys-tabs { display:flex; gap:0; margin-bottom:16px; border-bottom:1px solid var(--line); }
    .sys-tab {
      flex:1; padding:10px 12px; background:transparent; border:none; cursor:pointer;
      font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:12px;
      letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light);
      border-bottom:2px solid transparent; transition: color .15s, border-color .15s;
    }
    .sys-tab:hover { color:var(--ink); }
    .sys-tab-active { color:var(--blue); border-bottom-color:var(--blue); }
    .sys-panel[hidden] { display:none; }

    /* ── Arkitektur ── */
    .arch-intro { font-size:13px; line-height:1.8; color:var(--ink-medium); margin-bottom:24px; max-width:720px; }
    .arch-flow { margin-bottom:28px; }
    .arch-flow-title { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-light); margin-bottom:12px; }
    .arch-pipeline { display:flex; align-items:stretch; flex-wrap:wrap; gap:0; border:1px solid var(--line); overflow:hidden; }
    .arch-pipe-step { flex:1; min-width:100px; padding:14px 12px; background:var(--white); text-align:center; border-right:1px solid var(--line); }
    .arch-pipe-step:last-child { border-right:none; }
    .arch-pipe-step.plan { background:var(--surface); }
    .arch-pipe-icon { font-size:1.4rem; line-height:1; margin-bottom:6px; }
    .arch-pipe-label { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--ink); margin-bottom:3px; }
    .arch-pipe-sub { font-size:10px; color:var(--ink-light); line-height:1.5; }
    .arch-pipe-arrow { display:flex; align-items:center; padding:0 4px; font-size:1.2rem; color:var(--line); font-weight:300; }
    .arch-stack { display:grid; grid-template-columns:1fr; gap:12px; margin-bottom:24px; }
    @media (min-width:600px) { .arch-stack { grid-template-columns:1fr 1fr; } }
    .arch-card { border:1px solid var(--line); border-top:3px solid var(--blue); background:var(--white); padding:16px; }
    .arch-card-head { display:flex; gap:10px; align-items:flex-start; margin-bottom:10px; }
    .arch-card-icon { font-size:1.4rem; line-height:1; flex-shrink:0; margin-top:2px; }
    .arch-card-title { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:14px; letter-spacing:.04em; text-transform:uppercase; color:var(--ink); margin-bottom:2px; }
    .arch-card-sub { font-size:11px; color:var(--ink-light); }
    .arch-card-body { font-size:12px; line-height:1.7; color:var(--ink-medium); }
    .arch-card-body p { margin-bottom:8px; }
    .arch-card-body .ac { font-family:'DM Mono',monospace; font-size:11px; background:var(--surface); padding:1px 4px; }
    .arch-tag { display:inline-block; font-family:'Barlow Condensed',sans-serif; font-weight:600; font-size:9.5px; letter-spacing:.1em; text-transform:uppercase; padding:2px 8px; border:1px solid var(--line); color:var(--ink-light); margin-right:4px; margin-top:6px; }
    .arch-tag.ok   { border-color:var(--ok);   color:var(--ok);   background:var(--ok-tint); }
    .arch-tag.plan { border-color:var(--warn); color:var(--warn); background:var(--warn-tint); }
    .arch-note { font-size:11px; color:var(--ink-light); padding:12px 14px; background:var(--surface); border:1px solid var(--line); line-height:1.8; margin-bottom:24px; }

    /* ── Endringslogg ── */
    .cl-controls { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; align-items:center; }
    .cl-toggle   { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--ink-light); }
    .cl-select   { border:1px solid var(--line); padding:6px 8px; font-size:11px; background:var(--white); }
    #cl-form     { background:var(--surface); border:1px solid var(--line); padding:14px; margin-bottom:14px; }
    .cl-form-grid { display:grid; grid-template-columns:2fr 1fr 1fr; gap:8px; margin-bottom:8px; }
    @media (max-width:600px) { .cl-form-grid { grid-template-columns:1fr; } }
    .cl-form-input { font-family:inherit; font-size:12px; border:1px solid var(--line); padding:8px; background:var(--white); outline:none; }
    .cl-form-textarea { width:100%; resize:vertical; }
    .cl-group { margin-bottom:20px; }
    .cl-version-header { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:13px; letter-spacing:.08em; color:var(--blue); padding:8px 0 6px; border-bottom:1px solid var(--line); margin-bottom:8px; }
    .cl-entry { display:flex; gap:10px; padding:10px 4px; border-bottom:1px solid var(--line); align-items:flex-start; }
    .cl-entry:last-child { border-bottom:none; }
    .cl-entry-icon { font-size:16px; flex-shrink:0; line-height:1.4; }
    .cl-entry-body { flex:1; min-width:0; }
    .cl-entry-top  { display:flex; gap:8px; align-items:baseline; flex-wrap:wrap; margin-bottom:3px; }
    .cl-entry-type { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light); padding:1px 6px; border:1px solid var(--line); }
    .cl-entry-title{ font-size:13px; font-weight:600; color:var(--ink); }
    .cl-auto-badge { font-size:9px; background:var(--blue-tint); color:var(--blue); padding:1px 6px; letter-spacing:.08em; font-weight:700; text-transform:uppercase; }
    .cl-entry-desc { font-size:12px; color:var(--ink-medium); line-height:1.5; margin:3px 0; }
    .cl-entry-meta { font-size:10px; color:var(--ink-light); }
    .cl-del { background:none; border:none; cursor:pointer; color:var(--ink-light); font-size:18px; line-height:1; padding:0 6px; flex-shrink:0; }
    .cl-del:hover { color:var(--danger); }

    /* ── Features ── */
    .feat-controls { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; align-items:center; }
    #feat-form { background:var(--surface); border:1px solid var(--line); padding:14px; margin-bottom:14px; }
    .feat-group { margin-bottom:24px; }
    .feat-group-head {
      display:flex; align-items:center; gap:10px; padding:8px 12px;
      border-left:4px solid; border-bottom:1px solid var(--line);
      background:var(--surface); margin-bottom:0;
    }
    .feat-group-badge {
      font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:10px;
      padding:2px 8px; color:#fff; letter-spacing:.1em; text-transform:uppercase;
    }
    .feat-group-title { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink); flex:1; }
    .feat-group-count { font-size:11px; color:var(--ink-light); }
    .feat-items { display:flex; flex-direction:column; }
    .feat-item {
      display:flex; gap:10px; padding:12px 14px;
      background:var(--white); border:1px solid var(--line); border-top:none;
      border-left-width:4px;
    }
    .feat-item-done { background:#f8f9fb; border-left-color:var(--ink-light) !important; opacity:.8; }
    .feat-item-body { flex:1; min-width:0; }
    .feat-item-title { font-size:13px; font-weight:600; color:var(--ink); margin-bottom:3px; line-height:1.3; }
    .feat-item-desc  { font-size:12px; color:var(--ink-medium); line-height:1.5; }
    .feat-item-desc-empty { color:var(--ink-light); font-style:italic; }
    .feat-item-meta  { font-size:10px; color:var(--ink-light); margin-top:4px; }
    .feat-item-actions { display:flex; gap:4px; align-items:flex-start; flex-shrink:0; }
    .feat-prio-select { border:1px solid var(--line); background:var(--white); font-size:11px; padding:3px 6px; cursor:pointer; }
    .feat-btn { background:none; border:1px solid var(--line); cursor:pointer; width:28px; height:28px; font-size:13px; padding:0; color:var(--ink-light); display:flex; align-items:center; justify-content:center; }
    .feat-btn:hover { background:var(--surface); color:var(--ink); }
    .feat-complete:hover { border-color:var(--ok); color:var(--ok); }
    .feat-delete:hover   { border-color:var(--danger); color:var(--danger); }
    .feat-edit-input {
      width:100%; border:1px solid var(--blue); padding:4px 6px; font-family:inherit;
      font-size:13px; background:var(--white); outline:none;
    }
    .feat-edit-textarea { font-size:12px; resize:vertical; min-height:50px; }
    .feat-save-edit { width:auto !important; padding:0 10px; font-size:11px; border-color:var(--blue); color:var(--blue); font-weight:700; }
    .feat-cancel-edit { width:auto !important; padding:0 10px; font-size:11px; }

    /* ── Status ── */
    .st-ok     { color: var(--ok); }
    .st-warn   { color: var(--warn); }
    .st-danger { color: var(--danger); }

    /* ── Status-kort ── */
    .st-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
    @media (max-width:600px) { .st-cards { grid-template-columns:1fr; } }
    .st-card { padding:20px 16px; background:var(--white); border:1px solid var(--line); border-top:3px solid var(--blue); text-align:center; }
    .st-card-lbl { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-light); margin-bottom:8px; }
    .st-card-val { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:1.7rem; color:var(--ink); line-height:1.1; }
    .st-card-sub { font-size:11px; color:var(--ink-light); margin-top:5px; font-family:'DM Mono',monospace; }
    .st-card-sk-ok  { border-top-color:var(--ok); }
    .st-card-sk-ok .st-card-val  { color:var(--ok); }
    .st-card-sk-err { border-top-color:var(--danger); }
    .st-card-sk-err .st-card-val { color:var(--danger); }

    /* ── Metrikkrad (felles for Status og Konnektivitet) ── */
    .st-metric-row { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }

    /* ── Ingen modemdata + diagnose ── */
    .rt-nodata { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:10px 14px; background:var(--surface); border:1px solid var(--line); font-size:12px; color:var(--ink-light); font-style:italic; margin-bottom:4px; }
    .rt-nodata code { font-family:'DM Mono',monospace; font-size:10px; font-style:normal; }
    .rt-debug-btn { background:none; border:1px solid var(--line); font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:10px; letter-spacing:.08em; text-transform:uppercase; padding:4px 10px; cursor:pointer; color:var(--ink-light); font-style:normal; }
    .rt-debug-btn:hover { border-color:var(--blue); color:var(--blue); }
    .rt-debug-table { border:1px solid var(--line); background:var(--white); }
    .rt-debug-row { display:flex; gap:12px; padding:7px 12px; border-bottom:1px solid var(--line); align-items:flex-start; flex-wrap:wrap; }
    .rt-debug-row:last-child { border-bottom:none; }
    .rt-debug-ok { background:var(--ok-tint,#f0faf4); }
    .rt-debug-err { background:var(--surface); }
    .rt-debug-path { font-family:'DM Mono',monospace; font-size:11px; flex:1; min-width:200px; }
    .rt-debug-status { font-size:11px; color:var(--ink-light); }
    .rt-debug-ok .rt-debug-status { color:var(--ok); }
    .rt-debug-err .rt-debug-status { color:var(--danger); }
    .rt-debug-row details { width:100%; font-size:11px; }
    .rt-debug-pre { margin:6px 0 0; font-family:'DM Mono',monospace; font-size:10px; white-space:pre-wrap; overflow-x:auto; color:var(--ink-medium); }

    /* ── Ruter ── */
    .rt-controls { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; align-items:center; }
    .rt-form { background:var(--surface); border:1px solid var(--line); padding:14px; margin-bottom:14px; }

    .rt-offline { padding:20px; background:var(--surface); border:1px dashed var(--line); text-align:center; }
    .rt-offline-icon { font-size:2rem; margin-bottom:8px; }
    .rt-offline-title { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:14px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink); margin-bottom:4px; }
    .rt-offline-reason { font-size:12px; color:var(--ink-light); margin-bottom:14px; font-family:'DM Mono',monospace; }
    .rt-offline-steps { text-align:left; max-width:520px; margin:0 auto 14px; font-size:12px; color:var(--ink); line-height:1.7; }
    .rt-offline-steps code { font-family:'DM Mono',monospace; font-size:11px; background:var(--white); padding:1px 5px; border:1px solid var(--line); }
    .rt-offline-steps ol { margin:6px 0 0 20px; padding:0; }
    .rt-offline-cfg { display:flex; gap:14px; flex-wrap:wrap; justify-content:center; font-size:11px; color:var(--ink-light); }
    .rt-offline-cfg code { font-family:'DM Mono',monospace; font-size:11px; color:var(--ink); }

    .rt-hero { padding:14px; border:1px solid var(--line); background:var(--white); border-left:4px solid var(--line); margin-bottom:14px; }
    .rt-hero-excellent { border-left-color:#4caf50; }
    .rt-hero-good      { border-left-color:#8bc34a; }
    .rt-hero-fair      { border-left-color:#ffc107; }
    .rt-hero-poor      { border-left-color:#ff9800; }
    .rt-hero-offline   { border-left-color:#f44336; }
    .rt-hero-row { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    .rt-hero-cell { text-align:center; }
    .rt-hero-lbl { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light); }
    .rt-hero-val { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:1.3rem; color:var(--ink); margin:3px 0 2px; }
    .rt-hero-sub { font-size:11px; color:var(--ink-light); letter-spacing:.02em; }

    .rt-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
    @media (min-width:600px) { .rt-grid { grid-template-columns:repeat(5,1fr); } }
    .rt-stat { padding:8px 6px; background:var(--white); border:1px solid var(--line); text-align:center; }
    .rt-stat-lbl { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light); }
    .rt-stat-val { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:.95rem; color:var(--ink); margin-top:3px; }
    .rt-stat-sub { font-size:9px; color:var(--ink-light); letter-spacing:.04em; margin-top:2px; }

    .rt-cell-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:10px; }
    @media (min-width:500px) { .rt-cell-grid { grid-template-columns:repeat(6,1fr); } }

    .rt-ruter-meta { font-size:11px; color:var(--ink-light); padding:4px 0 10px; line-height:1.6; }
    .rt-ruter-meta strong { color:var(--ink); font-weight:600; }

    .rt-charts-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
    .rt-chart-wrap { border:1px solid var(--line); background:var(--white); padding:10px 10px 8px; }
    .rt-chart-title { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-light); margin-bottom:6px; }
    .rt-chart-empty { font-size:11px; color:var(--ink-light); font-style:italic; text-align:center; padding:16px 0; }
    .rt-chart-canvas-wrap { position:relative; height:160px; }

    .rt-meta { text-align:right; font-size:10px; color:var(--ink-light); margin-top:10px; font-style:italic; }
    .rt-clients { border:1px solid var(--line); background:var(--white); }
    .rt-client { display:flex; justify-content:space-between; align-items:center; padding:6px 12px; border-bottom:1px solid var(--line); font-size:12px; gap:8px; }
    .rt-client:last-child { border-bottom:none; }
    .rt-client-name { flex:1; min-width:0; }
    .rt-client-host { font-family:'DM Mono',monospace; font-weight:500; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rt-client-ip { font-size:10px; color:var(--ink-light); display:block; font-family:'DM Mono',monospace; }
    .rt-client-signal { font-family:'DM Mono',monospace; font-size:11px; white-space:nowrap; }
    .rt-clients-empty { padding:12px; background:var(--surface); border:1px solid var(--line); font-size:12px; color:var(--ink-light); text-align:center; font-style:italic; }

    /* ── Trafikkfordeling per enhet ── */
    .rt-dev-range { display:inline-flex; gap:2px; }
    .rt-dev-range-btn { background:none; border:1px solid var(--line); font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:10px; letter-spacing:.05em; padding:2px 8px; cursor:pointer; color:var(--ink-light); }
    .rt-dev-range-btn:hover { color:var(--blue); }
    .rt-dev-range-btn.active { background:var(--blue); color:var(--white); border-color:var(--blue); }
    .rt-devices { display:grid; gap:8px; }
    .rt-device { padding:8px 10px; background:var(--white); border:1px solid var(--line); }
    .rt-device-row { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
    .rt-device-name { font-family:'DM Mono',monospace; font-size:12px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:8px; min-width:0; }
    .rt-device-edit { font-family:'DM Mono',monospace; font-size:9px; color:var(--ink-light); background:none; border:none; padding:0; cursor:pointer; opacity:.4; transition:opacity .15s; text-transform:uppercase; letter-spacing:.05em; }
    .rt-device:hover .rt-device-edit, .rt-device-edit:hover, .rt-device-edit:focus { opacity:1; color:var(--blue); }
    .rt-device-pct { font-family:'DM Mono',monospace; font-size:12px; color:var(--blue); font-weight:600; white-space:nowrap; }
    .rt-device-bar { height:4px; background:var(--surface); margin:5px 0; }
    .rt-device-bar-fill { height:100%; background:var(--blue); }
    .rt-device-meta { display:flex; gap:12px; font-family:'DM Mono',monospace; font-size:10px; color:var(--ink-light); }
    .rt-dev-note { margin-top:6px; font-size:10px; color:var(--ink-light); font-style:italic; line-height:1.4; }

    /* ── Databruk ── */
    .rt-section { margin-top:16px; }
    .rt-section-title { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:13px; letter-spacing:.08em; color:var(--blue); padding:8px 0 6px; border-bottom:1px solid var(--line); margin-bottom:8px; text-transform:uppercase; }
    .rt-traffic-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .rt-traffic-cell { padding:14px; background:var(--white); border:1px solid var(--line); text-align:center; }
    .rt-traffic-lbl { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light); }
    .rt-traffic-val { font-family:'DM Mono',monospace; font-size:1.4rem; font-weight:600; color:var(--ink); margin:6px 0 2px; }
    .rt-traffic-sub { font-size:10px; color:var(--ink-light); }

    /* ── SMS compose-form ── */
    .rt-sms-compose { margin-top:10px; padding:14px; background:var(--white); border:1px solid var(--line); }
    .rt-sms-compose-row { display:grid; grid-template-columns:40px 1fr; gap:8px; align-items:start; margin-bottom:10px; }
    .rt-sms-lbl { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-light); padding-top:9px; }
    .rt-sms-input { width:100%; padding:7px 10px; border:1px solid var(--line); background:var(--surface); font-family:'DM Mono',monospace; font-size:13px; color:var(--ink); box-sizing:border-box; }
    .rt-sms-input:focus { outline:none; border-color:var(--blue); }
    .rt-sms-textarea-wrap { position:relative; }
    .rt-sms-textarea { width:100%; padding:7px 10px; border:1px solid var(--line); background:var(--surface); font-family:inherit; font-size:13px; color:var(--ink); resize:vertical; box-sizing:border-box; line-height:1.5; }
    .rt-sms-textarea:focus { outline:none; border-color:var(--blue); }
    .rt-sms-counter { position:absolute; bottom:6px; right:8px; font-family:'DM Mono',monospace; font-size:10px; color:var(--ink-light); pointer-events:none; }
    .rt-sms-compose-foot { display:flex; gap:8px; margin-top:4px; }

    /* ── SMS-innboks ── */
    .rt-sms-loading { padding:12px; font-size:12px; color:var(--ink-light); }
    .rt-sms-list { border:1px solid var(--line); background:var(--white); }
    .rt-sms-item { padding:10px 12px; border-bottom:1px solid var(--line); }
    .rt-sms-item:last-child { border-bottom:none; }
    .rt-sms-header { display:flex; gap:8px; align-items:baseline; margin-bottom:4px; }
    .rt-sms-sender { font-family:'DM Mono',monospace; font-size:11px; font-weight:600; color:var(--ink); flex:1; }
    .rt-sms-date { font-size:10px; color:var(--ink-light); white-space:nowrap; }
    .rt-sms-del { background:none; border:none; cursor:pointer; color:var(--ink-light); font-size:16px; line-height:1; padding:0 4px; }
    .rt-sms-del:hover { color:var(--danger); }
    .rt-sms-body { font-size:13px; color:var(--ink-medium); line-height:1.5; }
  </style>`;
}
