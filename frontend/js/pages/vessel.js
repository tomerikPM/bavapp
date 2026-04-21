// pages/vessel.js — båten: tabs for koblingsskjemaer, enheter og bilder
const BASE = () => localStorage.getItem('backend_url') || 'http://localhost:3001';

const CATEGORY_ORDER = [
  'Identifikasjon', 'Fremdrift', 'Elektrisk', 'Hekktruster',
  'Navigasjon', 'Kommunikasjon', 'Komfort', 'Tank', 'Digital',
];

// In-memory cache — hentes/refreshes når vi laster enheter-tabben og bilder-tabben
let _itemsCache  = [];
let _photosCache = [];

// Chat-kontekst per bilde — beholder samtalen med Claude så brukeren kan gi
// tilbakemelding og få nye forslag uten å sende bildet på nytt hver gang.
// key: photoId → { messages: [...], items: [...] }
const _chatContext = new Map();

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Båten</div>
      <div class="ph-s">Bavaria Sport 32 · FAR999</div>
    </div>

    <div class="vhero">
      <div class="vh-e">Bavaria Yachts · Giebelstadt · 2013</div>
      <div class="vh-t">Sport 32</div>
      <div class="vh-s">Cabincruiser · Hull DE-BAVE32A7K213 · Reg. FAR999</div>
      <div class="vh-st">
        <div><div class="vh-sl">Lengde</div><div class="vh-sv">35 fot</div></div>
        <div><div class="vh-sl">Bredde</div><div class="vh-sv">3,31 m</div></div>
        <div><div class="vh-sl">Dybde</div><div class="vh-sv">1,05 m</div></div>
        <div><div class="vh-sl">Vekt</div><div class="vh-sv">6 000 kg</div></div>
        <div><div class="vh-sl">Topphast.</div><div class="vh-sv">32 kn</div></div>
        <div><div class="vh-sl">Soveplasser</div><div class="vh-sv">4–5</div></div>
      </div>
    </div>

    <div class="v-tabs" role="tablist">
      <button class="v-tab v-tab-active" data-tab="diagrams" role="tab">Koblingsskjemaer</button>
      <button class="v-tab"               data-tab="items"    role="tab">Enheter</button>
      <button class="v-tab"               data-tab="photos"   role="tab">Bilder</button>
    </div>

    <div id="v-panel-diagrams" class="v-panel v-panel-active"></div>
    <div id="v-panel-items"    class="v-panel" hidden></div>
    <div id="v-panel-photos"   class="v-panel" hidden></div>

    <div class="arch-note" style="margin-top:20px">
      💡 Systemarkitektur, endringslogg og feature-oversikt er på <a href="#system">🧩 System</a>.
    </div>

    ${styles()}
  `;

  // Diagrammer-tab rendrer med en gang (lett)
  renderDiagramsTab(document.getElementById('v-panel-diagrams'));

  const loaded = { items: false, photos: false };
  container.querySelectorAll('.v-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      container.querySelectorAll('.v-tab').forEach(b => b.classList.toggle('v-tab-active', b === btn));
      for (const t of ['diagrams', 'items', 'photos']) {
        const el = document.getElementById('v-panel-' + t);
        el.hidden = t !== tab;
        el.classList.toggle('v-panel-active', t === tab);
      }
      if (tab === 'items' && !loaded.items) {
        loaded.items = true;
        renderItemsTab(document.getElementById('v-panel-items'));
      }
      if (tab === 'photos' && !loaded.photos) {
        loaded.photos = true;
        renderPhotosTab(document.getElementById('v-panel-photos'));
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// KOBLINGSSKJEMAER-TAB
// ══════════════════════════════════════════════════════════════════════
function renderDiagramsTab(panel) {
  panel.innerHTML = `
    <div class="diagram-frame-wrap">
      <iframe
        id="diagram-frame"
        src="/diagrams/"
        title="Koblingsskjemaer — Summer"
        class="diagram-frame"
      ></iframe>
      <div class="diagram-frame-fallback" id="diagram-fallback">
        <div>
          <div style="font-size:2rem;margin-bottom:12px">⚠</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">Koblingsskjema ikke bygget</div>
          <div style="font-size:12px;color:var(--ink-light);margin-bottom:16px;line-height:1.6">
            Kjør disse kommandoene for å bygge diagram-appen:
          </div>
          <code style="display:block;font-family:'DM Mono',monospace;font-size:11px;background:#f0f2f5;padding:10px 14px;line-height:2;white-space:pre;text-align:left">cd diagram-app
