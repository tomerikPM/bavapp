// pages/electrical.js — full strømdashboard
import * as SK from '../signalk.js';
import { sensors } from '../api.js';

// ── Chart.js loader (delt logikk med charts.js) ────────────────────────────
let _chartjsReady = false;
async function ensureChartJS() {
  if (_chartjsReady && window.Chart) return;
  const load = src => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  await load('https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js');
  _chartjsReady = true;
}

// ── Historikk-buffer ────────────────────────────────────────────────────────
const HISTORY_MAX = 120;
const _hist = { ts: [], soc: [], current: [], power: [] };
let _socChart = null;

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Strøm</div>
      <div class="ph-s">Batterier · lading · forbruk · prognoser</div>
    </div>

    <!-- ── Husbatteri hero ── -->
    <div class="e-hero" id="e-hero">
      <div class="e-hero-left">
        <div class="e-hero-label">Husbatteri</div>
        <div class="e-hero-soc" id="eh-soc">—</div>
        <div class="e-hero-sub" id="eh-sub">LiFePO4 800Ah · SmartShunt + BMV-712</div>
      </div>
      <div class="e-hero-right">
        <div class="e-stat-row">
          <div class="e-stat">
            <div class="e-stat-l">Spenning</div>
            <div class="e-stat-v" id="eh-volt">—</div>
          </div>
          <div class="e-stat">
            <div class="e-stat-l">Strøm</div>
            <div class="e-stat-v" id="eh-cur">—</div>
          </div>
          <div class="e-stat">
            <div class="e-stat-l">Effekt</div>
            <div class="e-stat-v" id="eh-pow">—</div>
          </div>
        </div>
        <div class="e-soc-bar-wrap">
          <div class="e-soc-bar-bg">
            <div class="e-soc-bar-fill" id="eh-bar" style="width:0%"></div>
          </div>
          <div class="e-soc-ticks">
            <span>0</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Prognose-kort ── -->
    <div class="sl">Prognose og forbruk</div>
    <div class="e-prognosis-grid">
      <div class="e-prog-card">
        <div class="e-prog-icon">⏱</div>
        <div class="e-prog-title">Tid igjen</div>
        <div class="e-prog-value" id="ep-remain-val">—</div>
        <div class="e-prog-sub" id="ep-remain-sub">ved nåværende forbruk</div>
      </div>
      <div class="e-prog-card">
        <div class="e-prog-icon">🌙</div>
        <div class="e-prog-title">Nattprognose</div>
        <div class="e-prog-value" id="ep-night-val">—</div>
        <div class="e-prog-sub" id="ep-night-sub">SOC kl. 07:00</div>
      </div>
      <div class="e-prog-card">
        <div class="e-prog-icon">📊</div>
        <div class="e-prog-title">Forbruk nå</div>
        <div class="e-prog-value" id="ep-cons-val">—</div>
        <div class="e-prog-sub">estimert watt</div>
      </div>
      <div class="e-prog-card">
        <div class="e-prog-icon">⚡</div>
        <div class="e-prog-title">Ladekilde</div>
        <div class="e-prog-value" id="ep-charge-val">—</div>
        <div class="e-prog-sub" id="ep-charge-sub">aktiv kilde</div>
      </div>
    </div>

    <!-- ── SOC historikkgraf (Chart.js) ── -->
    <div class="sl">SOC siste time</div>
    <div style="background:var(--white);border:1px solid var(--line);border-top:3px solid var(--blue);margin-bottom:28px">
      <div style="padding:8px 16px 4px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink)">Batteri SOC</div>
        <div id="el-soc-last" style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.2rem;color:var(--blue)">—</div>
      </div>
      <div style="padding:0 8px 8px">
        <canvas id="el-soc-chart" height="120" style="display:block;width:100%"></canvas>
      </div>
      <div id="el-chart-status" class="wx-load" style="display:none"><div class="spin"></div>Laster…</div>
    </div>

    <!-- ── Typiske laster ── -->
    <div class="sl">Typiske laster — når du ligger stille</div>
    <div class="e-loads">
      ${loads([
        { name: 'Navigasjonslys',    w: 15,   icon: '💡' },
        { name: 'Garmin plotter',    w: 18,   icon: '🗺️' },
        { name: 'VHF radio',         w: 6,    icon: '📻' },
        { name: 'Webasto varme',     w: 200,  icon: '🔥', note: 'kun oppstart ~5 min' },
        { name: 'Fusion stereo',     w: 20,   icon: '🎵' },
        { name: 'Kjøleskap',         w: 45,   icon: '❄️', note: 'sykler ca. 50% av tid' },
        { name: 'Inverter (stand.)', w: 8,    icon: '🔌', note: 'quiescent' },
        { name: 'Autopilot (stand)', w: 12,   icon: '🧭' },
        { name: 'Cerbo GX (plan.)',  w: 5,    icon: '💻' },
        { name: 'Mobillading (2×)',  w: 20,   icon: '📱' },
        { name: 'Hekktruster',       w: 1800, icon: '⚓', note: 'kortvarig bruk' },
      ])}
    </div>

    <!-- ── Alle batterier ── -->
    <div class="sl">Alle batterier</div>
    <div class="sgrid">
      ${sc('h-soc2',  'Hus SOC',      '—', '', 'Victron', '')}
      ${sc('h-volt2', 'Hus spenning', '—', '', 'Victron', '')}
      ${sc('s-volt',  'Start V',      '—', '', 'NMEA 2000', '')}
    </div>

    <!-- ── Ladekilder ── -->
    <div class="sl">Ladekilder</div>
    <div class="e-sources">
      ${sourceRow('src-shore', '🔌', 'Landstrøm',         '230V · 3× B16 ABL Sursum')}
      ${sourceRow('src-alt',   '⚙️', 'Dynamo/alternator', 'Volvo Penta D6 · via motor')}
      ${sourceRow('src-inv',   '🔋', 'Inverter',          '2900W Pure Sine Wave')}
    </div>

  <style>
    .e-hero {
      background: var(--blue); color: #fff;
      padding: 24px 20px; margin-bottom: 4px;
      position: relative; overflow: hidden;
      display: flex; gap: 20px; flex-wrap: wrap;
      border-bottom: 3px solid var(--red);
    }
    .e-hero::before {
      content: 'kWh'; position: absolute; right: 12px; bottom: -16px;
      font-family: 'Barlow Condensed', sans-serif; font-weight: 800;
      font-size: 5rem; color: rgba(255,255,255,.04); pointer-events: none;
    }
    .e-hero-left { flex: 0 0 auto; }
    .e-hero-right { flex: 1; min-width: 200px; }
    .e-hero-label {
      font-size: 10px; font-weight: 400; letter-spacing: .16em;
      text-transform: uppercase; color: rgba(255,255,255,.45); margin-bottom: 6px;
    }
    .e-hero-soc {
      font-family: 'Barlow Condensed', sans-serif; font-weight: 800;
      font-size: 3.8rem; line-height: 1; letter-spacing: -.02em;
      color: #fff; margin-bottom: 6px;
    }
    .e-hero-sub { font-size: 11px; color: rgba(255,255,255,.4); font-weight: 300; }
    .e-stat-row { display: flex; gap: 20px; margin-bottom: 16px; flex-wrap: wrap; }
    .e-stat-l { font-size: 10px; color: rgba(255,255,255,.4); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 2px; }
    .e-stat-v { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 1.2rem; color: #fff; }
    .e-soc-bar-wrap { margin-top: 4px; }
    .e-soc-bar-bg { height: 6px; background: rgba(255,255,255,.15); border-radius: 3px; overflow: hidden; margin-bottom: 5px; }
    .e-soc-bar-fill { height: 100%; background: #5de8a0; border-radius: 3px; transition: width .8s ease; }
    .e-soc-ticks { display: flex; justify-content: space-between; font-size: 9px; color: rgba(255,255,255,.3); }

    .e-prognosis-grid {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 10px; margin-bottom: 4px;
    }
    @media (min-width: 600px) { .e-prognosis-grid { grid-template-columns: repeat(4, 1fr); } }
    .e-prog-card {
      background: var(--white); border: 1px solid var(--line);
      padding: 16px 14px 14px; display: flex; flex-direction: column;
    }
    .e-prog-icon { font-size: 1.3rem; margin-bottom: 8px; line-height: 1; }
    .e-prog-title { font-size: 10px; font-weight: 500; letter-spacing: .1em; text-transform: uppercase; color: #bbb; margin-bottom: 6px; }
    .e-prog-value { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 1.5rem; line-height: 1; color: var(--ink); margin-bottom: 4px; }
    .e-prog-value.ok { color: var(--ok); }
    .e-prog-value.wn { color: var(--warn); }
    .e-prog-value.cr { color: var(--danger); }
    .e-prog-sub { font-size: 11px; color: #bbb; margin-top: auto; }

    .e-loads { border-top: 1px solid var(--line); margin-bottom: 4px; }
    .e-load-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
    .e-load-icon { font-size: 1.1rem; width: 24px; text-align: center; flex-shrink: 0; }
    .e-load-name { font-size: 13px; font-weight: 500; color: var(--ink); flex: 1; }
    .e-load-note { font-size: 11px; color: #bbb; }
    .e-load-w { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 1rem; color: var(--blue); flex-shrink: 0; text-align: right; min-width: 44px; }
    .e-load-bar-wrap { width: 60px; flex-shrink: 0; }
    .e-load-bar-bg { height: 3px; background: var(--line); border-radius: 2px; }
    .e-load-bar-fill { height: 100%; background: var(--blue); border-radius: 2px; }

    .e-sources { border-top: 1px solid var(--line); margin-bottom: 4px; }
    .e-src-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
    .e-src-icon { font-size: 1.2rem; width: 28px; text-align: center; flex-shrink: 0; }
    .e-src-info { flex: 1; }
    .e-src-name { font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 1px; }
    .e-src-desc { font-size: 11px; color: #bbb; }
    .e-src-status { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: .85rem; letter-spacing: .06em; text-transform: uppercase; flex-shrink: 0; }
    .e-src-status.on  { color: var(--ok); }
    .e-src-status.off { color: #ccc; }
    .e-src-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: #ddd; }
    .e-src-dot.on { background: var(--ok); }
  </style>`;

  // Last Chart.js, tegn graf
  const statusEl = document.getElementById('el-chart-status');
  if (statusEl) statusEl.style.display = 'flex';
  try {
    await ensureChartJS();
    if (statusEl) statusEl.style.display = 'none';
    await loadSocChart();
  } catch(e) {
    if (statusEl) statusEl.textContent = '⚠ ' + e.message;
  }

  const state = SK.getState();
  if (Object.keys(state).length) onSkUpdate(state);
}

// ── SOC Chart med Chart.js ────────────────────────────────────────────────
async function loadSocChart() {
  const canvas = document.getElementById('el-soc-chart');
  if (!canvas || !window.Chart) return;

  let labels = [], values = [], isLive = false;

  try {
    const from = new Date(Date.now() - 3600000).toISOString();
    const { data } = await sensors.history(
      'electrical.batteries.279.capacity.stateOfCharge', { from, limit: 120 }
    );
    if (data && data.length >= 2) {
      const sorted = [...data].reverse();
      labels = sorted.map(r => {
        const d = new Date(r.ts);
        return d.toLocaleTimeString('no', { hour: '2-digit', minute: '2-digit' });
      });
      values = sorted.map(r => +(r.value * 100).toFixed(1));
      isLive = true;
    }
  } catch {}

  if (!isLive) {
    // Demo-data — 60 minutter
    let v = 72;
    for (let i = 60; i >= 0; i--) {
      const d = new Date(Date.now() - i * 60000);
      labels.push(d.toLocaleTimeString('no', { hour: '2-digit', minute: '2-digit' }));
      v = Math.max(20, Math.min(98, v + (Math.random() * 2.5 - 1.2)));
      values.push(+(v.toFixed(1)));
    }
  }

  drawSocChart(canvas, labels, values);
}

function drawSocChart(canvas, labels, values) {
  if (!window.Chart) return;

  if (_socChart) { _socChart.destroy(); _socChart = null; }

  // Update last-value badge
  const lastEl = document.getElementById('el-soc-last');
  if (lastEl && values.length) {
    const last = values[values.length - 1];
    lastEl.textContent = last + ' %';
    lastEl.style.color = last < 20 ? 'var(--danger)' : last < 30 ? 'var(--warn)' : 'var(--blue)';
  }

  const ctx = canvas.getContext('2d');

  // Gradient fill — identisk med charts.js
  const grad = ctx.createLinearGradient(0, 0, 0, 120);
  grad.addColorStop(0, '#003b7e44');
  grad.addColorStop(1, '#003b7e04');

  _socChart = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#003b7e',
        borderWidth: 2,
        backgroundColor: grad,
        fill: true,
        tension: 0.3,
        pointRadius: values.length > 60 ? 0 : 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#003b7e',
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d0d0d',
          titleColor: '#9a9a9a',
          bodyColor: '#fff',
          borderColor: '#003b7e',
          borderWidth: 1,
          padding: 10,
          titleFont: { family: 'DM Mono', size: 10 },
          bodyFont: { family: 'Barlow Condensed', size: 14, weight: '700' },
          callbacks: {
            label: item => '  ' + item.parsed.y + ' %',
          },
        },
      },
      scales: {
        x: {
          grid:   { color: '#efefef' },
          border: { color: '#e8e8e8' },
          ticks:  {
            color: '#bbb', maxRotation: 0, maxTicksLimit: 6,
            font: { family: 'Barlow Condensed', size: 10 },
          },
        },
        y: {
          min: 0, max: 100,
          grid:   { color: '#efefef' },
          border: { color: '#e8e8e8' },
          ticks:  {
            color: '#bbb', maxTicksLimit: 5,
            font: { family: 'Barlow Condensed', size: 10 },
            callback: v => v + '%',
          },
        },
      },
    },
  });
}

// ── Live SK update ─────────────────────────────────────────────────────────
export function onSkUpdate(state) {
  const soc  = SK.get.houseSoc(state);
  const volt = SK.get.houseVolt(state);
  const cur  = SK.get.houseCurrent(state);
  const pow  = (volt != null && cur != null) ? Math.round(volt * cur) : null;

  // Hero
  const socEl = document.getElementById('eh-soc');
  if (socEl) socEl.textContent = soc != null ? soc + '%' : '—';

  const barEl = document.getElementById('eh-bar');
  if (barEl && soc != null) {
    barEl.style.width = soc + '%';
    barEl.style.background = soc < 20 ? '#f87171' : soc < 40 ? '#fbbf24' : '#5de8a0';
  }
  setText('eh-volt', volt != null ? volt.toFixed(2) + ' V' : '—');
  setText('eh-cur',  cur  != null ? (cur > 0 ? '+' : '') + cur.toFixed(1) + ' A' : '—');
  setText('eh-pow',  pow  != null ? (pow > 0 ? '+' : '') + pow + ' W' : '—');

  const subEl = document.getElementById('eh-sub');
  if (subEl && cur != null) {
    subEl.textContent = cur > 0.5 ? `Lader · ${cur.toFixed(1)} A inn`
                      : cur < -0.5 ? `Forbruker · ${Math.abs(cur).toFixed(1)} A ut`
                      : 'I hvile · minimal strøm';
  }

  // Alle batterier
  setCell('h-soc2',  soc  != null ? soc + '%'                      : '—', 'husbatteri',   socCls(soc));
  setCell('h-volt2', volt != null ? volt.toFixed(2) + ' V'         : '—', '',             voltCls(volt));
  setCell('s-volt',  SK.get.startVolt(state)   != null ? SK.get.startVolt(state).toFixed(1) + ' V' : '—', 'startbatteri', '');

  // Ladekilder
  const shore = SK.get.shorepower(state);
  const engOn = SK.get.engineOn(state);
  const invOn = SK.get.inverter(state);
  setSource('src-shore', shore);
  setSource('src-alt',   engOn && cur > 0);
  setSource('src-inv',   invOn);

  // Prognose
  updatePrognosis(soc, cur, volt, shore, engOn);

  // Oppdater historikkbuffer + live-graf
  if (soc != null && cur != null) {
    const now = Date.now();
    _hist.ts.push(now); _hist.soc.push(soc);
    _hist.current.push(cur); _hist.power.push(pow);
    if (_hist.ts.length > HISTORY_MAX) {
      _hist.ts.shift(); _hist.soc.shift();
      _hist.current.shift(); _hist.power.shift();
    }
    // Oppdater Chart.js graf med live data
    if (_socChart && _hist.soc.length >= 2) {
      const labels = _hist.ts.map(t =>
        new Date(t).toLocaleTimeString('no', { hour: '2-digit', minute: '2-digit' })
      );
      _socChart.data.labels = labels;
      _socChart.data.datasets[0].data = [..._hist.soc];
      _socChart.update('none'); // ingen animasjon ved live-oppdatering
      const lastEl = document.getElementById('el-soc-last');
      if (lastEl) {
        const last = _hist.soc[_hist.soc.length - 1];
        lastEl.textContent = last + ' %';
        lastEl.style.color = last < 20 ? 'var(--danger)' : last < 30 ? 'var(--warn)' : 'var(--blue)';
      }
    }
  }
}

// ── Prognose ──────────────────────────────────────────────────────────────
function updatePrognosis(soc, cur, volt, shore, engOn) {
  if (soc != null && cur != null && cur < -0.5) {
    const ahLeft  = (soc / 100) * 800 * 0.8;
    const hours   = ahLeft / Math.abs(cur);
    const val = hours > 48 ? '>48t' : hours >= 1 ? Math.round(hours) + 't' : Math.round(hours * 60) + 'min';
    const cls = hours < 4 ? 'cr' : hours < 8 ? 'wn' : 'ok';
    setProg('ep-remain', val, cls, `${Math.abs(cur).toFixed(1)} A forbruk · ${Math.round(ahLeft)} Ah igjen`);
  } else if (cur != null && cur > 0.5) {
    const ahToFull  = ((100 - soc) / 100) * 800;
    const h = ahToFull / Math.abs(cur);
    setProg('ep-remain', 'Full om ' + (h < 1 ? Math.round(h * 60) + 'min' : Math.round(h) + 't'), 'ok', `${cur.toFixed(1)} A inn`);
  } else {
    setProg('ep-remain', '—', '', 'lite strøm');
  }

  if (soc != null && cur != null) {
    const now = new Date();
    const next7 = new Date(now); next7.setHours(7, 0, 0, 0);
    if (next7 <= now) next7.setDate(next7.getDate() + 1);
    const hoursToMorning = (next7 - now) / 3600000;
    const nightDraw = cur < -0.5 ? Math.abs(cur) : 3.5;
    const socMorning = Math.min(100, Math.round(((((soc / 100) * 800) - nightDraw * hoursToMorning) / 800) * 100));
    const cls = socMorning < 20 ? 'cr' : socMorning < 35 ? 'wn' : 'ok';
    setProg('ep-night', Math.max(0, socMorning) + '%', cls, `Om ${Math.round(hoursToMorning)}t · ~${nightDraw.toFixed(1)}A`);
  }

  if (cur != null && volt != null) {
    const w = Math.abs(Math.round(volt * cur));
    setProg('ep-cons', w + ' W', w > 500 ? 'wn' : '', cur > 0 ? 'inn (lading)' : 'ut (forbruk)');
  }

  if (shore)              setProg('ep-charge', 'Landstrøm', 'ok', '230V · koblet til');
  else if (engOn && cur > 0) setProg('ep-charge', 'Dynamo',    'ok', 'Motor på · lader');
  else                    setProg('ep-charge', 'Ingen',     '',   'kjøring eller landstrøm');
}

function setProg(id, val, cls, sub) {
  const vEl = document.getElementById(id + '-val');
  const sEl = document.getElementById(id + '-sub');
  if (vEl) { vEl.textContent = val; vEl.className = 'e-prog-value ' + cls; }
  if (sEl) sEl.textContent = sub;
}

// ── Hjelpere ──────────────────────────────────────────────────────────────
function loads(items) {
  const maxW = Math.max(...items.map(i => i.w));
  return items.map(item => `
    <div class="e-load-row">
      <div class="e-load-icon">${item.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="e-load-name">${item.name}</div>
        ${item.note ? `<div class="e-load-note">${item.note}</div>` : ''}
      </div>
      <div class="e-load-bar-wrap">
        <div class="e-load-bar-bg">
          <div class="e-load-bar-fill" style="width:${Math.round((item.w / maxW) * 100)}%"></div>
        </div>
      </div>
      <div class="e-load-w">${item.w}W</div>
    </div>`).join('');
}

function sourceRow(id, icon, name, desc) {
  return `
    <div class="e-src-row">
      <div class="e-src-dot" id="${id}-dot"></div>
      <div class="e-src-icon">${icon}</div>
      <div class="e-src-info">
        <div class="e-src-name">${name}</div>
        <div class="e-src-desc">${desc}</div>
      </div>
      <div class="e-src-status off" id="${id}-status">Inaktiv</div>
    </div>`;
}

function setSource(id, active) {
  const dot = document.getElementById(id + '-dot');
  const sts = document.getElementById(id + '-status');
  const unknown = active == null;
  if (dot) dot.className = 'e-src-dot' + (active ? ' on' : '');
  if (sts) {
    sts.textContent = unknown ? 'Ukjent' : active ? 'Aktiv' : 'Inaktiv';
    sts.className = 'e-src-status ' + (unknown ? 'unknown' : active ? 'on' : 'off');
  }
}

function sc(id, label, val, unit, source, cls) {
  return `<div class="sc"><div class="sc-line ${cls}" id="scl-${id}"></div><div class="sc-src">${source}</div><div class="sc-lbl">${label}</div><div class="sc-v ${cls}" id="scv-${id}">${val}</div><div class="sc-u" id="scu-${id}">${unit}</div></div>`;
}
function setCell(id, val, unit, cls) {
  const v = document.getElementById('scv-' + id);
  const u = document.getElementById('scu-' + id);
  const l = document.getElementById('scl-' + id);
  if (v) { v.textContent = val; v.className = 'sc-v ' + cls; }
  if (u) u.textContent = unit;
  if (l) l.className = 'sc-line ' + cls;
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function socCls(v)  { return v == null ? '' : v < 20 ? 'cr' : v < 30 ? 'wn' : 'ok'; }
function voltCls(v) { return v == null ? '' : v < 12.0 ? 'cr' : v < 12.4 ? 'wn' : 'ok'; }
