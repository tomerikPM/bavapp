// pages/tanks.js — tankvisning med visuell tank-UI
import * as SK from '../signalk.js';
import { sensors } from '../api.js';

// ── Tankdefinisjonar ───────────────────────────────────────────────────────
const TANKS = [
  {
    id:       'diesel',
    label:    'Diesel',
    unit:     'liter',
    capacity: 370,
    color:    '#E91E8C',        // rosa
    colorDim: '#F8BBD9',
    colorBg:  '#FDF0F7',
    path:     'tanks.fuel.0.currentLevel',   // ratio 0–1 fra Signal K
    skKey:    'fuelPct',
    litresFn: s => SK.get.fuelLitres(s),
    icon:     '⛽',
    note:     'Mastpol 2013 · Wema S5-E790 giver',
    alarmLow: 20,
  },
  {
    id:       'freshwater',
    label:    'Ferskvann',
    unit:     'liter',
    capacity: null,             // ukjent — oppdateres når sensor er installert
    color:    '#29B6F6',        // lyseblå
    colorDim: '#B3E5FC',
    colorBg:  '#F0FAFF',
    path:     'tanks.freshWater.0.currentLevel',
    skKey:    null,             // ingen getter ennå
    litresFn: null,
    icon:     '💧',
    note:     'Sensor ikke installert ennå',
    alarmLow: 20,
  },
  {
    id:       'greywater',
    label:    'Gråvann',
    unit:     'liter',
    capacity: null,
    color:    '#90A4AE',        // grå
    colorDim: '#CFD8DC',
    colorBg:  '#F5F7F8',
    path:     'tanks.wasteWater.0.currentLevel',
    skKey:    null,
    litresFn: null,
    icon:     '🪣',
    note:     'Sensor ikke installert ennå',
    alarmHigh: 80,             // advarsel når nesten full
  },
];

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Tanker</div>
      <div class="ph-s">Diesel · Ferskvann · Gråvann</div>
    </div>

    <!-- Tankvisualisering — tre ved siden av hverandre -->
    <div class="tk-grid" id="tk-grid">
      ${TANKS.map(t => tankCard(t)).join('')}
    </div>

    <!-- Dieselpriser nærby -->
    <div class="sl" style="margin-top:32px">Dieselpriser nærby</div>
    <div class="fuel-section">
      <div class="fuel-header" id="fuel-toggle">
        <span>⛽ Dieselpriser i nærheten</span>
        <span id="fuel-pos" style="font-size:10px;color:var(--ink-light);margin-left:8px"></span>
        <span id="fuel-chevron" style="margin-left:auto;font-size:10px">&#9660;</span>
      </div>
      <div id="fuel-body">
        <div class="wx-load"><div class="spin"></div>Henter priser…</div>
      </div>
    </div>

    <!-- Historikkgrafer — bruker Chart.js som resten av appen -->
    <div class="sl" style="margin-top:32px">Historikk</div>
    <div id="tk-status" class="wx-load" style="display:none">
      <div class="spin"></div>Laster grafbibliotek…
    </div>
    <div id="tk-charts" style="display:flex;flex-direction:column;gap:16px">
      ${TANKS.map(t => chartCard(t)).join('')}
    </div>

    <!-- Systeminfo -->
    <div class="sl">Systeminformasjon</div>
    <div class="spg">
      <div class="spc"><div class="spk">Dieseltank</div><div class="spv">370 liter · Mastpol 2013 · Wema S5-E790 giver (0–190 Ω)</div></div>
      <div class="spc"><div class="spk">Dieseltankgiver</div><div class="spv m">0–190 Ω · NMEA 2000 via Cerbo GX (planlagt)</div></div>
      <div class="spc"><div class="spk">Ferskvann</div><div class="spv">Kapasitet ukjent · sensor ikke installert</div></div>
      <div class="spc"><div class="spk">Gråvann</div><div class="spv">Kapasitet ukjent · sensor ikke installert</div></div>
      <div class="spc"><div class="spk">Protokoll</div><div class="spv">Signal K → Cerbo GX → NMEA 2000</div></div>
    </div>

  <style>
    /* ── Tank-grid ── */
    .tk-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 8px;
    }
    @media (max-width: 500px) {
      .tk-grid { grid-template-columns: 1fr; }
    }

    /* ── Tankkort ── */
    .tk-card {
      border: 1px solid var(--line);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Tittelrad */
    .tk-head {
      padding: 12px 14px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--line);
    }
    .tk-icon { font-size: 1.1rem; margin-right: 6px; }
    .tk-title {
      font-family: 'Barlow Condensed', sans-serif;
      font-weight: 700; font-size: 13px;
      letter-spacing: .05em; text-transform: uppercase;
      color: var(--ink);
    }
    .tk-pct {
      font-family: 'Barlow Condensed', sans-serif;
      font-weight: 800; font-size: 1.6rem;
      line-height: 1; letter-spacing: -.02em;
    }
    .tk-litres {
      font-size: 11px; color: var(--ink-light); margin-top: 2px;
      font-weight: 300;
    }

    /* Tank-kropp — den visuelle tanken */
    .tk-body {
      flex: 1;
      padding: 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    /* Selve tanken */
    .tk-tank-wrap {
      width: 100%;
      flex: 1;
      min-height: 160px;
      position: relative;
    }
    .tk-tank {
      width: 100%;
      height: 100%;
      min-height: 160px;
      border: 2px solid;
      border-radius: 2px;
      position: relative;
      overflow: hidden;
      background: var(--white);
    }
    /* Væskefyll — animert fra bunnen */
    .tk-fill {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      transition: height 1s cubic-bezier(.4,0,.2,1);
    }
    /* Boble-effekt på toppen av væsken */
    .tk-fill::after {
      content: '';
      position: absolute;
      top: -3px; left: 0; right: 0;
      height: 6px;
      border-radius: 50%;
      opacity: .3;
    }
    /* Skala-streker */
    .tk-scale {
      position: absolute;
      top: 0; right: 0; bottom: 0;
      width: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 6px 3px;
    }
    .tk-tick {
      font-family: 'DM Mono', monospace;
      font-size: 8px;
      color: rgba(0,0,0,.25);
      text-align: right;
      line-height: 1;
    }

    /* Statuslinje under tanken */
    .tk-status-row {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: var(--ink-light);
    }
    .tk-note {
      font-size: 10px;
      color: var(--ink-light);
      font-style: italic;
    }

    /* Alarm-indikator */
    .tk-alarm {
      font-family: 'Barlow Condensed', sans-serif;
      font-weight: 700; font-size: 10px;
      letter-spacing: .1em; text-transform: uppercase;
      padding: 3px 8px; border: 1px solid;
    }
    .tk-alarm.warn { color: var(--warn); border-color: var(--warn); background: var(--warn-tint); }
    .tk-alarm.crit { color: var(--danger); border-color: var(--danger); background: var(--danger-tint); }

    /* Ingen sensor */
    .tk-no-sensor {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: #bbb;
      pointer-events: none;
    }
    .tk-no-sensor span { font-size: 1.4rem; }

    /* Historikkgrafer */
    .tk-chart-card {
      background: var(--white);
      border: 1px solid var(--line);
      overflow: hidden;
    }
    .tk-chart-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid var(--line);
    }
    .tk-chart-title {
      font-family: 'Barlow Condensed', sans-serif;
      font-weight: 700; font-size: 12px;
      letter-spacing: .05em; text-transform: uppercase;
    }
    .tk-chart-stat {
      font-family: 'Barlow Condensed', sans-serif;
      font-weight: 700; font-size: 1.1rem;
      line-height: 1;
    }
    .tk-chart-body { padding: 6px 8px 8px; height: 110px; }

    /* ── Dieselpriser nærby ── */
    .fuel-section { border: 1px solid var(--line); margin-bottom: 12px; }
    .fuel-header {
      display: flex; align-items: center; gap: 4px;
      padding: 10px 12px; background: var(--surface);
      font-family: 'Barlow Condensed', sans-serif; font-weight: 700;
      font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
      color: var(--blue); cursor: pointer; user-select: none;
    }
    #fuel-body { padding: 0 0 4px; }
    .fuel-row {
      display: flex; align-items: center; gap: 0;
      padding: 8px 12px; border-top: 1px solid var(--line);
    }
    .fuel-row:first-child { border-top: none; }
    .fuel-name { flex: 1; min-width: 0; }
    .fuel-station { font-size: 12px; font-weight: 500; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fuel-meta { font-size: 10px; color: var(--ink-light); margin-top: 1px; display: flex; gap: 8px; flex-wrap: wrap; }
    .fuel-updated { font-size: 10px; color: var(--ink-light); }
    .fuel-updated.fresh { color: var(--ok); }
    .fuel-updated.stale { color: var(--warn); }
    .fuel-updated.very-stale { color: var(--danger); }
    .fuel-price {
      font-family: 'Barlow Condensed', sans-serif; font-weight: 800;
      font-size: 1.3rem; color: var(--ink); text-align: right; flex-shrink: 0; margin-left: 12px;
    }
    .fuel-unit { font-size: 10px; color: var(--ink-light); font-weight: 400; }
    .fuel-trend { font-size: .85rem; margin-left: 4px; }
    .fuel-trend.up { color: var(--danger); }
    .fuel-trend.down { color: var(--ok); }
    .fuel-dist { font-size: 10px; color: var(--ink-light); text-align: right; margin-left: 8px; flex-shrink: 0; min-width: 36px; }
    .fuel-fill-btn, .fuel-gpx-btn, .fuel-nav-btn {
      margin-left: 4px; flex-shrink: 0;
      font-family: 'Barlow Condensed', sans-serif; font-size: 10px; font-weight: 700;
      letter-spacing: .06em; text-transform: uppercase;
      padding: 4px 8px; background: none; cursor: pointer;
    }
    .fuel-fill-btn { border: 1px solid var(--blue); color: var(--blue); }
    .fuel-fill-btn:hover { background: var(--blue); color: #fff; }
    .fuel-gpx-btn { border: 1px solid var(--ok); color: var(--ok); }
    .fuel-gpx-btn:hover { background: var(--ok); color: #fff; }
    .fuel-nav-btn { border: 1px solid #b06000; color: #b06000; }
    .fuel-nav-btn:hover:not(:disabled) { background: #b06000; color: #fff; }
    .fuel-nav-btn:disabled { opacity: .5; cursor: default; }
    .fuel-scraped { font-size: 10px; color: var(--ink-light); padding: 6px 12px 8px; text-align: right; }

    /* Kilde-domene som subtil tekst */
    .fuel-source { font-size: 10px; color: var(--ink-light); opacity: .75; }
  </style>`;

  // Sett riktig høyde på fill basert på initialverdi
  const state = SK.getState();
  if (Object.keys(state).length) onSkUpdate(state);

  // Last Chart.js og tegn historikkgrafer
  await loadHistoryCharts();

  // Dieselpriser
  setupFuelToggle();
  loadFuelPrices();
}

// ── Tank-kort HTML ─────────────────────────────────────────────────────────
function tankCard(t) {
  const hasSensor = t.path.startsWith('tanks.fuel') || false; // bare diesel har sensor nå
  return `
    <div class="tk-card" id="tkcard-${t.id}">
      <!-- Tittelrad -->
      <div class="tk-head" style="border-top: 3px solid ${t.color}">
        <div style="display:flex;align-items:center">
          <span class="tk-icon">${t.icon}</span>
          <span class="tk-title">${t.label}</span>
        </div>
        <div style="text-align:right">
          <div class="tk-pct" id="tkpct-${t.id}" style="color:${t.color}">
            ${hasSensor ? '—' : '—'}
          </div>
          <div class="tk-litres" id="tklit-${t.id}">
            ${t.capacity ? '/ ' + t.capacity + ' L' : 'ukjent kapasitet'}
          </div>
        </div>
      </div>

      <!-- Tank-kropp -->
      <div class="tk-body" style="background:${t.colorBg}">
        <div class="tk-tank-wrap">
          <div class="tk-tank" style="border-color:${t.colorDim}" id="tktank-${t.id}">
            <!-- Fyll -->
            <div class="tk-fill" id="tkfill-${t.id}"
              style="background:${t.color};opacity:.85;height:0%">
            </div>
            <!-- Skala -->
            <div class="tk-scale">
              <div class="tk-tick">100</div>
              <div class="tk-tick">75</div>
              <div class="tk-tick">50</div>
              <div class="tk-tick">25</div>
              <div class="tk-tick">0</div>
            </div>
            <!-- Advarselslinje (lav nivå) -->
            ${t.alarmLow != null ? `
              <div style="position:absolute;left:0;right:20px;bottom:${t.alarmLow}%;
                border-top:1.5px dashed ${t.alarmLow <= 20 ? 'var(--danger)' : 'var(--warn)'};
                opacity:.6;pointer-events:none"></div>` : ''}
            ${t.alarmHigh != null ? `
              <div style="position:absolute;left:0;right:20px;bottom:${t.alarmHigh}%;
                border-top:1.5px dashed var(--warn);opacity:.6;pointer-events:none"></div>` : ''}
            <!-- Ingen sensor overlay -->
            ${!hasSensor ? `
              <div class="tk-no-sensor">
                <span>📡</span>Sensor ikke<br>installert
              </div>` : ''}
          </div>
        </div>

        <!-- Statusrad -->
        <div class="tk-status-row">
          <div class="tk-note">${t.note}</div>
          <div id="tkalarm-${t.id}"></div>
        </div>
      </div>
    </div>`;
}

// ── Historikk-grafkort HTML ────────────────────────────────────────────────
function chartCard(t) {
  return `
    <div class="tk-chart-card">
      <div class="tk-chart-head" style="border-top:3px solid ${t.color}">
        <div style="display:flex;align-items:center;gap:8px">
          <span>${t.icon}</span>
          <span class="tk-chart-title" style="color:${t.color}">${t.label}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="tk-chart-stat" id="tkstat-${t.id}" style="color:${t.color}">—</div>
          <button class="rb" data-tk-reset="${t.id}" style="padding:2px 6px;font-size:10px">↺</button>
        </div>
      </div>
      <div class="tk-chart-body">
        <canvas id="tkcanvas-${t.id}" style="display:block;width:100%;height:100%"></canvas>
      </div>
    </div>`;
}

// ── Live SK-oppdatering ───────────────────────────────────────────────────
export function onSkUpdate(state) {
  // Diesel — eneste med sensor nå
  const fuelPct = SK.get.fuelPct(state);
  const fuelLit = SK.get.fuelLitres(state);
  updateTank('diesel', fuelPct, fuelLit, 370, TANKS[0]);

  // Ferskvann og gråvann — ingen sensor, vis placeholder
  const fw = state['tanks.freshWater.0.currentLevel'];
  const gw = state['tanks.wasteWater.0.currentLevel'];
  if (fw != null) updateTank('freshwater', Math.round(fw * 100), null, null, TANKS[1]);
  if (gw != null) updateTank('greywater',  Math.round(gw * 100), null, null, TANKS[2]);
}

function updateTank(id, pct, litres, capacity, cfg) {
  if (pct == null) return;

  // Prosent-display
  const pctEl = document.getElementById('tkpct-' + id);
  const litEl = document.getElementById('tklit-' + id);
  const fillEl = document.getElementById('tkfill-' + id);
  const alarmEl = document.getElementById('tkalarm-' + id);
  const statEl = document.getElementById('tkstat-' + id);

  if (pctEl) pctEl.textContent = pct + '%';
  if (litEl && litres != null) litEl.textContent = litres + ' L / ' + (capacity || '?') + ' L';
  if (fillEl) fillEl.style.height = Math.max(0, Math.min(100, pct)) + '%';
  if (statEl) statEl.textContent = pct + '%';

  // Alarmlogikk
  if (alarmEl) {
    if (cfg.alarmLow && pct <= 10) {
      alarmEl.innerHTML = `<div class="tk-alarm crit">Kritisk lavt</div>`;
    } else if (cfg.alarmLow && pct <= cfg.alarmLow) {
      alarmEl.innerHTML = `<div class="tk-alarm warn">Lavt nivå</div>`;
    } else if (cfg.alarmHigh && pct >= cfg.alarmHigh) {
      alarmEl.innerHTML = `<div class="tk-alarm warn">Nesten full</div>`;
    } else {
      alarmEl.innerHTML = '';
    }
  }

  // Farge-gradient basert på nivå
  if (fillEl && cfg.alarmLow) {
    if (pct <= 10) {
      fillEl.style.background = 'var(--danger)';
    } else if (pct <= cfg.alarmLow) {
      fillEl.style.background = 'var(--warn)';
    } else {
      fillEl.style.background = cfg.color;
    }
  }
}

// ── Historikkgrafer (Chart.js) ─────────────────────────────────────────────
const _instances = {};

async function loadHistoryCharts() {
  const statusEl = document.getElementById('tk-status');
  if (statusEl) statusEl.style.display = 'flex';

  // Sjekk om Chart.js allerede er lastet (delt med charts.js)
  if (!window.Chart) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  if (statusEl) statusEl.style.display = 'none';

  const from = new Date(Date.now() - 7 * 24 * 3600000).toISOString(); // 7 dager

  await Promise.all(TANKS.map(t => renderTankChart(t, from)));

  // Reset-knapper
  document.querySelectorAll('[data-tk-reset]').forEach(btn => {
    btn.addEventListener('click', () => {
      try { _instances[btn.dataset.tkReset]?.resetZoom?.(); } catch {}
    });
  });
}

async function renderTankChart(t, from) {
  const canvas = document.getElementById('tkcanvas-' + t.id);
  if (!canvas || !window.Chart) return;

  let labels = [], values = [], isLive = false;
  try {
    const { data } = await sensors.history(t.path, { from, limit: 300 });
    if (data && data.length >= 2) {
      const sorted = [...data].reverse();
      labels = sorted.map(r => {
        const d = new Date(r.ts);
        return d.toLocaleDateString('no', { day: '2-digit', month: '2-digit' }) +
               ' ' + d.toLocaleTimeString('no', { hour: '2-digit', minute: '2-digit' });
      });
      values = sorted.map(r => +(r.value * 100).toFixed(1));
      isLive = true;
    }
  } catch {}

  if (!isLive) {
    // Demo-data
    const pts = 80;
    const now = Date.now();
    let v = t.id === 'diesel' ? 68 : t.id === 'freshwater' ? 85 : 12;
    for (let i = pts; i >= 0; i--) {
      const d = new Date(now - i * (7 * 3600000 * 24 / pts));
      labels.push(d.toLocaleDateString('no', { day: '2-digit', month: '2-digit' }));
      if (t.id === 'diesel') {
        v = Math.max(5, v - Math.random() * 1.2);
        if (i === Math.round(pts * 0.4)) v = Math.min(v + 55, 95);
      } else if (t.id === 'freshwater') {
        v = Math.max(10, v - Math.random() * 0.8);
        if (i === Math.round(pts * 0.5)) v = Math.min(v + 50, 98);
      } else {
        v = Math.min(98, v + Math.random() * 1.5);
        if (i === Math.round(pts * 0.3)) v = Math.max(v - 70, 5);
      }
      values.push(Math.round(v * 10) / 10);
    }
  }

  // Oppdater stat-badge
  if (values.length) {
    const statEl = document.getElementById('tkstat-' + t.id);
    if (statEl) statEl.textContent = values[values.length - 1] + ' %';
  }

  if (_instances[t.id]) { _instances[t.id].destroy(); delete _instances[t.id]; }

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 110);
  grad.addColorStop(0, t.color + '50');
  grad.addColorStop(1, t.color + '04');

  // Alarmlinjer
  const alarmAnnotations = {};
  if (t.alarmLow) {
    alarmAnnotations.low = {
      type: 'line', scaleID: 'y', value: t.alarmLow,
      borderColor: t.alarmLow <= 20 ? 'var(--danger)' : 'var(--warn)',
      borderWidth: 1.5, borderDash: [4, 3],
      label: {
        display: true,
        content: t.alarmLow + '% lavt',
        position: 'start',
        backgroundColor: t.alarmLow <= 20 ? '#b01020' : '#b86000',
        color: '#fff',
        font: { size: 9, family: 'Barlow Condensed', weight: '700' },
        padding: { x: 5, y: 2 },
      },
    };
  }
  if (t.alarmHigh) {
    alarmAnnotations.high = {
      type: 'line', scaleID: 'y', value: t.alarmHigh,
      borderColor: 'var(--warn)', borderWidth: 1.5, borderDash: [4, 3],
      label: {
        display: true, content: t.alarmHigh + '% full',
        position: 'end',
        backgroundColor: '#b86000', color: '#fff',
        font: { size: 9, family: 'Barlow Condensed', weight: '700' },
        padding: { x: 5, y: 2 },
      },
    };
  }

  // Sjekk om annotation-plugin er registrert
  const hasAnnotation = !!window['chartjs-plugin-annotation'] ||
    Object.values(window).some(v => v?.id === 'annotation');

  _instances[t.id] = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: t.color,
        borderWidth: 2,
        backgroundColor: grad,
        fill: true,
        tension: 0.3,
        pointRadius: values.length > 60 ? 0 : 3,
        pointHoverRadius: 6,
        pointBackgroundColor: t.color,
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d0d0d',
          titleColor: '#9a9a9a',
          bodyColor: '#fff',
          borderColor: t.color,
          borderWidth: 1,
          padding: 8,
          titleFont: { family: 'DM Mono', size: 9 },
          bodyFont: { family: 'Barlow Condensed', size: 13, weight: '700' },
          callbacks: { label: item => '  ' + item.parsed.y + ' %' },
        },
        ...(hasAnnotation && Object.keys(alarmAnnotations).length
          ? { annotation: { annotations: alarmAnnotations } }
          : {}),
      },
      scales: {
        x: {
          grid: { color: '#f0f0f0' }, border: { color: '#e8e8e8' },
          ticks: { color: '#9a9a9a', maxRotation: 0, maxTicksLimit: 5, font: { family: 'Barlow Condensed', size: 10 } },
        },
        y: {
          min: 0, max: 100,
          grid: { color: '#f0f0f0' }, border: { color: '#e8e8e8' },
          ticks: {
            color: '#9a9a9a', maxTicksLimit: 5,
            font: { family: 'Barlow Condensed', size: 10 },
            callback: v => v + '%',
          },
        },
      },
    },
  });
}

// ══════════════════════════════════════════════════════════════════════
// DIESELPRISER NÆRBY — flyttet fra costs.js
// ══════════════════════════════════════════════════════════════════════

let _fuelOpen = true;

function setupFuelToggle() {
  document.getElementById('fuel-toggle')?.addEventListener('click', () => {
    _fuelOpen = !_fuelOpen;
    document.getElementById('fuel-body').style.display = _fuelOpen ? '' : 'none';
    document.getElementById('fuel-chevron').innerHTML = _fuelOpen ? '&#9660;' : '&#9658;';
  });
}

async function loadFuelPrices() {
  const body  = document.getElementById('fuel-body');
  const posEl = document.getElementById('fuel-pos');
  if (!body) return;

  // GPS fra Signal K eller fallback
  const state = SK.getState();
  const skLat = SK.get.lat?.(state);
  const skLon = SK.get.lon?.(state);
  const lat = (skLat && Math.abs(skLat) > 1) ? skLat
    : parseFloat(localStorage.getItem('wx_lat') || '58.1467');
  const lon = (skLon && Math.abs(skLon) > 1) ? skLon
    : parseFloat(localStorage.getItem('wx_lon') || '7.9956');

  const fromGps = skLat && Math.abs(skLat) > 1;
  if (posEl) posEl.textContent = fromGps ? '📍 Live GPS' : '🏠 Hjemmehavn';

  const BASE = localStorage.getItem('backend_url') || 'http://localhost:3001';
  try {
    const res  = await fetch(`${BASE}/api/fuel/prices?lat=${lat}&lon=${lon}&radius=50&limit=30`);
    const data = await res.json();
    const stations = (data.data || []).filter(s => s.diesel);

    if (!stations.length) {
      body.innerHTML = '<div class="empty" style="padding:12px">Ingen priser tilgjengelig</div>';
      return;
    }

    const TREND = { green:'<span class="fuel-trend down">↓</span>', red:'<span class="fuel-trend up">↑</span>' };

    body.innerHTML = stations.map(s => {
      const trend        = TREND[s.diesel_trend] || '';
      const dist         = s.distanceKm < 9999 ? `${Math.round(s.distanceKm)} km` : '';
      const area         = [s.municipality, s.area].filter(Boolean).join(' · ');
      const sourceDomain = s.source === 'bunkring' ? 'bunkring.no' : 'pumpepriser.no';
      // Viser bare ekte bekreftelsesdato fra kilden. Ikke syntetiser fra vår
      // egen price_updated_at — det ville vist "Bekreftet i dag" første gang
      // vi scrapet en stasjon selv om prisen i kilden er gammel.
      const updated = formatPriceAge(s.lastDieselConfirmedAt, s.lastDieselConfirmedBy);

      return `
        <div class="fuel-row">
          <div class="fuel-name">
            <div class="fuel-station">${s.name}</div>
            <div class="fuel-meta">
              <span>${area}</span>
              <span class="fuel-source">${sourceDomain}</span>
              ${updated.html}
            </div>
          </div>
          <div class="fuel-price">${s.diesel.toFixed(2)}${trend}<span class="fuel-unit"> kr/L</span></div>
          <div class="fuel-dist">${dist}</div>
          <button class="fuel-fill-btn"
            data-station="${s.name}"
            data-muni="${s.municipality || ''}"
            data-ppl="${s.diesel.toFixed(2)}"
            title="Fyll inn som drivstoffkostnad">
            Fyll inn
          </button>
          ${s.lat && s.lon ? `
          <button class="fuel-gpx-btn"
            data-station="${s.name}"
            data-muni="${s.municipality || ''}"
            data-lat="${s.lat}"
            data-lon="${s.lon}"
            data-ppl="${s.diesel.toFixed(2)}"
            title="Last ned GPX-waypoint til Garmin">
            GPX
          </button>` : ''}
          ${s.lat && s.lon ? `
          <button class="fuel-nav-btn"
            data-station="${s.name}"
            data-lat="${s.lat}"
            data-lon="${s.lon}"
            title="Naviger til fyllestasjon via Garmin (N2K)">
            ⬆ Nav
          </button>` : ''}
        </div>`;
    }).join('') + sourcesFooter(data.sources);

    // Klikk på "Fyll inn" → navigerer til #kostnader med forhåndsutfylt skjema
    body.querySelectorAll('.fuel-fill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sessionStorage.setItem('cost_prefill', JSON.stringify({
          category:    'fuel',
          price_per_liter: btn.dataset.ppl,
          location:    `${btn.dataset.station}, ${btn.dataset.muni}`,
          description: `Diesel · ${btn.dataset.station}`,
        }));
        location.hash = '#kostnader';
      });
    });

    // Klikk på "GPX" → last ned waypoint-fil
    body.querySelectorAll('.fuel-gpx-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        downloadGpx(
          btn.dataset.station,
          btn.dataset.muni,
          parseFloat(btn.dataset.lat),
          parseFloat(btn.dataset.lon),
          parseFloat(btn.dataset.ppl)
        );
      });
    });

    // Klikk på "⬆ Nav" → send destinasjon til Garmin via Signal K / N2K
    body.querySelectorAll('.fuel-nav-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.textContent = '…'; btn.disabled = true;
        try {
          const res = await fetch(`${BASE}/api/navigate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat:  btn.dataset.lat,
              lon:  btn.dataset.lon,
              name: btn.dataset.station,
            }),
          });
          const d = await res.json();
          if (res.ok) {
            btn.textContent = '✓ Nav';
          } else {
            alert(d.error || 'Signal K ikke tilgjengelig');
            btn.textContent = '⬆ Nav'; btn.disabled = false;
          }
        } catch (e) {
          alert('Feil: ' + e.message);
          btn.textContent = '⬆ Nav'; btn.disabled = false;
        }
      });
    });

  } catch (e) {
    body.innerHTML = `<div class="empty" style="padding:12px">Feil: ${e.message}</div>`;
  }
}