npm install
npm run build</code>
        </div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--ink-light);margin:6px 0 24px;font-style:italic">
      Diagrammer oppdateres automatisk når du endrer enheter under <strong>Enheter</strong>-taben.
    </div>
  `;

  const frame    = panel.querySelector('#diagram-frame');
  const fallback = panel.querySelector('#diagram-fallback');
  const timer = setTimeout(() => fallback?.classList.add('visible'), 3000);
  frame?.addEventListener('load', () => {
    clearTimeout(timer);
    fallback?.classList.remove('visible');
  });
}

// ══════════════════════════════════════════════════════════════════════
// ENHETER-TAB
// ══════════════════════════════════════════════════════════════════════
async function renderItemsTab(panel) {
  panel.innerHTML = `
    <div class="v-add-bar">
      <button class="btn-primary" id="v-add-btn" style="font-size:11px;padding:8px 14px">+ Legg til enhet</button>
    </div>

    <div id="v-add-form" class="v-form" hidden>
      <div class="v-form-grid">
        <input id="vf-label"    placeholder="Navn / etikett *"     class="v-inp v-inp-span">
        <input id="vf-value"    placeholder="Verdi / beskrivelse"  class="v-inp v-inp-span">
        <select id="vf-category" class="v-inp">
          ${CATEGORY_ORDER.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <input id="vf-slug"     placeholder="Slug (kun hvis på diagram)" class="v-inp">
        <input id="vf-model"    placeholder="Modell"              class="v-inp">
        <input id="vf-vendor"   placeholder="Leverandør"          class="v-inp">
        <input id="vf-serial"   placeholder="Serienummer"         class="v-inp">
        <input id="vf-install"  placeholder="Installasjonsdato (YYYY-MM-DD)" class="v-inp">
        <select id="vf-status" class="v-inp">
          <option value="installed">installert</option>
          <option value="planned">planlagt</option>
          <option value="removed">fjernet</option>
        </select>
      </div>
      <div style="margin:10px 0">
        <label class="v-chk"><input type="checkbox" id="vf-in-electrical"> Vis i elektrisk diagram</label>
        <label class="v-chk"><input type="checkbox" id="vf-in-nmea"> Vis i NMEA-diagram</label>
      </div>
      <div id="vf-diag-fields" hidden class="v-form-grid">
        <select id="vf-nodetype" class="v-inp">
          <option value="source">source (kilde)</option>
          <option value="controller">controller</option>
          <option value="battery">battery</option>
          <option value="panel">panel</option>
          <option value="engine">engine</option>
          <option value="consumer" selected>consumer (forbruker)</option>
          <option value="network">network</option>
        </select>
        <input id="vf-x"   placeholder="x (posisjon)" class="v-inp" type="number" value="0">
        <input id="vf-y"   placeholder="y (posisjon)" class="v-inp" type="number" value="0">
        <input id="vf-sub" placeholder="Undertekst på diagramnoden (flere linjer OK)" class="v-inp v-inp-span">
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-primary" id="vf-save" style="font-size:11px;padding:8px 14px">Lagre</button>
        <button class="btn-secondary" id="vf-cancel" style="font-size:11px;padding:7px 12px">Avbryt</button>
      </div>
    </div>

    <div id="v-cats"><div class="wx-load"><div class="spin"></div>Henter enheter…</div></div>
  `;

  // Skjema-toggle
  const addForm = panel.querySelector('#v-add-form');
  panel.querySelector('#v-add-btn').addEventListener('click', () => {
    addForm.hidden = !addForm.hidden;
    if (!addForm.hidden) panel.querySelector('#vf-label').focus();
  });
  panel.querySelector('#vf-cancel').addEventListener('click', () => {
    addForm.hidden = true;
    clearAddForm(panel);
  });
  const showDiagFields = () => {
    const show = panel.querySelector('#vf-in-electrical').checked
              || panel.querySelector('#vf-in-nmea').checked;
    panel.querySelector('#vf-diag-fields').hidden = !show;
  };
  panel.querySelector('#vf-in-electrical').addEventListener('change', showDiagFields);
  panel.querySelector('#vf-in-nmea').addEventListener('change', showDiagFields);
  panel.querySelector('#vf-save').addEventListener('click', () => saveNewItem(panel));

  await loadItems();
}

async function loadItems() {
  const root = document.getElementById('v-cats');
  if (!root) return;
  try {
    const [{ data: items }, { data: photos }] = await Promise.all([
      fetch(`${BASE()}/api/vessel/items`).then(r => r.json()),
      fetch(`${BASE()}/api/photos`).then(r => r.json()),
    ]);
    _itemsCache  = items;
    _photosCache = photos;

    // Map: itemId → photos[]
    const photosByItem = new Map();
    for (const p of photos) {
      if (p.linked_to_type === 'vessel_item' && p.linked_to_id) {
        const id = String(p.linked_to_id);
        if (!photosByItem.has(id)) photosByItem.set(id, []);
        photosByItem.get(id).push(p);
      }
    }

    const byCategory = new Map();
    for (const item of items) {
      if (!byCategory.has(item.category)) byCategory.set(item.category, []);
      byCategory.get(item.category).push(item);
    }

    const categories = [
      ...CATEGORY_ORDER.filter(c => byCategory.has(c)),
      ...[...byCategory.keys()].filter(c => !CATEGORY_ORDER.includes(c)),
    ];

    root.innerHTML = categories.map(cat => {
      const cats = byCategory.get(cat) || [];
      return `
        <div class="v-cat">
          <div class="v-cat-head">
            <div class="v-cat-title">${cat}</div>
            <div class="v-cat-count">${cats.length}</div>
          </div>
          ${cats.map(item => renderRow(item, photosByItem.get(String(item.id)) || [])).join('')}
        </div>`;
    }).join('');

    wireRowHandlers();
  } catch (e) {
    root.innerHTML = `<div class="empty" style="padding:20px;color:var(--danger)">Feil: ${e.message}</div>`;
  }
}

function renderRow(item, photos) {
  const diag     = item.diagram_data || {};
  const diagrams = Array.isArray(diag.diagrams) ? diag.diagrams : [];
  const diagBadge = diagrams.length
    ? `<span class="v-badge v-badge-diagram" title="På diagram: ${diagrams.join(', ')}">📐 ${diagrams.map(d => d==='electrical'?'El':'NMEA').join('+')}</span>`
    : '';
  const statusBadge = item.status === 'planned'
    ? '<span class="v-badge v-badge-planned">Planlagt</span>'
    : '';
  const rowCls = item.status === 'planned' ? 'v-row-planned'
               : item.status === 'removed' ? 'v-row-removed' : '';

  // Bildeminiatyrer — inline etter badges, samme høyde som badges
  const MAX_THUMBS = 6;
  const photoStrip = photos.length
    ? photos.slice(0, MAX_THUMBS).map(p => `<a href="${BASE()}/uploads/photos/${p.filename}" target="_blank" rel="noopener" class="v-photo-thumb" title="${escapeAttr(p.title || p.description || p.original_name || '')}"><img src="${BASE()}/uploads/photos/${p.filename}" alt="" loading="lazy"></a>`).join('')
      + (photos.length > MAX_THUMBS ? `<button class="v-photo-more" data-item-id="${item.id}" title="Se alle bildene">+${photos.length - MAX_THUMBS}</button>` : '')
    : '';

  return `
    <div class="v-row ${rowCls}" data-id="${item.id}">
      <div class="v-label">${escapeHtml(item.label)}</div>
      <div class="v-value-wrap">
        <div class="v-value${item.mono ? ' m' : ''}">
          ${escapeHtml(item.value || '')}${statusBadge}${diagBadge}${photoStrip}
        </div>
      </div>
      <div class="v-row-actions">
        <button class="v-btn v-edit"   data-id="${item.id}" title="Rediger">✏</button>
        <button class="v-btn v-delete" data-id="${item.id}" title="Slett">🗑</button>
      </div>
    </div>`;
}

function wireRowHandlers() {
  document.querySelectorAll('.v-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditInline(btn.dataset.id));
  });
  document.querySelectorAll('.v-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Slette denne enheten? Eventuelle koblinger i diagrammet fjernes også.')) return;
      await fetch(`${BASE()}/api/vessel/items/${btn.dataset.id}`, { method: 'DELETE' });
      await reloadDiagrams();
      loadItems();
    });
  });
  document.querySelectorAll('.v-photo-more').forEach(btn => {
    btn.addEventListener('click', () => {
      // Gå til Bilder-tab og filtrer på itemId
      document.querySelector('.v-tab[data-tab="photos"]')?.click();
      setTimeout(() => filterPhotosByItem(btn.dataset.itemId), 100);
    });
  });
}

async function openEditInline(id) {
  const row = document.querySelector(`.v-row[data-id="${id}"]`);
  if (!row) return;
  const item = await fetch(`${BASE()}/api/vessel/items/${id}`).then(r => r.json());
  const diag = item.diagram_data || {};
  const diagrams = Array.isArray(diag.diagrams) ? diag.diagrams : [];

  const editHtml = `
    <div class="v-edit-form">
      <div class="v-edit-row">
        <input data-f="label"  class="v-inp" placeholder="Navn *"  value="${escapeAttr(item.label || '')}">
        <input data-f="value"  class="v-inp" placeholder="Verdi"   value="${escapeAttr(item.value || '')}">
      </div>
      <div class="v-edit-row">
        <input data-f="model"  class="v-inp" placeholder="Modell"      value="${escapeAttr(item.model || '')}">
        <input data-f="vendor" class="v-inp" placeholder="Leverandør"  value="${escapeAttr(item.vendor || '')}">
      </div>
      <div class="v-edit-row">
        <input data-f="serial_number" class="v-inp" placeholder="Serienummer" value="${escapeAttr(item.serial_number || '')}">
        <input data-f="install_date"  class="v-inp" placeholder="Installert (YYYY-MM-DD)" value="${escapeAttr(item.install_date || '')}">
      </div>
      <div class="v-edit-row">
        <select data-f="status" class="v-inp">
          <option value="installed"${item.status==='installed'?' selected':''}>installert</option>
          <option value="planned"${item.status==='planned'?' selected':''}>planlagt</option>
          <option value="removed"${item.status==='removed'?' selected':''}>fjernet</option>
        </select>
        <input data-f="slug" class="v-inp" placeholder="Slug (for diagram)" value="${escapeAttr(item.slug || '')}">
      </div>
      <div>
        <label class="v-chk"><input type="checkbox" data-f="in_electrical" ${diagrams.includes('electrical')?'checked':''}> På elektrisk diagram</label>
        <label class="v-chk"><input type="checkbox" data-f="in_nmea" ${diagrams.includes('nmea')?'checked':''}> På NMEA-diagram</label>
      </div>
      <div class="v-edit-actions">
        <button class="v-edit-btn primary" id="v-edit-save-${id}">Lagre</button>
        <button class="v-edit-btn"         id="v-edit-cancel-${id}">Avbryt</button>
      </div>
    </div>`;

  row.insertAdjacentHTML('afterend', editHtml);
  row.style.display = 'none';

  document.getElementById(`v-edit-save-${id}`).addEventListener('click', async () => {
    const formEl = row.nextElementSibling;
    const patch = {};
    formEl.querySelectorAll('[data-f]').forEach(el => {
      const f = el.dataset.f;
      if (f === 'in_electrical' || f === 'in_nmea') return;
      patch[f] = el.value.trim();
    });
    const inEl   = formEl.querySelector('[data-f="in_electrical"]').checked;
    const inN2k  = formEl.querySelector('[data-f="in_nmea"]').checked;
    const diags  = [ inEl && 'electrical', inN2k && 'nmea' ].filter(Boolean);
    if (diags.length) {
      patch.diagram_data = {
        nodeType: diag.nodeType || 'consumer',
        x: diag.x ?? 0,
        y: diag.y ?? 0,
        ...(diag.sub ? { sub: diag.sub } : {}),
        ...(diag.badge ? { badge: diag.badge } : {}),
        diagrams: diags,
      };
      if (!patch.slug) { alert('Slug er påkrevd når enheten skal vises på diagram.'); return; }
    } else {
      patch.diagram_data = null;
    }
    await fetch(`${BASE()}/api/vessel/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await reloadDiagrams();
    loadItems();
  });

  document.getElementById(`v-edit-cancel-${id}`).addEventListener('click', () => loadItems());
}

