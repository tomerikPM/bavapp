// pages/charts.js — interaktive grafer med zoom, pan og alarmlinjer
// Dieseltank er FJERNET herfra — se Tanker-siden
import { sensors } from '../api.js';

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

let _ready = false;
async function ensureLibs() {
  if (_ready && window.Chart) return;
  await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/hammerjs@2.0.8/hammer.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-zoom/2.0.1/chartjs-plugin-zoom.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js');
  if (window.Chart) {
    const toRegister = [];
    if (window.ChartZoom) toRegister.push(window.ChartZoom);
    const ann = window.ChartAnnotation
      ?? window['chartjs-plugin-annotation']
      ?? Object.values(window).find(v => v?.id === 'annotation');
    if (ann) toRegister.push(ann);
    if (toRegister.length) { try { window.Chart.register(...toRegister); } catch {} }
  }
  _ready = true;
}

// ── Grafdefinisjoner — UTEN dieseltank (se Tanker-siden) ──────────────────
const CHARTS = [
  {
    id: 'ch-soc',  title: 'Batteri SOC',          unit: '%',   color: '#003b7e',
    path: 'electrical.batteries.0.capacity.stateOfCharge',
    scale: v => +(v * 100).toFixed(1), fill: true, yMin: 0, yMax: 100,
    alarms: [
      { value: 30, color: '#b86000', label: '30% advarsel', pos: 'start' },
      { value: 15, color: '#b01020', label: '15% kritisk',  pos: 'end'   },
    ],
    desc: 'Ladestatus husbatteri · LiFePO4 400Ah',
  },
  {
    id: 'ch-volt', title: 'Batterispenning',       unit: 'V',   color: '#1a7040',
    path: 'electrical.batteries.0.voltage',
    scale: v => +v.toFixed(2), fill: true, yMin: 11.0, yMax: 14.8, alarms: [],
    desc: 'Spenning husbatteri',
  },
  {
    id: 'ch-cur',  title: 'Batteristrøm',          unit: 'A',   color: '#b86000',
    path: 'electrical.batteries.0.current',
    scale: v => +v.toFixed(1), fill: false, yMin: null, yMax: null,
    alarms: [{ value: 0, color: '#c8c8c8', label: '0A', pos: 'start' }],
    desc: 'Positiv = lader · Negativ = forbruk',
  },
  {
    id: 'ch-cool', title: 'Kjølevannstemperatur',  unit: '°C',  color: '#b01020',
    path: 'propulsion.0.coolantTemperature',
    scale: v => +(v - 273.15).toFixed(1), fill: false, yMin: 0, yMax: 110,
    alarms: [
      { value: 90,  color: '#b86000', label: '90°C advarsel', pos: 'start' },
      { value: 100, color: '#b01020', label: '100°C kritisk', pos: 'end'   },
    ],
    desc: 'Volvo Penta D6 330 · normalområde 75–88°C',
  },
  {
    id: 'ch-rpm',  title: 'Motor RPM',             unit: 'rpm', color: '#003b7e',
    path: 'propulsion.0.revolutions',
    scale: v => Math.round(v * 60), fill: true, yMin: 0, yMax: 4000, alarms: [],
    desc: 'Volvo Penta D6 330',
  },
  {
    id: 'ch-wt',   title: 'Sjøvannstemperatur',    unit: '°C',  color: '#1a7040',
    path: 'environment.water.temperature',
    scale: v => +(v - 273.15).toFixed(1), fill: true, yMin: 0, yMax: 30, alarms: [],
    desc: 'Overflatetemperatur · Signal K',
  },
];

const RANGES = [
  { label: '1T',  hours: 1   },
  { label: '6T',  hours: 6   },
  { label: '1D',  hours: 24  },
  { label: '7D',  hours: 168 },
  { label: '30D', hours: 720 },
];

let activeRange = '7D';
const instances = {};

