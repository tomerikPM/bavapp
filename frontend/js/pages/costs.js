// pages/costs.js — kostnadslogg for Summer
import { costs, trips } from '../api.js';
import { toast } from '../app.js';
import { openScanner } from './scanner.js';
import * as SK from '../signalk.js';

const CATEGORIES = [
  { id: 'fuel',        label: 'Drivstoff',     icon: '⛽', color: '#e65c00' },
  { id: 'marina',      label: 'Havn / marina', icon: '⚓', color: '#003b7e' },
  { id: 'maintenance', label: 'Vedlikehold',   icon: '🔧', color: '#b86000' },
  { id: 'equipment',   label: 'Utstyr',        icon: '🛒', color: '#7b1fa2' },
  { id: 'insurance',   label: 'Forsikring',    icon: '🛡', color: '#1a7040' },
  { id: 'other',       label: 'Annet',         icon: '📋', color: '#8a8a8a' },
];

const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

let _year = new Date().getFullYear();
let _filterCat = 'all';
let _allTrips = [];
let _editingId = null;

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Kostnadslogg</div>
      <div class="ph-s">Summer · FAR999 · drivstoff · havn · vedlikehold</div>
    </div>

    <!-- Sesongvelger -->
    <div class="cost-year-row">
      <button class="cost-year-btn" id="cy-prev">←</button>
      <span class="cost-year-lbl" id="cy-label">${_year}</span>
      <button class="cost-year-btn" id="cy-next">→</button>
    </div>

    <!-- KPI-rad -->
    <div id="cost-summary" class="cost-kpi-wrap">
      <div class="wx-load"><div class="spin"></div></div>
    </div>

    <!-- Kategoribrikker -->
    <div class="cost-cat-row" id="cost-cat-row">
      <button class="cost-cat-pill active" data-cat="all">Alle</button>
      ${CATEGORIES.map(c => `
        <button class="cost-cat-pill" data-cat="${c.id}" style="--cc:${c.color}">
          ${c.icon} ${c.label}
        </button>`).join('')}
    </div>

    <!-- Handlingsknapper -->
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <button class="btn-primary" id="cost-add-btn">+ Legg til kostnad</button>
      <button class="btn-secondary" id="cost-scan-btn">📷 Skann kvittering</button>
    </div>

    <!-- Skjema -->
    <div id="cost-form" style="display:none" class="cost-form-card">
      <div class="cost-form-title" id="cost-form-title">Ny kostnad</div>
      <div class="cost-form-grid">
        <div class="cost-form-field cost-form-full">
          <label>Kategori</label>
          <div class="cost-cat-select" id="cost-cat-select">
            ${CATEGORIES.map(c => `
              <button class="ccs-btn" data-cat="${c.id}" style="--cc:${c.color}">
                ${c.icon} ${c.label}
              </button>`).join('')}
          </div>
          <input type="hidden" id="cf-category" value="fuel">
        </div>
        <div class="cost-form-field">
          <label>Dato</label>
          <input class="set-inp" id="cf-date" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="cost-form-field">
          <label>Beløp (kr)</label>
          <input class="set-inp" id="cf-amount" type="number" step="1" placeholder="0">
        </div>
        <div class="cost-form-field cost-form-full">
          <label>Beskrivelse</label>
          <input class="set-inp" id="cf-desc" type="text" placeholder="f.eks. Diesel · Esso Kristiansand">
        </div>
        <div id="cf-fuel-fields" class="cost-form-full" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div class="cost-form-field">
            <label>Liter</label>
            <input class="set-inp" id="cf-liters" type="number" step="0.1" placeholder="0.0">
          </div>
          <div class="cost-form-field">
            <label>Pris/liter (kr)</label>
            <input class="set-inp" id="cf-ppl" type="number" step="0.01" placeholder="0.00">
          </div>
          <div class="cost-form-field">
            <label>Stasjon / sted</label>
            <input class="set-inp" id="cf-location" type="text" placeholder="Esso Kristiansand">
          </div>
        </div>
        <div class="cost-form-field cost-form-full">
          <label>Koble til tur (valgfri)</label>
          <select class="set-inp" id="cf-trip" style="font-family:inherit">
            <option value="">— Ingen tur —</option>
          </select>
        </div>
        <div class="cost-form-field cost-form-full">
          <label>Notat</label>
          <input class="set-inp" id="cf-notes" type="text" placeholder="Valgfritt notat">
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn-primary" id="cf-save">Lagre</button>
        <button class="btn-secondary" id="cf-cancel">Avbryt</button>
      </div>
    </div>

    <div id="cost-list"><div class="wx-load"><div class="spin"></div>Laster…</div></div>

  <style>
    .cost-year-row { display:flex;align-items:center;gap:12px;margin-bottom:16px; }
    .cost-year-btn { width:32px;height:32px;background:var(--white);border:1px solid var(--line);color:var(--ink);cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center; }
    .cost-year-btn:hover { border-color:var(--blue);color:var(--blue); }
    .cost-year-lbl { font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.3rem;letter-spacing:.1em;color:var(--ink); }
    .cost-kpi-wrap { display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px; }
    @media(min-width:500px){ .cost-kpi-wrap { grid-template-columns:repeat(4,1fr); } }
    .cost-kpi { background:var(--white);border:1px solid var(--line);padding:12px 14px;position:relative;overflow:hidden; }
    .cost-kpi::before { content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--ck, var(--blue)); }
    .cost-kpi-l { font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#bbb;margin-bottom:3px; }
    .cost-kpi-v { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.4rem;color:var(--ink);line-height:1; }
    .cost-kpi-s { font-size:10px;color:var(--ink-light);margin-top:2px; }
    .cost-cat-row { display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px; }
    .cost-cat-pill { font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:5px 12px;border:1px solid var(--line);background:var(--white);color:var(--ink-light);cursor:pointer; }
    .cost-cat-pill.active { background:var(--cc, var(--blue));border-color:var(--cc, var(--blue));color:#fff; }
    .cost-form-card { background:var(--white);border:1px solid var(--line);border-top:3px solid var(--blue);padding:16px;margin-bottom:16px; }
    .cost-form-title { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin-bottom:14px; }
    .cost-form-grid { display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px; }
    .cost-form-field { display:flex;flex-direction:column;gap:4px; }
    .cost-form-field label { font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-medium); }
    .cost-form-full { grid-column:1/-1; }
    .cost-cat-select { display:flex;gap:6px;flex-wrap:wrap; }
    .ccs-btn { font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:5px 11px;border:1px solid var(--line);background:var(--white);color:var(--ink-light);cursor:pointer; }
    .ccs-btn.active { background:var(--cc);border-color:var(--cc);color:#fff; }
    .cost-month-label { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);padding:10px 0 6px;border-bottom:1px solid var(--line);margin-bottom:0;display:flex;align-items:center;justify-content:space-between; }
    .cost-month-total { font-size:13px;color:var(--ink);font-weight:700; }
    .cost-row { display:flex;align-items:center;gap:0;border-bottom:1px solid var(--line);background:var(--white); }
    .cost-row:last-child { border-bottom:none; }
    .cost-row:hover { background:var(--surface); }
    .cost-cat-bar { width:3px;align-self:stretch;background:var(--cc, #ccc);flex-shrink:0; }
    .cost-row-body { flex:1;padding:10px 12px;min-width:0; }
    .cost-row-top { display:flex;align-items:baseline;gap:8px;flex-wrap:wrap; }
    .cost-row-desc { font-size:13px;font-weight:600;color:var(--ink);flex:1; }
    .cost-row-amount { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.1rem;color:var(--ink);white-space:nowrap; }
    .cost-row-meta { font-size:11px;color:var(--ink-light);margin-top:2px;display:flex;gap:10px;flex-wrap:wrap; }
    .cost-row-tag { font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border:1px solid var(--line);color:var(--ink-light);white-space:nowrap; }
    .cost-row-actions { padding:0 10px;display:flex;gap:6px;flex-shrink:0; }
    .cost-act-btn { background:none;border:none;cursor:pointer;font-size:.85rem;opacity:.3;padding:4px; }
    .cost-act-btn:hover { opacity:1; }
  </style>`;

  trips.list({ limit: 50 }).then(r => { _allTrips = r.data || []; populateTripDropdown(); }).catch(() => {});

  setupForm(container);
  setupYearNav();
  setupCategoryFilter();

  // Skannerknapp
  document.getElementById('cost-scan-btn').addEventListener('click', () => {
    openScanner(() => { loadAll(); });
  });

  loadAll();

  // Hvis bruker kom hit fra Tanker-siden med forhåndsutfylte data, åpne skjemaet
  const prefillRaw = sessionStorage.getItem('cost_prefill');
  if (prefillRaw) {
    sessionStorage.removeItem('cost_prefill');
    try {
      const prefill = JSON.parse(prefillRaw);
      setTimeout(() => {
        openForm(null);
        setTimeout(() => {
          if (prefill.category) {
            selectCatBtn(prefill.category);
            document.getElementById('cf-fuel-fields').style.display =
              prefill.category === 'fuel' ? 'grid' : 'none';
          }
          if (prefill.price_per_liter) document.getElementById('cf-ppl').value      = prefill.price_per_liter;
          if (prefill.location)        document.getElementById('cf-location').value = prefill.location;
          if (prefill.description)     document.getElementById('cf-desc').value     = prefill.description;
          document.getElementById('cf-liters')?.focus();
        }, 60);
      }, 100);
    } catch {}
  }
}

function setupForm(container) {
  document.getElementById('cost-add-btn').onclick = () => openForm();
  document.getElementById('cf-cancel').onclick = () => closeForm();

  document.querySelectorAll('.ccs-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ccs-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      document.getElementById('cf-category').value = cat;
      document.getElementById('cf-fuel-fields').style.display = cat === 'fuel' ? 'grid' : 'none';
    });
  });

  ['cf-liters','cf-ppl'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const l = parseFloat(document.getElementById('cf-liters').value);
      const p = parseFloat(document.getElementById('cf-ppl').value);
      if (!isNaN(l) && !isNaN(p)) document.getElementById('cf-amount').value = Math.round(l * p);
    });
  });

  document.getElementById('cf-save').onclick = async () => {
    const cat    = document.getElementById('cf-category').value;
    const date   = document.getElementById('cf-date').value;
    const amount = document.getElementById('cf-amount').value;
    const desc   = document.getElementById('cf-desc').value.trim();
    if (!date || !amount || !desc) { toast('Dato, beløp og beskrivelse er påkrevd', 'err'); return; }
    const payload = {
      category: cat, date, amount: parseFloat(amount), description: desc,
      liters: document.getElementById('cf-liters').value  || null,
      price_per_liter: document.getElementById('cf-ppl').value || null,
      location: document.getElementById('cf-location').value.trim() || null,
      trip_id: document.getElementById('cf-trip').value || null,
      notes: document.getElementById('cf-notes').value.trim() || null,
    };
    try {
      if (_editingId) { await costs.update(_editingId, payload); toast('Kostnad oppdatert ✓', 'ok'); }
      else { await costs.create(payload); toast('Kostnad lagret ✓', 'ok'); }
      closeForm(); loadAll();
    } catch (e) { toast('Feil: ' + e.message, 'err'); }
  };
}

function openForm(existing) {
  _editingId = existing?.id || null;
  const form = document.getElementById('cost-form');
  form.style.display = 'block';
  document.getElementById('cost-form-title').textContent = existing ? 'Rediger kostnad' : 'Ny kostnad';
  if (existing) {
    document.getElementById('cf-date').value   = existing.date;
    document.getElementById('cf-amount').value = existing.amount;
    document.getElementById('cf-desc').value   = existing.description || '';
    document.getElementById('cf-liters').value = existing.liters || '';
    document.getElementById('cf-ppl').value    = existing.price_per_liter || '';
    document.getElementById('cf-location').value = existing.location || '';
    document.getElementById('cf-notes').value  = existing.notes || '';
    document.getElementById('cf-trip').value   = existing.trip_id || '';
    document.getElementById('cf-category').value = existing.category;
    selectCatBtn(existing.category);
    document.getElementById('cf-fuel-fields').style.display = existing.category === 'fuel' ? 'grid' : 'none';
  } else {
    selectCatBtn('fuel');
    document.getElementById('cf-fuel-fields').style.display = 'grid';
    document.getElementById('cf-date').value = new Date().toISOString().slice(0,10);
    ['cf-amount','cf-liters','cf-ppl','cf-location','cf-desc','cf-notes'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('cf-trip').value = '';
  }
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeForm() { document.getElementById('cost-form').style.display = 'none'; _editingId = null; }

function selectCatBtn(cat) {
  document.querySelectorAll('.ccs-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  document.getElementById('cf-category').value = cat;
}

function populateTripDropdown() {
  const sel = document.getElementById('cf-trip');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Ingen tur —</option>' +
    _allTrips.map(t => {
      const d = new Date(t.start_ts).toLocaleDateString('no', { day:'2-digit', month:'short', year:'numeric' });
      return `<option value="${t.id}">${t.name || 'Tur ' + d} · ${d}</option>`;
    }).join('');
}

function setupYearNav() {
  document.getElementById('cy-prev').onclick = () => { _year--; document.getElementById('cy-label').textContent = _year; loadAll(); };
  document.getElementById('cy-next').onclick = () => { _year++; document.getElementById('cy-label').textContent = _year; loadAll(); };
}

function setupCategoryFilter() {
  document.getElementById('cost-cat-row').addEventListener('click', e => {
    const btn = e.target.closest('.cost-cat-pill');
    if (!btn) return;
    _filterCat = btn.dataset.cat;
    document.querySelectorAll('.cost-cat-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadAll();
  });
}

async function loadAll() { await Promise.all([loadSummary(), loadList()]); }

async function loadSummary() {
  const box = document.getElementById('cost-summary');
  try {
    const s = await costs.summary({ year: _year });
    const fmt  = n => n != null ? Math.round(n).toLocaleString('no') + ' kr' : '—';
    const fuelRow   = s.totals.find(r => r.category === 'fuel');
    const marinaRow = s.totals.find(r => r.category === 'marina');
    box.innerHTML = `
      <div class="cost-kpi" style="--ck:#e65c00">
        <div class="cost-kpi-l">Totalt ${_year}</div>
        <div class="cost-kpi-v">${fmt(s.grandTotal)}</div>
        <div class="cost-kpi-s">${s.totals.length} kategorier</div>
      </div>
      <div class="cost-kpi" style="--ck:#003b7e">
        <div class="cost-kpi-l">Kost per nm</div>
        <div class="cost-kpi-v">${s.costPerNm != null ? Math.round(s.costPerNm) + ' kr' : '—'}</div>
        <div class="cost-kpi-s">${s.totalNm ? s.totalNm.toFixed(1) + ' nm seilt' : 'Ingen turer'}</div>
      </div>
      <div class="cost-kpi" style="--ck:#e65c00">
        <div class="cost-kpi-l">Drivstoff</div>
        <div class="cost-kpi-v">${fmt(fuelRow?.total)}</div>
        <div class="cost-kpi-s">${fuelRow?.total_liters ? Math.round(fuelRow.total_liters) + ' L' : '0 L'}</div>
      </div>
      <div class="cost-kpi" style="--ck:#003b7e">
        <div class="cost-kpi-l">Havn</div>
        <div class="cost-kpi-v">${fmt(marinaRow?.total)}</div>
        <div class="cost-kpi-s">${marinaRow?.count || 0} besøk</div>
      </div>`;
  } catch { box.innerHTML = `<div class="empty">Sammendrag ikke tilgjengelig</div>`; }
}

async function loadList() {
  const box = document.getElementById('cost-list');
  box.innerHTML = `<div class="wx-load"><div class="spin"></div>Laster…</div>`;
  try {
    const params = { year: _year, limit: 300 };
    if (_filterCat !== 'all') params.category = _filterCat;
    const { data } = await costs.list(params);
    if (!data.length) { box.innerHTML = `<div class="empty">Ingen kostnader registrert for ${_year}</div>`; return; }

    const byMonth = {};
    for (const row of data) {
      const m = row.date.slice(0, 7);
      if (!byMonth[m]) byMonth[m] = [];
      byMonth[m].push(row);
    }
    const MONTHS = ['','Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'];
    box.innerHTML = Object.entries(byMonth).map(([m, rows]) => {
      const [y, mo] = m.split('-');
      const monthTotal = rows.reduce((s, r) => s + r.amount, 0);
      const rowsHtml = rows.map(r => {
        const cat = CAT[r.category] || { color:'#ccc', icon:'○', label: r.category };
        const meta = [
          r.liters ? `${r.liters} L` : null,
          r.price_per_liter ? `${r.price_per_liter} kr/L` : null,
          r.location || null,
          r.trip_name ? `⚓ ${r.trip_name}` : null,
          r.notes || null,
        ].filter(Boolean);
        return `
          <div class="cost-row">
            <div class="cost-cat-bar" style="--cc:${cat.color}"></div>
            <div class="cost-row-body">
              <div class="cost-row-top">
                <span class="cost-row-tag" style="border-color:${cat.color};color:${cat.color}">${cat.icon} ${cat.label}</span>
                <span class="cost-row-desc">${r.description}</span>
                <span class="cost-row-amount">${Math.round(r.amount).toLocaleString('no')} kr</span>
              </div>
              ${meta.length ? `<div class="cost-row-meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>` : ''}
            </div>
            <div class="cost-row-actions">
              <button class="cost-act-btn" data-edit="${r.id}" title="Rediger">✎</button>
              <button class="cost-act-btn" data-del="${r.id}" title="Slett">✕</button>
            </div>
          </div>`;
      }).join('');
      return `
        <div class="cost-month-label">
          <span>${MONTHS[parseInt(mo)]} ${y}</span>
          <span class="cost-month-total">${Math.round(monthTotal).toLocaleString('no')} kr</span>
        </div>
        <div style="border:1px solid var(--line);border-top:none;margin-bottom:12px">${rowsHtml}</div>`;
    }).join('');

    box.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { const row = await costs.get(btn.dataset.edit); openForm(row); } catch (e) { toast('Feil: ' + e.message, 'err'); }
      });
    });
    box.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Slette denne kostnaden?')) return;
        await costs.delete(btn.dataset.del);
        toast('Slettet');
        loadAll();
      });
    });
  } catch (e) { box.innerHTML = `<div class="empty">Feil: ${e.message}</div>`; }
}
