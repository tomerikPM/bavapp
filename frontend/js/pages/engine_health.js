// pages/engine_health.js — motorhelse-trender per sesong
import { toast } from '../app.js';

const BASE = () => localStorage.getItem('backend_url') || 'http://localhost:3001';

let _chartjsReady = false;
async function ensureChartJS() {
  if (_chartjsReady && window.Chart) return;
  await new Promise((res, rej) => {
    if (document.querySelector('script[src*="chart.js"]')) { res(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  _chartjsReady = true;
}

const PATHS_CONFIG = [
  { path: 'propulsion.0.coolantTemperature', label: 'Kjølevann', unit: '°C', color: '#b01020', normalMax: 90 },
  { path: 'propulsion.0.oilPressure',        label: 'Oljetrykk', unit: 'bar', color: '#e65c00', normalMin: 2.0 },
  { path: 'propulsion.0.fuelRate',           label: 'Forbruk',   unit: 'L/h', color: '#b86000', normalMax: 65 },
  { path: 'propulsion.0.revolutions',        label: 'RPM',       unit: 'rpm', color: '#003b7e', normalMax: 3500 },
];

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Motorhelse</div>
      <div class="ph-s">Volvo Penta D6 330 hk · trender per tur · degraderingsanalyse</div>
    </div>

    <div id="eh-loading" class="wx-load"><div class="spin"></div>Henter motorsesjondata…</div>
    <div id="eh-body" style="display:none"></div>

  <style>
    .eh-kpi-row { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px; }
    @media(min-width:500px){ .eh-kpi-row { grid-template-columns:repeat(5,1fr); } }
    .eh-kpi { background:var(--white);border:1px solid var(--line);padding:12px 14px;position:relative;overflow:hidden; }
    .eh-kpi::before { content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--ek,var(--blue)); }
    .eh-kpi-l { font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#bbb;margin-bottom:3px; }
    .eh-kpi-v { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.3rem;color:var(--ink);line-height:1; }
    .eh-kpi-s { font-size:10px;color:var(--ink-light);margin-top:2px; }

    .eh-chart-card { background:var(--white);border:1px solid var(--line);margin-bottom:16px;overflow:hidden; }
    .eh-chart-head { padding:12px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between; }
    .eh-chart-title { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase; }
    .eh-chart-trend { font-size:11px;color:var(--ink-light); }
    .eh-chart-body { padding:8px;height:160px; }

    .eh-milestone { display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--white); }
    .eh-milestone:last-child { border-bottom:none; }
    .eh-ms-icon { font-size:1.1rem;width:28px;text-align:center;flex-shrink:0; }
    .eh-ms-text { font-size:13px;color:var(--ink); }
    .eh-ms-sub  { font-size:11px;color:var(--ink-light); }
    .eh-ms-done { color:var(--ok);font-size:10px;font-weight:600;margin-left:auto;white-space:nowrap; }

    .eh-ai-wrap { background:var(--blue-tint);border:1px solid var(--blue);padding:14px;margin-top:16px;margin-bottom:8px; }
    .eh-ai-btn { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:8px 16px;background:var(--blue);border:none;color:#fff;cursor:pointer;width:100%; }
    .eh-ai-result { margin-top:10px;font-size:13px;color:var(--ink-medium);line-height:1.7;display:none; }
  </style>`;

  try {
    const res  = await fetch(`${BASE()}/api/anomaly/engine-health`);
    const data = await res.json();
    renderHealth(container, data);
  } catch(e) {
    document.getElementById('eh-loading').innerHTML = `<span style="color:var(--danger)">Feil: ${e.message}</span>`;
  }
}

async function renderHealth(container, data) {
  document.getElementById('eh-loading').style.display = 'none';
  const body = document.getElementById('eh-body');
  body.style.display = '';

  const { sessions } = data;
  if (!sessions.length) {
    body.innerHTML = `<div class="empty">Ingen motorsesjondata ennå<br><span style="font-size:.7rem;font-weight:300">Logg turer for å bygge opp motorhelse-historikk</span></div>`;
    return;
  }

  // KPI-er fra siste sesjon
  const latest = sessions[0];
  const allCool = sessions.map(s => s.stats['propulsion.0.coolantTemperature']?.avg).filter(Boolean);
  const allOil  = sessions.map(s => s.stats['propulsion.0.oilPressure']?.avg).filter(Boolean);
  const totalHrs = sessions.reduce((s,t) => s + (parseFloat(t.engine_hours)||0), 0);

  body.innerHTML = `
    <div class="eh-kpi-row">
      <div class="eh-kpi" style="--ek:#b01020">
        <div class="eh-kpi-l">Siste kjølevann snitt</div>
        <div class="eh-kpi-v">${latest.stats['propulsion.0.coolantTemperature']?.avg?.toFixed(1) || '—'} °C</div>
        <div class="eh-kpi-s">maks ${latest.stats['propulsion.0.coolantTemperature']?.max?.toFixed(0) || '—'}°C</div>
      </div>
      <div class="eh-kpi" style="--ek:#e65c00">
        <div class="eh-kpi-l">Siste oljetrykk snitt</div>
        <div class="eh-kpi-v">${latest.stats['propulsion.0.oilPressure']?.avg?.toFixed(2) || '—'} bar</div>
        <div class="eh-kpi-s">norm: 2.0–5.5 bar</div>
      </div>
      <div class="eh-kpi" style="--ek:#003b7e">
        <div class="eh-kpi-l">Loggede turer</div>
        <div class="eh-kpi-v">${sessions.length}</div>
        <div class="eh-kpi-s">${totalHrs.toFixed(1)}t motor totalt</div>
      </div>
      <div class="eh-kpi" style="--ek:${trendColor(allCool)}">
        <div class="eh-kpi-l">Kjølevann trend</div>
        <div class="eh-kpi-v" style="color:${trendColor(allCool)}">${trendLabel(allCool)}</div>
        <div class="eh-kpi-s">over ${allCool.length} sesjoner</div>
      </div>
      <div class="eh-kpi" style="--ek:${trendColor(allOil, true)}">
        <div class="eh-kpi-l">Oljetrykk trend</div>
        <div class="eh-kpi-v" style="color:${trendColor(allOil, true)}">${trendLabel(allOil, true)}</div>
        <div class="eh-kpi-s">over ${allOil.length} sesjoner</div>
      </div>
    </div>

    <div class="sl">Sesjon-for-sesjon — siste ${Math.min(sessions.length, 20)} turer</div>

    ${PATHS_CONFIG.map(cfg => {
      const vals = sessions.slice(0,20).reverse().map(s => s.stats[cfg.path]?.avg || null);
      const dates = sessions.slice(0,20).reverse().map(s => s.date?.slice(5));
      const hasData = vals.some(v => v !== null);
      return `
        <div class="eh-chart-card">
          <div class="eh-chart-head" style="border-top:3px solid ${cfg.color}">
            <span class="eh-chart-title" style="color:${cfg.color}">${cfg.label}</span>
            <span class="eh-chart-trend">${hasData ? trendText(vals.filter(Boolean), cfg) : 'ingen data'}</span>
          </div>
          <div class="eh-chart-body">
            <canvas id="ehc-${cfg.path.replace(/\./g,'-')}" style="width:100%;height:100%"></canvas>
          </div>
        </div>`;
    }).join('')}

    <div class="sl">Vedlikeholdsmilepæler</div>
    <div style="border:1px solid var(--line);margin-bottom:20px">
      ${milestones(1085).map(m => `
        <div class="eh-milestone">
          <div class="eh-ms-icon">${m.done ? '✓' : '○'}</div>
          <div>
            <div class="eh-ms-text">${m.label}</div>
            <div class="eh-ms-sub">${m.desc}</div>
          </div>
          <div class="eh-ms-done" style="color:${m.done ? 'var(--ok)' : 'var(--ink-light)'}">
            ${m.done ? 'Passert' : m.hours + ' t'}
          </div>
        </div>`).join('')}
    </div>

    <div class="eh-ai-wrap">
      <button class="eh-ai-btn" id="eh-ai-btn">🤖 Be AI vurdere motorhelsen</button>
      <div class="eh-ai-result" id="eh-ai-result"></div>
    </div>`;

  await ensureChartJS();
  if (!window.Chart) return;

  for (const cfg of PATHS_CONFIG) {
    const canvas = document.getElementById(`ehc-${cfg.path.replace(/\./g,'-')}`);
    if (!canvas) continue;
    const vals  = sessions.slice(0,20).reverse().map(s => s.stats[cfg.path]?.avg || null);
    const dates = sessions.slice(0,20).reverse().map(s => s.date?.slice(5) || '');
    if (!vals.some(v => v !== null)) continue;

    const ctx  = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 160);
    grad.addColorStop(0, cfg.color + '35');
    grad.addColorStop(1, cfg.color + '05');

    new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          {
            data: vals, borderColor: cfg.color, borderWidth: 2,
            backgroundColor: grad, fill: true, tension: 0.3,
            pointRadius: 3, pointHoverRadius: 5,
            pointBackgroundColor: cfg.color,
          },
          // Normal-linje
          cfg.normalMax ? {
            data: dates.map(() => cfg.normalMax),
            borderColor: cfg.color + '40', borderWidth: 1,
            borderDash: [4, 4], pointRadius: 0, fill: false,
          } : null,
        ].filter(Boolean),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0d0d0d', titleColor: '#9a9a9a', bodyColor: '#fff',
            borderColor: cfg.color, borderWidth: 1, padding: 8,
            callbacks: { label: item => `  ${item.parsed.y?.toFixed(1)} ${cfg.unit}` },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#bbb', font: { family: 'Barlow Condensed', size: 10 } } },
          y: { grid: { color: '#f0f0f0' }, ticks: { color: '#bbb', font: { family: 'Barlow Condensed', size: 10 }, callback: v => v + ' ' + cfg.unit } },
        },
      },
    });
  }

  // AI-vurdering
  document.getElementById('eh-ai-btn').onclick = async () => {
    const apiKey = localStorage.getItem('api_key');
    if (!apiKey) { toast('API-nøkkel mangler', 'err'); return; }
    const btn    = document.getElementById('eh-ai-btn');
    const result = document.getElementById('eh-ai-result');
    btn.textContent = '⏳ Analyserer motorhelse…'; btn.disabled = true;
    result.style.display = 'block'; result.textContent = '…';

    const last5 = sessions.slice(0,5).map(s => {
      const c = s.stats['propulsion.0.coolantTemperature'];
      const o = s.stats['propulsion.0.oilPressure'];
      const f = s.stats['propulsion.0.fuelRate'];
      return `${s.date}: kjølevann ${c?.avg?.toFixed(0)||'—'}°C (maks ${c?.max?.toFixed(0)||'—'}°C), oljetrykk ${o?.avg?.toFixed(2)||'—'} bar, forbruk ${f?.avg?.toFixed(1)||'—'} L/h`;
    }).join('\n');

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 500,
          messages: [{ role:'user', content:`Volvo Penta D6 330hk, ca 1085 gangtimer, Bavaria Sport 32.

Motordata siste 5 sesjoner:
${last5}

Gi en kort motorhelse-vurdering på norsk:
1. Er det tegn til degradering i kjølevann eller oljetrykk?
2. Er forbruket normalt?
3. Hva bør sjekkes ved neste service?
Maks 6 setninger.` }],
        }),
      });
      const d = await res.json();
      result.textContent = d.content?.[0]?.text || 'Ingen svar';
    } catch(e) { result.textContent = 'Feil: ' + e.message; }
    finally { btn.textContent = '🤖 Be AI vurdere motorhelsen'; btn.disabled = false; }
  };
}

function trendColor(vals, invertGood = false) {
  if (vals.length < 3) return 'var(--ink-light)';
  const first = vals.slice(0, Math.ceil(vals.length/2)).reduce((a,b)=>a+b,0) / Math.ceil(vals.length/2);
  const last  = vals.slice(-Math.ceil(vals.length/2)).reduce((a,b)=>a+b,0) / Math.ceil(vals.length/2);
  const up = last > first * 1.03;
  const dn = last < first * 0.97;
  if (!up && !dn) return 'var(--ok)';
  return (up && !invertGood) || (dn && invertGood) ? 'var(--warn)' : 'var(--ok)';
}

function trendLabel(vals, invertGood = false) {
  if (vals.length < 3) return '—';
  const first = vals.slice(0, Math.ceil(vals.length/2)).reduce((a,b)=>a+b,0) / Math.ceil(vals.length/2);
  const last  = vals.slice(-Math.ceil(vals.length/2)).reduce((a,b)=>a+b,0) / Math.ceil(vals.length/2);
  const pct   = Math.round((last - first) / first * 100);
  if (Math.abs(pct) < 3) return '→ Stabil';
  return last > first ? `↑ +${pct}%` : `↓ ${pct}%`;
}

function trendText(vals, cfg) {
  if (!vals.length) return '';
  const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
  const max = Math.max(...vals);
  return `Snitt ${avg.toFixed(1)} · maks ${max.toFixed(1)} ${cfg.unit}`;
}

function milestones(currentHours) {
  return [
    { hours: 200,  done: currentHours >= 200,  label: 'Oljeskift + oljefilter',  desc: 'Volvo Penta D6 · intervall 200t / 12 mnd' },
    { hours: 200,  done: currentHours >= 200,  label: 'Dieselfilter primær',     desc: 'Art. 3840524 · intervall 200t' },
    { hours: 400,  done: currentHours >= 400,  label: 'Impeller sjøvannskjøling',desc: 'Art. 21951346 · kritisk ved 400t' },
    { hours: 400,  done: currentHours >= 400,  label: 'Drevoljeskift',           desc: '1 liter · intervall 400t / 24 mnd' },
    { hours: 1000, done: currentHours >= 1000, label: '1000-timers service',     desc: 'Større gjennomgang anbefalt' },
    { hours: 1200, done: currentHours >= 1200, label: 'Belg drev',               desc: 'Art. 3853807 · kritisk · intervall 3 år' },
  ];
}