// ── Render ────────────────────────────────────────────────────────────────
export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Grafer</div>
      <div class="ph-s">Elektrisk · motor · sjø · hover for detaljer · scroll for å zoome</div>
    </div>

    <div class="krow" id="ch-kpi">
      <div class="kc" style="grid-column:1/-1"><div class="kc-l">Henter siste verdier…</div></div>
    </div>

    <div style="display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
      ${RANGES.map(r =>
        `<button class="rb${r.label === activeRange ? ' active' : ''}" data-range="${r.label}">${r.label}</button>`
      ).join('')}
      <span style="flex:1"></span>
      <button class="rb" id="ch-reset-all">↺ Reset zoom</button>
    </div>

    <div id="ch-status" class="wx-load"><div class="spin"></div>Laster grafbibliotek…</div>

    <div id="ch-grid" style="display:none;flex-direction:column;gap:16px">
      ${CHARTS.map(c => `
        <div style="background:var(--white);border:1px solid var(--line);border-top:3px solid ${c.color};overflow:hidden">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:12px 16px 4px;gap:8px">
            <div>
              <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.9rem;letter-spacing:.05em;text-transform:uppercase;color:var(--ink)">${c.title}</div>
              <div style="font-size:.65rem;color:var(--ink-light);margin-top:2px;font-weight:300">${c.desc}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <div id="stat-${c.id}" style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.3rem;color:${c.color};line-height:1">—</div>
              <button class="rb" data-reset="${c.id}" style="padding:3px 7px;font-size:10px">↺</button>
            </div>
          </div>
          <div style="padding:4px 8px 10px;height:140px">
            <canvas id="${c.id}" style="display:block;width:100%;height:100%"></canvas>
          </div>
        </div>`
      ).join('')}
    </div>`;

  container.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeRange = btn.dataset.range;
      container.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadAll();
    });
  });
  document.getElementById('ch-reset-all')?.addEventListener('click', () => {
    Object.values(instances).forEach(ch => { try { ch.resetZoom(); } catch {} });
  });
  container.querySelectorAll('[data-reset]').forEach(btn => {
    btn.addEventListener('click', () => { try { instances[btn.dataset.reset]?.resetZoom(); } catch {} });
  });

  const statusEl = document.getElementById('ch-status');
  const gridEl   = document.getElementById('ch-grid');
  try {
    await ensureLibs();
    statusEl.style.display = 'none';
    gridEl.style.display   = 'flex';
  } catch (e) {
    statusEl.innerHTML = `⚠ Kunne ikke laste grafbibliotek: ${e.message}`;
    return;
  }

  loadAll();
  loadKPI();
}

// ── Data + tegning ────────────────────────────────────────────────────────
async function loadAll() {
  const hours = RANGES.find(r => r.label === activeRange).hours;
  const from  = new Date(Date.now() - hours * 3600000).toISOString();
  await Promise.all(CHARTS.map(c => renderChart(c, from)));
}

async function renderChart(cfg, from) {
  if (!window.Chart) return;
  const canvas = document.getElementById(cfg.id);
  if (!canvas) return;

  let labels = [], values = [], isLive = false;
  try {
    const { data } = await sensors.history(cfg.path, { from, limit: 500 });
    if (data && data.length >= 2) {
      const sorted = [...data].reverse();
      labels = sorted.map(r => fmtLabel(new Date(r.ts), activeRange));
      values = sorted.map(r => cfg.scale(r.value));
      isLive = true;
    }
  } catch {}

  if (!isLive) {
    const gen = demoData(cfg, activeRange);
    labels = gen.labels; values = gen.values;
  }

  const stat = document.getElementById('stat-' + cfg.id);
  if (stat && values.length) stat.textContent = values[values.length - 1] + ' ' + cfg.unit;

  if (instances[cfg.id]) { instances[cfg.id].destroy(); delete instances[cfg.id]; }

  const ctx = canvas.getContext('2d');
  let bg = 'transparent';
  if (cfg.fill) {
    const grad = ctx.createLinearGradient(0, 0, 0, 140);
    grad.addColorStop(0, cfg.color + '40');
    grad.addColorStop(1, cfg.color + '04');
    bg = grad;
  }

  const annotations = {};
  cfg.alarms.forEach((a, i) => {
    annotations['al' + i] = {
      type: 'line', scaleID: 'y', value: a.value,
      borderColor: a.color, borderWidth: 1.5, borderDash: [5, 4],
      label: {
        display: true, content: a.label, position: a.pos || 'start',
        backgroundColor: a.color, color: '#fff',
        font: { size: 10, family: 'Barlow Condensed', weight: '700' },
        padding: { x: 6, y: 3 },
      },
    };
  });

  // Sjekk plugins via .get() — korrekt Chart.js 4 API
  const reg = window.Chart?.registry;
  const hasZoom       = !!(reg?.plugins?.get?.('zoom'));
  const hasAnnotation = !!(reg?.plugins?.get?.('annotation')) && cfg.alarms.length > 0;

  instances[cfg.id] = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: cfg.color, borderWidth: 2,
        backgroundColor: bg, fill: cfg.fill, tension: 0.3,
        pointRadius: values.length > 100 ? 0 : 3,
        pointHoverRadius: 7,
        pointBackgroundColor: cfg.color,
        pointBorderColor: '#fff', pointBorderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 350, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d0d0d', titleColor: '#9a9a9a',
          bodyColor: '#fff', borderColor: cfg.color, borderWidth: 1, padding: 10,
          titleFont: { family: 'DM Mono', size: 10 },
          bodyFont: { family: 'Barlow Condensed', size: 14, weight: '700' },
          callbacks: { label: item => '  ' + item.parsed.y + ' ' + cfg.unit },
        },
        ...(hasZoom ? {
          zoom: {
            zoom:   { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
            pan:    { enabled: true, mode: 'x' },
            limits: { x: { minRange: 2 } },
          },
        } : {}),
        ...(hasAnnotation ? { annotation: { annotations } } : {}),
      },
      scales: {
        x: {
          grid: { color: '#f0f0f0' }, border: { color: '#e8e8e8' },
          ticks: { color: '#9a9a9a', maxRotation: 0, maxTicksLimit: 6, font: { family: 'Barlow Condensed', size: 10 } },
        },
        y: {
          min: cfg.yMin ?? undefined, max: cfg.yMax ?? undefined,
          grid: { color: '#f0f0f0' }, border: { color: '#e8e8e8' },
          ticks: {
            color: '#9a9a9a', maxTicksLimit: 5,
            font: { family: 'Barlow Condensed', size: 10 },
            callback: v => v + ' ' + cfg.unit,
          },
        },
      },
    },
  });
}

// ── KPI ───────────────────────────────────────────────────────────────────
async function loadKPI() {
  const box = document.getElementById('ch-kpi');
  if (!box) return;
  try {
    const l = await sensors.latest();
    const s = l['electrical.batteries.0.capacity.stateOfCharge'];
    const h = l['propulsion.0.runTime'];
    const w = l['environment.water.temperature'];
    const c = l['propulsion.0.coolantTemperature'];
    box.innerHTML = [
      { l: 'Batteri SOC', v: s ? Math.round(s.value*100)+'%'              : '—', warn: s && s.value < 0.3 },
      { l: 'Gangtimer',   v: h ? Math.round(h.value/3600).toLocaleString('no') : '—' },
      { l: 'Sjøtemp.',    v: w ? Math.round(w.value-273.15)+'°C'          : '—' },
      { l: 'Kjølevann',   v: c ? Math.round(c.value-273.15)+'°C'          : '—', warn: c && c.value-273.15 > 90 },
    ].map(k => `<div class="kc"><div class="kc-l">${k.l}</div><div class="kc-v${k.warn?' wn':''}">${k.v}</div></div>`).join('');
  } catch {
    box.innerHTML = '<div class="kc" style="grid-column:1/-1"><div class="kc-l">Demo-data</div></div>';
  }
}

// ── Demo-data ─────────────────────────────────────────────────────────────
function demoData(cfg, rangeLabel) {
  const hours = RANGES.find(r => r.label === rangeLabel).hours;
  const pts   = Math.min(250, Math.max(50, Math.round(hours * 5)));
  const now   = Date.now();
  const labels = [], values = [];
  let v = cfg.id==='ch-soc'?74:cfg.id==='ch-volt'?13.1:cfg.id==='ch-cur'?-4:cfg.id==='ch-cool'?20:cfg.id==='ch-wt'?14.2:0;
  for (let i = pts; i >= 0; i--) {
    const d = new Date(now - i * (hours * 3600000 / pts));
    labels.push(fmtLabel(d, rangeLabel));
    if      (cfg.id==='ch-soc')  { v=Math.max(15,Math.min(98,v+(Math.random()*5-2.5))); if(i%Math.round(pts/5)===0)v=Math.min(v+22,95); }
    else if (cfg.id==='ch-volt') { v=Math.max(11.5,Math.min(14.5,v+(Math.random()*.12-.06))); }
    else if (cfg.id==='ch-cur')  { const p=Math.floor(i/25)%4; v=p===0?16+Math.random()*6:p===1?-(3+Math.random()*4):p===2?-(8+Math.random()*12):0; }
    else if (cfg.id==='ch-cool') { const on=Math.floor(i/15)%7<2; v=on?Math.min(92,v+Math.random()*3.5):Math.max(16,v-2); }
    else if (cfg.id==='ch-rpm')  { const on=Math.floor(i/15)%7<2; v=on?1600+Math.random()*1600:Math.max(0,v-400); }
    else if (cfg.id==='ch-wt')   { v=Math.max(8,Math.min(22,v+(Math.random()*.06-.03))); }
    values.push(Math.round(v * 10) / 10);
  }
  return { labels, values };
}

function fmtLabel(d, rangeLabel) {
  const isShort = rangeLabel==='1T'||rangeLabel==='6T'||rangeLabel==='1D';
  return isShort
    ? d.toLocaleTimeString('no',{hour:'2-digit',minute:'2-digit'})
    : d.toLocaleDateString('no',{day:'2-digit',month:'2-digit'});
}