async function saveNewItem(panel) {
  const label    = panel.querySelector('#vf-label').value.trim();
  if (!label) { alert('Navn er påkrevd'); return; }
  const inEl  = panel.querySelector('#vf-in-electrical').checked;
  const inN2k = panel.querySelector('#vf-in-nmea').checked;

  const body = {
    label,
    category:      panel.querySelector('#vf-category').value,
    value:         panel.querySelector('#vf-value').value.trim() || null,
    slug:          panel.querySelector('#vf-slug').value.trim()  || null,
    model:         panel.querySelector('#vf-model').value.trim() || null,
    vendor:        panel.querySelector('#vf-vendor').value.trim() || null,
    serial_number: panel.querySelector('#vf-serial').value.trim() || null,
    install_date:  panel.querySelector('#vf-install').value.trim() || null,
    status:        panel.querySelector('#vf-status').value,
  };

  if (inEl || inN2k) {
    if (!body.slug) { alert('Slug er påkrevd for diagram-noder (f.eks. "ny_sensor")'); return; }
    body.diagram_data = {
      nodeType: panel.querySelector('#vf-nodetype').value,
      x: parseInt(panel.querySelector('#vf-x').value || '0', 10),
      y: parseInt(panel.querySelector('#vf-y').value || '0', 10),
      sub: panel.querySelector('#vf-sub').value.trim() || null,
      diagrams: [ inEl && 'electrical', inN2k && 'nmea' ].filter(Boolean),
    };
  }

  const r = await fetch(`${BASE()}/api/vessel/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    alert('Kunne ikke lagre: ' + (e.error || r.status));
    return;
  }
  panel.querySelector('#v-add-form').hidden = true;
  clearAddForm(panel);
  await reloadDiagrams();
  loadItems();
}

function clearAddForm(panel) {
  ['vf-label','vf-value','vf-slug','vf-model','vf-vendor','vf-serial','vf-install','vf-sub']
    .forEach(id => { const el = panel.querySelector('#' + id); if (el) el.value = ''; });
  panel.querySelector('#vf-in-electrical').checked = false;
  panel.querySelector('#vf-in-nmea').checked = false;
  panel.querySelector('#vf-diag-fields').hidden = true;
  panel.querySelector('#vf-x').value = '0';
  panel.querySelector('#vf-y').value = '0';
}

async function reloadDiagrams() {
  const iframe = document.getElementById('diagram-frame');
  if (!iframe) return;
  try { iframe.contentWindow?.postMessage({ type: 'reload' }, '*'); } catch {}
  setTimeout(() => {
    try { iframe.contentWindow?.location?.reload(); }
    catch { iframe.src = iframe.src; }
  }, 200);
}

// ══════════════════════════════════════════════════════════════════════
// BILDER-TAB (portet fra system.js)
// ══════════════════════════════════════════════════════════════════════
let _photoFilterItemId = null;

async function renderPhotosTab(panel) {
  panel.innerHTML = `
    <div id="ph-dropzone" class="ph-dropzone">
      <div class="ph-dropzone-inner">
        <div class="ph-dropzone-icon">📸</div>
        <div class="ph-dropzone-text">
          <strong>Dra bilder hit</strong> eller
          <label class="ph-dropzone-browse">
            bla gjennom
            <input type="file" id="ph-file" accept="image/*,.heic,.heif" multiple hidden>
          </label>
        </div>
        <div class="ph-dropzone-hint">Flere bilder OK · JPG / PNG / WebP / HEIC (auto-konverteres) · maks 25 MB per fil</div>
      </div>
    </div>

    <div id="ph-filter-bar" class="ph-filter-bar" hidden></div>
    <div id="ph-upload-queue" class="ph-upload-queue" hidden></div>
    <div id="ph-gallery" class="ph-gallery">
      <div class="wx-load"><div class="spin"></div>Laster bilder…</div>
    </div>
  `;

  const dropzone = panel.querySelector('#ph-dropzone');
  const fileInput = panel.querySelector('#ph-file');

  fileInput.addEventListener('change', (e) => {
    const files = [...(e.target.files || [])];
    if (files.length) uploadPhotos(files);
    e.target.value = '';
  });

  ['dragenter','dragover'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.add('ph-dropzone-hover');
    });
    panel.addEventListener(ev, (e) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        dropzone.classList.add('ph-dropzone-hover');
      }
    });
  });
  ['dragleave','dragend'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.target === dropzone || !dropzone.contains(e.relatedTarget)) {
        dropzone.classList.remove('ph-dropzone-hover');
      }
    });
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    dropzone.classList.remove('ph-dropzone-hover');
    // HEIC får ofte tom mimetype utenfor Safari — godta hvis filnavnet ser riktig ut
    const isImageFile = f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
    const files = [...(e.dataTransfer?.files || [])].filter(isImageFile);
    if (files.length) uploadPhotos(files);
    else alert('Ingen bildefiler funnet i slippet.');
  });
  panel.addEventListener('drop', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      dropzone.classList.remove('ph-dropzone-hover');
    }
  });

  loadPhotos();
}

// Kalles fra Enheter-tab når bruker klikker "+N bilder"
export function filterPhotosByItem(itemId) {
  _photoFilterItemId = String(itemId);
  loadPhotos();
}

async function loadPhotos() {
  const gallery = document.getElementById('ph-gallery');
  const filterBar = document.getElementById('ph-filter-bar');
  if (!gallery) return;
  try {
    // Sørg for at items er lastet (trenger dropdown)
    if (!_itemsCache.length) {
      const { data } = await fetch(`${BASE()}/api/vessel/items`).then(r => r.json());
      _itemsCache = data;
    }
    const { data: allPhotos } = await fetch(`${BASE()}/api/photos`).then(r => r.json());
    _photosCache = allPhotos;

    const photos = _photoFilterItemId
      ? allPhotos.filter(p => p.linked_to_type === 'vessel_item' && String(p.linked_to_id) === _photoFilterItemId)
      : allPhotos;

    // Filter-bar vises kun når vi er filtrert
    if (_photoFilterItemId) {
      const item = _itemsCache.find(it => String(it.id) === _photoFilterItemId);
      filterBar.hidden = false;
      filterBar.innerHTML = `
        <span>Filtrert på: <strong>${escapeHtml(item?.label || '(ukjent)')}</strong> · ${photos.length} bilder</span>
        <button class="ph-filter-clear">Vis alle</button>
      `;
      filterBar.querySelector('.ph-filter-clear').addEventListener('click', () => {
        _photoFilterItemId = null;
        loadPhotos();
      });
    } else {
      filterBar.hidden = true;
      filterBar.innerHTML = '';
    }

    if (!photos.length) {
      const msg = _photoFilterItemId
        ? 'Ingen bilder koblet til denne enheten ennå.'
        : 'Ingen bilder enda. Last opp ditt første bilde ↑';
      gallery.innerHTML = `<div class="empty" style="padding:20px;text-align:center;color:var(--ink-light);font-size:12px">${msg}</div>`;
      return;
    }
    gallery.innerHTML = photos.map(p => renderPhotoCard(p, _itemsCache)).join('');
    wirePhotoHandlers();
  } catch (e) {
    gallery.innerHTML = `<div class="empty" style="padding:20px;color:var(--danger);font-size:12px">Feil: ${e.message}</div>`;
  }
}

function renderPhotoCard(p, items) {
  const imgUrl  = `${BASE()}/uploads/photos/${p.filename}`;
  const dt      = p.created_at ? new Date(p.created_at).toLocaleDateString('no', { day:'2-digit', month:'short', year:'2-digit' }) : '';
  const aiBadge = p.ai_analyzed_at
    ? '<span class="ph-ai-badge" title="Beskrevet av Claude Vision">🤖 AI-beskrevet</span>' : '';

  const selectedId = p.linked_to_type === 'vessel_item' ? p.linked_to_id : '';
  const grouped = new Map();
  for (const it of items) {
    if (!grouped.has(it.category)) grouped.set(it.category, []);
    grouped.get(it.category).push(it);
  }
  const dropdownOptions = [...grouped.entries()].map(([cat, list]) => `
    <optgroup label="${escapeAttr(cat)}">
      ${list.map(it => `<option value="${it.id}"${String(it.id)===String(selectedId)?' selected':''}>${escapeHtml(it.label)}${it.value ? ' — ' + escapeHtml(it.value.slice(0, 50)) : ''}</option>`).join('')}
    </optgroup>
  `).join('');

  return `
    <div class="ph-card" data-id="${p.id}">
      <a href="${imgUrl}" target="_blank" rel="noopener"><img src="${imgUrl}" alt="${escapeAttr(p.title || 'Bilde')}" loading="lazy" class="ph-thumb"></a>
      <div class="ph-body">
        <div class="ph-title-row">
          <input class="ph-title" data-field="title" value="${escapeAttr(p.title || '')}" placeholder="Tittel (klikk for å redigere)">
          ${aiBadge}
        </div>
        <textarea class="ph-desc" data-field="description" rows="3"
          placeholder="Beskrivelse (eller klikk 🤖 for AI-forslag)">${escapeHtml(p.description || '')}</textarea>
        <select class="ph-link-select" data-field="linked_to_id" title="Koble til en enhet">
          <option value="">— ikke koblet til en enhet —</option>
          ${dropdownOptions}
        </select>
        <input class="ph-link" data-field="linked_to_label" value="${escapeAttr(p.linked_to_label || '')}"
          placeholder="Eller fri merkelapp (f.eks. 'Generelt salongbilde')">
        <div class="ph-meta">${dt}</div>
        <div class="ph-actions">
          <button class="ph-btn ph-analyze" data-id="${p.id}" title="Foreslå beskrivelse + kobling med Claude Vision">🤖 Analyser</button>
          <button class="ph-btn ph-save"    data-id="${p.id}" title="Lagre endringer">Lagre</button>
          <button class="ph-btn ph-delete"  data-id="${p.id}" title="Slett bilde">🗑</button>
        </div>
        <div class="ph-ai-result" id="ph-ai-${p.id}" hidden></div>
      </div>
    </div>
  `;
}

function wirePhotoHandlers() {
  document.querySelectorAll('.ph-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.ph-card');
      const body = {};
      card.querySelectorAll('[data-field]').forEach(el => { body[el.dataset.field] = el.value; });
      if (body.linked_to_id) body.linked_to_type = 'vessel_item';
      else { body.linked_to_type = null; body.linked_to_id = null; }
      btn.disabled = true; btn.textContent = '…';
      try {
        await fetch(`${BASE()}/api/photos/${btn.dataset.id}`, {
          method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body),
        });
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent='Lagre'; btn.disabled=false; }, 1500);
      } catch (e) {
        alert('Kunne ikke lagre: ' + e.message);
        btn.textContent='Lagre'; btn.disabled=false;
      }
    });
  });
  document.querySelectorAll('.ph-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Slette dette bildet permanent?')) return;
      await fetch(`${BASE()}/api/photos/${btn.dataset.id}`, { method: 'DELETE' });
      loadPhotos();
    });
  });
  document.querySelectorAll('.ph-analyze').forEach(btn => {
    btn.addEventListener('click', () => analyzePhoto(btn.dataset.id, btn));
  });
}

async function uploadPhotos(files) {
  const queue = document.getElementById('ph-upload-queue');
  queue.hidden = false;
  queue.innerHTML = files.map((f, i) => `
    <div class="ph-upload-item" id="ph-upload-${i}">
      <span class="ph-upload-name">${escapeHtml(f.name)}</span>
      <span class="ph-upload-size">${(f.size/1024/1024).toFixed(1)} MB</span>
      <span class="ph-upload-state" data-i="${i}">⏳ venter…</span>
    </div>
  `).join('');

  const CONCURRENCY = 3;
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < files.length) {
      const i = idx++;
      const file = files[i];
      const stateEl = document.querySelector(`.ph-upload-state[data-i="${i}"]`);
      if (stateEl) stateEl.textContent = '↑ laster opp…';
      try {
        const form = new FormData();
        form.append('file', file);
        const r = await fetch(`${BASE()}/api/photos`, { method:'POST', body: form });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        results.push(await r.json());
        if (stateEl) stateEl.innerHTML = '<span style="color:var(--ok)">✓ ferdig</span>';
      } catch (e) {
        if (stateEl) stateEl.innerHTML = '<span style="color:var(--danger)">⚠ ' + escapeHtml(e.message) + '</span>';
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

  await loadPhotos();
  if (results.length === 1) {
    setTimeout(() => {
      const btn = document.querySelector(`.ph-analyze[data-id="${results[0].id}"]`);
      if (btn) analyzePhoto(results[0].id, btn);
    }, 300);
  }
  setTimeout(() => {
    queue.style.transition = 'opacity .4s';
    queue.style.opacity = '0';
    setTimeout(() => { queue.hidden = true; queue.style.opacity=''; queue.style.transition=''; }, 400);
  }, results.length > 1 ? 3500 : 1500);
}

// analyzePhoto støtter både første analyse OG iterasjon via userFeedback.
// Ved første kall bygges ctx fra bunnen (henter bilde + items, lager prompt).
// Ved feedback fortsetter samtalen — sender hele messages-array videre til Claude.
async function analyzePhoto(id, btn, userFeedback = null) {
  const apiKey = localStorage.getItem('api_key');
  if (!apiKey) { alert('Claude API-nøkkel mangler. Sett den i Innstillinger først.'); return; }

  const card     = document.querySelector(`.ph-card[data-id="${id}"]`);
  const descEl   = card?.querySelector('[data-field="description"]');
  const selectEl = card?.querySelector('[data-field="linked_to_id"]');
  const resultEl = document.getElementById('ph-ai-' + id);
  const imgEl    = card?.querySelector('.ph-thumb');
  if (!card || !descEl || !imgEl) return;

  btn.disabled = true;
  btn.textContent = userFeedback ? '🔄' : '⏳';

  try {
    let ctx = _chatContext.get(id);

    // Hvis ingen context, eller vi ikke har userFeedback (brukeren startet ny analyse), bygg fra bunnen
    if (!ctx || !userFeedback) {
      const [blob, items] = await Promise.all([
        fetch(imgEl.src).then(r => r.blob()),
        _itemsCache.length ? Promise.resolve(_itemsCache)
                           : fetch(`${BASE()}/api/vessel/items`).then(r => r.json()).then(x => x.data),
      ]);
      _itemsCache = items;
      const base64 = await blobToBase64(blob);
      const mime   = blob.type || 'image/jpeg';
      const itemsList = items.map(it => {
        const extra = [it.model, it.value].filter(Boolean).join(' · ').slice(0, 80);
        return `${it.id}: [${it.category}] ${it.label}${extra ? ' — ' + extra : ''}`;
      }).join('\n');

      const prompt = `Du analyserer et bilde av en båtinstallasjon på en Bavaria Sport 32 motorbåt "Summer" (FAR999).

REGISTRERTE ENHETER OM BORD:
${itemsList}

Returner ET JSON-OBJEKT med nøyaktig disse tre feltene:
{
  "description": "Kort beskrivelse på norsk (2-4 setninger). Fokuser på produktnavn/modell, tekniske detaljer og plassering. Skriv direkte om installasjonen, ikke 'bildet viser...'.",
  "suggestedItemId": <tall eller null>,
  "suggestedReason": "<streng eller null> — én setning som forklarer valget"
}

Returner KUN JSON-objektet, ingen kodeblokk.`;

      ctx = {
        items,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
            { type: 'text',  text: prompt },
          ],
        }],
      };
      _chatContext.set(id, ctx);
    } else {
      // Iterasjon — legg til brukerens tilbakemelding
      ctx.messages.push({
        role: 'user',
        content: `Tilbakemelding: ${userFeedback}

Returner OPPDATERT JSON-objekt i nøyaktig samme format (description / suggestedItemId / suggestedReason). Ingen kodeblokk.`,
      });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':'application/json', 'x-api-key':apiKey,
        'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: ctx.messages,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || `HTTP ${res.status}`);
    }
    const data    = await res.json();
    const rawText = data.content?.filter(b => b.type === 'text').map(b => b.text).join('').trim() || '';

    // Lagre assistant-respons for neste iterasjon
    ctx.messages.push({ role: 'assistant', content: rawText });

    let parsed;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { description: rawText, suggestedItemId: null, suggestedReason: null };
    }

    renderAIResult(id, parsed, ctx.items, descEl, selectEl, resultEl);
  } catch (e) {
    alert('AI-analyse feilet: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 Analyser';
  }
}

function renderAIResult(photoId, parsed, items, descEl, selectEl, resultEl) {
  const suggestedDesc   = String(parsed.description || '').trim();
  const suggestedItemId = parsed.suggestedItemId || null;
  const suggestedReason = parsed.suggestedReason ? String(parsed.suggestedReason).trim() : null;
  const suggestedItem   = suggestedItemId ? items.find(it => String(it.id) === String(suggestedItemId)) : null;
  const ctx             = _chatContext.get(photoId);
  const turnCount       = ctx ? Math.floor(ctx.messages.length / 2) : 1;

  const itemSuggestionHtml = suggestedItem ? `
    <div class="ph-ai-item">
      <div class="ph-ai-item-label">Foreslår kobling til:</div>
      <div class="ph-ai-item-value">
        <strong>${escapeHtml(suggestedItem.label)}</strong>
        <span class="ph-ai-item-cat">${escapeHtml(suggestedItem.category)}</span>
      </div>
      ${suggestedReason ? `<div class="ph-ai-item-reason">${escapeHtml(suggestedReason)}</div>` : ''}
    </div>
  ` : (suggestedItemId === null ? '<div class="ph-ai-item-none">Fant ikke en passende enhet i lista — forslag kun for beskrivelse.</div>' : '');

  const turnBadge = turnCount > 1
    ? `<span class="ph-ai-turn" title="Iterasjon ${turnCount}">· runde ${turnCount}</span>`
    : '';

  resultEl.hidden = false;
  resultEl.innerHTML = `
    <div class="ph-ai-result-title">🤖 Claude-forslag${turnBadge}</div>
    <div class="ph-ai-result-text">${escapeHtml(suggestedDesc)}</div>
    ${itemSuggestionHtml}
    <div class="ph-ai-actions">
      <button class="ph-btn ph-use-ai">Bruk ${suggestedItem ? 'beskrivelse + kobling' : 'beskrivelse'}</button>
      ${suggestedItem ? '<button class="ph-btn ph-use-desc-only">Kun beskrivelse</button>' : ''}
      <button class="ph-btn ph-dismiss-ai">Avvis</button>
    </div>

    <div class="ph-ai-chat">
      <div class="ph-ai-chat-label">💬 Gi tilbakemelding for nytt forslag:</div>
      <textarea class="ph-ai-chat-input" rows="2"
        placeholder="F.eks. 'Dette er ikke SmartShunt — ser på etiketten det er BMV-712' eller 'Legg til at den er montert bak sikringsskapet'"></textarea>
      <div class="ph-ai-chat-actions">
        <button class="ph-btn ph-ai-retry">🔄 Prøv igjen</button>
        <span class="ph-ai-chat-hint">Shift+Enter for ny linje · Enter for å sende</span>
      </div>
    </div>
  `;

  const applyChanges = async (includeItem) => {
    descEl.value = suggestedDesc;
    const body = { description: suggestedDesc, ai_analyzed_at: new Date().toISOString() };
    if (includeItem && suggestedItem) {
      body.linked_to_type = 'vessel_item';
      body.linked_to_id   = String(suggestedItem.id);
      if (selectEl) selectEl.value = String(suggestedItem.id);
    }
    await fetch(`${BASE()}/api/photos/${photoId}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body),
    });
    _chatContext.delete(photoId);
    resultEl.hidden = true;
    loadPhotos();
  };

  resultEl.querySelector('.ph-use-ai').addEventListener('click', () => applyChanges(true));
  resultEl.querySelector('.ph-use-desc-only')?.addEventListener('click', () => applyChanges(false));
  resultEl.querySelector('.ph-dismiss-ai').addEventListener('click', () => {
    _chatContext.delete(photoId);
    resultEl.hidden = true;
  });

  // Feedback → ny iterasjon
  const inputEl = resultEl.querySelector('.ph-ai-chat-input');
  const retryBtn = resultEl.querySelector('.ph-ai-retry');

  const submitFeedback = async () => {
    const feedback = inputEl.value.trim();
    if (!feedback) { inputEl.focus(); return; }
    inputEl.value = '';
    // Bruk samme knapp-referanse fra opprinnelig 🤖 Analyser-button på kortet
    const card = document.querySelector(`.ph-card[data-id="${photoId}"]`);
    const origBtn = card?.querySelector('.ph-analyze');
    if (origBtn) await analyzePhoto(photoId, origBtn, feedback);
  };

  retryBtn.addEventListener('click', submitFeedback);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitFeedback();
    }
  });
  inputEl.focus();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1]);
    r.onerror   = reject;
    r.readAsDataURL(blob);
  });
}