// Bygg footer som viser sist-skrapet-tid per kilde. Inputen er `data.sources`
// fra /api/fuel/prices — { pumpepriser: {scrapedAt, ...}, bunkring: {scrapedAt, ...} }.
function sourcesFooter(sources) {
  if (!sources) return '';
  const parts = [];
  if (sources.pumpepriser?.scrapedAt) {
    const min = Math.round((Date.now() - new Date(sources.pumpepriser.scrapedAt)) / 60000);
    parts.push(`pumpepriser.no (${fmtAge(min)})`);
  }
  if (sources.bunkring?.scrapedAt) {
    const min = Math.round((Date.now() - new Date(sources.bunkring.scrapedAt)) / 60000);
    parts.push(`bunkring.no (${fmtAge(min)})`);
  }
  if (!parts.length) return '';
  return `<div class="fuel-scraped">Oppdatert: ${parts.join(' · ')}</div>`;
}

function fmtAge(min) {
  if (min < 60)   return `${min} min siden`;
  if (min < 1440) return `${Math.round(min / 60)} t siden`;
  return `${Math.round(min / 1440)} d siden`;
}

// Formater "sist bekreftet" per stasjon. Viser når en bruker på pumpepriser.no
// sist verifiserte dieselprisen. Viktigste signalet for å avgjøre om prisen er pålitelig.
function formatPriceAge(confirmedIso, confirmedBy) {
  if (!confirmedIso) {
    return { html: `<span class="fuel-updated">· Dato ukjent</span>`, cls: '' };
  }

  const ageMs = Date.now() - new Date(confirmedIso).getTime();
  const ageD  = ageMs / 86400000;

  let text, cls;
  if (ageD < 1) {
    text = 'Bekreftet i dag';
    cls  = 'fresh';
  } else if (ageD < 2) {
    text = 'Bekreftet i går';
    cls  = 'fresh';
  } else if (ageD < 7) {
    text = `Bekreftet for ${Math.round(ageD)} dager siden`;
    cls  = 'fresh';
  } else if (ageD < 30) {
    const w = Math.round(ageD / 7);
    text = `Bekreftet for ${w} ${w === 1 ? 'uke' : 'uker'} siden`;
    cls  = '';
  } else if (ageD < 180) {
    const mo = Math.round(ageD / 30);
    text = `Bekreftet for ${mo} ${mo === 1 ? 'måned' : 'måneder'} siden`;
    cls  = 'stale';
  } else {
    const mo = Math.round(ageD / 30);
    text = `Bekreftet for ${mo} måneder siden`;
    cls  = 'very-stale';
  }

  const title = confirmedBy ? `title="Bekreftet av ${confirmedBy} · ${new Date(confirmedIso).toLocaleDateString('no')}"` : '';
  return { html: `<span class="fuel-updated ${cls}" ${title}>· ${text}</span>`, cls };
}

function downloadGpx(name, municipality, lat, lon, pricePerLiter) {
  const safeName = name.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
  const desc = `${municipality} · Diesel ${pricePerLiter} kr/L · Summer / FAR999`;
  const now  = new Date().toISOString();

  const gpx = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="BavApp Summer FAR999"',
    '  xmlns="http://www.topografix.com/GPX/1/1"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    `  <metadata><time>${now}</time></metadata>`,
    `  <wpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">`,
    `    <n>${safeName}</n>`,
    `    <desc>${desc}</desc>`,
    '    <sym>Anchor</sym>',
    '    <type>Fuel</type>',
    '  </wpt>',
    '</gpx>',
  ].join('\n');

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${name.replace(/[^a-z0-9]/gi, '_')}.gpx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