// ── Utils ───────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

// ══════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════
function styles() {
  return `<style>
    /* Tabs */
    .v-tabs { display:flex; gap:0; margin-bottom:16px; border-bottom:1px solid var(--line); }
    .v-tab {
      flex:1; padding:10px 12px; background:transparent; border:none; cursor:pointer;
      font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:12px;
      letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light);
      border-bottom:2px solid transparent; transition: color .15s, border-color .15s;
    }
    .v-tab:hover { color:var(--ink); }
    .v-tab-active { color:var(--blue); border-bottom-color:var(--blue); }
    .v-panel[hidden] { display:none; }

    /* Diagram-iframe */
    .diagram-frame-wrap { position:relative; width:100%; height:580px; border:1px solid var(--line); overflow:hidden; margin-bottom:8px; background:#f0f2f5; }
    .diagram-frame { width:100%; height:100%; border:none; display:block; }
    .diagram-frame-fallback { display:none; position:absolute; inset:0; align-items:center; justify-content:center; background:var(--surface); text-align:center; padding:40px; }
    .diagram-frame-fallback.visible { display:flex; }

    .arch-note { font-size:12px; color:var(--ink-light); padding:12px 14px; background:var(--surface); border:1px solid var(--line); line-height:1.7; }
    .arch-note a { color:var(--blue); text-decoration:none; font-weight:600; }
    .arch-note a:hover { text-decoration:underline; }

    /* Enheter-editor */
    .v-add-bar { margin-bottom:12px; }
    .v-form { background:var(--surface); border:1px solid var(--line); padding:14px; margin-bottom:16px; }
    .v-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
    @media (min-width:700px) { .v-form-grid { grid-template-columns:1fr 1fr 1fr; } }
    .v-inp { font-family:inherit; font-size:12px; border:1px solid var(--line); background:var(--white); padding:8px; outline:none; }
    .v-inp:focus { border-color:var(--blue); }
    .v-inp-span { grid-column:1/-1; }
    .v-chk { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--ink); margin-right:16px; }

    .v-cat { margin-bottom:22px; border:1px solid var(--line); }
    .v-cat-head { display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--surface); border-bottom:1px solid var(--line); }
    .v-cat-title { flex:1; font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:var(--blue); }
    .v-cat-count { font-size:11px; color:var(--ink-light); }
    .v-row { display:grid; grid-template-columns:150px 1fr auto; gap:10px; padding:8px 12px; align-items:start; border-bottom:1px solid var(--line); background:var(--white); }
    .v-row:last-child { border-bottom:none; }
    .v-row-planned { opacity:.7; }
    .v-row-removed { opacity:.4; text-decoration:line-through; }
    .v-label { font-family:'Barlow Condensed',sans-serif; font-weight:600; font-size:12px; letter-spacing:.03em; color:var(--ink-light); text-transform:uppercase; padding-top:3px; }
    .v-value-wrap { min-width:0; }
    .v-value { font-size:13px; color:var(--ink); word-break:break-word; }
    .v-value.m { font-family:'DM Mono',monospace; font-size:12px; }
    .v-badge { font-size:9px; padding:1px 6px; border:1px solid; margin-left:6px; vertical-align:middle; font-family:'Barlow Condensed',sans-serif; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
    .v-badge-planned { border-color:var(--warn); color:var(--warn); background:var(--warn-tint); }
    .v-badge-diagram { border-color:var(--blue); color:var(--blue); background:var(--blue-tint); }
    .v-row-actions { display:flex; gap:4px; flex-shrink:0; }
    .v-btn { border:1px solid var(--line); background:var(--white); cursor:pointer; width:28px; height:28px; padding:0; font-size:13px; color:var(--ink-light); display:flex; align-items:center; justify-content:center; }
    .v-btn:hover { background:var(--surface); color:var(--ink); }
    .v-btn.v-edit:hover   { border-color:var(--blue); color:var(--blue); }
    .v-btn.v-delete:hover { border-color:var(--danger); color:var(--danger); }

    /* Bildeminiatyrer på enhet-rad — inline, samme høyde som badges */
    .v-photo-thumb {
      display:inline-block; width:18px; height:18px; margin-left:4px;
      overflow:hidden; border:1px solid var(--line); background:var(--surface);
      vertical-align:middle; transition: transform .1s, border-color .15s;
    }
    .v-photo-thumb:hover { border-color:var(--blue); transform: scale(1.15); }
    .v-photo-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
    .v-photo-more {
      display:inline-block; height:18px; min-width:22px; padding:0 4px;
      margin-left:4px; background:var(--surface); border:1px dashed var(--line);
      cursor:pointer; font-family:'Barlow Condensed',sans-serif; font-weight:700;
      font-size:9px; color:var(--blue); line-height:16px; vertical-align:middle;
      letter-spacing:.04em;
    }
    .v-photo-more:hover { background:var(--blue-tint); border-color:var(--blue); }

    .v-edit-form { padding:10px 12px; background:var(--blue-tint); border-bottom:1px solid var(--line); }
    .v-edit-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:6px; }
    @media (max-width:600px) { .v-edit-row { grid-template-columns:1fr; } }
    .v-edit-actions { display:flex; gap:6px; margin-top:6px; }
    .v-edit-btn { border:1px solid var(--line); background:var(--white); padding:5px 12px; font-family:inherit; font-size:11px; cursor:pointer; }
    .v-edit-btn.primary { background:var(--blue); color:#fff; border-color:var(--blue); font-weight:700; }

    /* Bilder-tab */
    .ph-dropzone {
      border:2px dashed var(--line); background:var(--surface);
      padding:24px; margin-bottom:14px; text-align:center;
      transition:border-color .15s, background .15s, transform .1s; cursor:pointer;
    }
    .ph-dropzone:hover { border-color:var(--blue); }
    .ph-dropzone-hover { border-color:var(--blue) !important; background:var(--blue-tint) !important; transform:scale(1.01); }
    .ph-dropzone-inner { display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none; }
    .ph-dropzone-icon { font-size:2rem; line-height:1; }
    .ph-dropzone-text { font-size:13px; color:var(--ink); }
    .ph-dropzone-browse { color:var(--blue); font-weight:700; cursor:pointer; pointer-events:auto; text-decoration:underline; }
    .ph-dropzone-browse:hover { opacity:.8; }
    .ph-dropzone-hint { font-size:11px; color:var(--ink-light); }

    .ph-filter-bar {
      display:flex; justify-content:space-between; align-items:center;
      padding:8px 12px; background:var(--blue-tint); border:1px solid var(--blue);
      margin-bottom:12px; font-size:12px;
    }
    .ph-filter-clear {
      border:1px solid var(--blue); background:var(--white); color:var(--blue);
      font-size:11px; padding:4px 10px; cursor:pointer; font-family:inherit;
    }
    .ph-filter-clear:hover { background:var(--blue); color:#fff; }

    .ph-upload-queue { margin-bottom:14px; border:1px solid var(--line); background:var(--white); }
    .ph-upload-item { display:grid; grid-template-columns:1fr auto auto; gap:10px; align-items:center; padding:6px 12px; border-bottom:1px solid var(--line); font-size:12px; }
    .ph-upload-item:last-child { border-bottom:none; }
    .ph-upload-name { color:var(--ink); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ph-upload-size { color:var(--ink-light); font-size:10px; font-family:'DM Mono',monospace; }
    .ph-upload-state { font-size:11px; color:var(--ink-light); font-family:'Barlow Condensed',sans-serif; letter-spacing:.04em; }

    .ph-gallery { display:grid; gap:16px; grid-template-columns:1fr; }
    @media (min-width:720px) { .ph-gallery { grid-template-columns:1fr 1fr; } }
    .ph-card { display:grid; grid-template-columns:120px 1fr; gap:12px; border:1px solid var(--line); background:var(--white); padding:10px; }
    @media (min-width:500px) { .ph-card { grid-template-columns:160px 1fr; } }
    .ph-thumb { width:100%; aspect-ratio:1; object-fit:cover; background:var(--surface); cursor:zoom-in; }
    .ph-body  { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .ph-title-row { display:flex; align-items:center; gap:8px; }
    .ph-title { flex:1; font-size:13px; font-weight:600; color:var(--ink); border:none; border-bottom:1px solid transparent; padding:2px 0; background:transparent; font-family:inherit; min-width:0; }
    .ph-title:focus { outline:none; border-bottom-color:var(--blue); }
    .ph-ai-badge { font-size:9px; padding:1px 6px; background:var(--blue-tint); color:var(--blue); font-family:'Barlow Condensed',sans-serif; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
    .ph-desc, .ph-link, .ph-link-select { width:100%; border:1px solid var(--line); background:var(--white); padding:6px 8px; font-family:inherit; font-size:12px; resize:vertical; }
    .ph-desc:focus, .ph-link:focus, .ph-link-select:focus { outline:none; border-color:var(--blue); }
    .ph-link-select { cursor:pointer; }
    .ph-meta  { font-size:10px; color:var(--ink-light); }
    .ph-actions { display:flex; gap:6px; flex-wrap:wrap; }
    .ph-btn { border:1px solid var(--line); background:var(--white); cursor:pointer; padding:4px 10px; font-size:11px; font-family:inherit; color:var(--ink); font-weight:600; }
    .ph-btn:hover { background:var(--surface); }
    .ph-analyze:hover { border-color:var(--blue); color:var(--blue); }
    .ph-save:hover    { border-color:var(--ok);   color:var(--ok); }
    .ph-delete:hover  { border-color:var(--danger); color:var(--danger); }
    .ph-btn:disabled  { opacity:.5; cursor:default; }
    .ph-ai-result { margin-top:8px; padding:10px 12px; background:var(--blue-tint); border-left:3px solid var(--blue); font-size:12px; line-height:1.5; }
    .ph-ai-result-title { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--blue); margin-bottom:6px; }
    .ph-ai-result-text { color:var(--ink); margin-bottom:8px; }
    .ph-ai-item { margin:10px 0 12px; padding:8px 10px; background:rgba(255,255,255,.7); border-left:3px solid var(--ok); font-size:12px; line-height:1.5; }
    .ph-ai-item-label { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light); margin-bottom:3px; }
    .ph-ai-item-value strong { color:var(--ink); font-weight:700; }
    .ph-ai-item-cat { display:inline-block; margin-left:8px; font-size:10px; padding:1px 6px; background:var(--surface); color:var(--ink-light); font-family:'Barlow Condensed',sans-serif; font-weight:600; letter-spacing:.06em; text-transform:uppercase; }
    .ph-ai-item-reason { margin-top:4px; font-size:11px; color:var(--ink-light); font-style:italic; }
    .ph-ai-item-none { margin:8px 0; font-size:11px; color:var(--ink-light); font-style:italic; }
    .ph-ai-actions { display:flex; gap:6px; flex-wrap:wrap; }
    .ph-use-ai:hover     { background:var(--blue); color:#fff; border-color:var(--blue); }
    .ph-dismiss-ai:hover { border-color:var(--ink-light); }

    /* Chat-iterasjon med Claude */
    .ph-ai-turn {
      margin-left:6px; font-size:10px; color:var(--ink-light);
      font-family:'Barlow Condensed',sans-serif; font-weight:600;
      letter-spacing:.06em; text-transform:none;
    }
    .ph-ai-chat {
      margin-top:12px; padding-top:10px; border-top:1px dashed rgba(0,0,0,.1);
    }
    .ph-ai-chat-label {
      font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:10px;
      letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light); margin-bottom:4px;
    }
    .ph-ai-chat-input {
      width:100%; border:1px solid var(--line); background:var(--white);
      padding:6px 8px; font-family:inherit; font-size:12px; resize:vertical; line-height:1.5;
    }
    .ph-ai-chat-input:focus { outline:none; border-color:var(--blue); }
    .ph-ai-chat-actions { display:flex; gap:8px; align-items:center; margin-top:6px; }
    .ph-ai-retry:hover { border-color:var(--blue); color:var(--blue); }
    .ph-ai-chat-hint { font-size:10px; color:var(--ink-light); font-style:italic; }
  </style>`;
}
