// pages/fuel_efficiency.js — drivstoffeffektivitetsanalyse
// Korrelerer fuel.rate, RPM og fart for å finne optimalt kjøreområde

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

let _charts = {};

// Effektivitets-klassifisering: "optimal" hvis best i regimet, "ineffektiv"
// hvis L/nm > 1.5× minimum i samme regime (fanger hump-aktig forbruk selv
// når snittfarten teknisk er "lav"), ellers det rene regimet.
const INEFF_FACTOR = 1.5;

function classify(buckets, isOptFn) {
  const minByRegime = {};
  for (const b of buckets) {
    if (b.avg_lnm == null || b.samples < 5) continue;
    const cur = minByRegime[b.regime];
    if (cur == null || b.avg_lnm < cur) minByRegime[b.regime] = b.avg_lnm;
  }
  return buckets.map(b => {
    if (isOptFn(b)) return 'optimal';
    if (b.regime === 'hump') return 'hump';
    const min = minByRegime[b.regime];
    if (min != null && b.avg_lnm != null && b.avg_lnm > min * INEFF_FACTOR) return 'inefficient';
    return b.regime; // 'low' eller 'plane'
  });
}

const EFF_COLORS = {
  optimal:     { fill: '#1a7040',   border: '#1a7040' },
  low:         { fill: '#5a8fbf33', border: '#5a8fbf' },
  plane:       { fill: '#003b7e33', border: '#003b7e' },
  hump:        { fill: '#b8600033', border: '#b86000' },
  inefficient: { fill: '#b8600033', border: '#b86000' },
};

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Drivstoffeffektivitet</div>
      <div class="ph-s">RPM- og fartsanalyse · optimal kjøresone for D6 330</div>
    </div>

    <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-light)">Periode</div>
      <select id="eff-days" style="font-family:'Barlow Condensed',sans-serif;font-size:12px;padding:4px 8px;border:1px solid var(--line);background:var(--white);color:var(--ink);cursor:pointer">
        <option value="30">Siste 30 dager</option>
        <option value="90" selected>Siste 90 dager</option>
        <option value="365">Siste sesong</option>
        <option value="0">All tid</option>
      </select>
      <button id="eff-refresh" style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border:1px solid var(--blue);background:none;color:var(--blue);cursor:pointer">▶ Analyser</button>
      <div id="eff-meta" style="font-size:11px;color:var(--ink-light);margin-left:auto"></div>
    </div>

    <div id="eff-summary" style="display:none;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px"></div>
    <div id="eff-regime-help" style="display:none;font-size:11px;color:var(--ink-light);margin:-8px 0 14px;line-height:1.5"></div>

    <div class="page-tabs" style="margin-bottom:0">
      <button class="page-tab active" data-tab="rpm">⚙ RPM-kurve</button>
      <button class="page-tab" data-tab="speed">⛵ Fartskurve</button>
      <button class="page-tab" data-tab="trips">⚓ Per tur</button>
    </div>

    <div id="eff-rpm-tab">
      <div class="eff-chart-card">
        <div class="eff-chart-head">
          <span class="eff-chart-title">L/h og L/nm per RPM-band</span>
          <span class="eff-chart-sub">Sweet spot markert i grønt</span>
        </div>
        <div class="eff-chart-body"><canvas id="eff-rpm-chart"></canvas></div>
      </div>
      <div id="eff-rpm-table" style="margin-top:12px"></div>
    </div>

    <div id="eff-speed-tab" style="display:none">
      <div class="eff-chart-card">
        <div class="eff-chart-head">
          <span class="eff-chart-title">L/h og L/nm per fart (kn)</span>
          <span class="eff-chart-sub">Optimal fart markert i grønt</span>
        </div>
        <div class="eff-chart-body"><canvas id="eff-spd-chart"></canvas></div>
      </div>
      <div id="eff-spd-table" style="margin-top:12px"></div>
    </div>

    <div id="eff-trips-tab" style="display:none">
      <div class="eff-chart-card">
        <div class="eff-chart-head">
          <span class="eff-chart-title">L/nm per tur</span>
          <span class="eff-chart-sub">Lavere er bedre · kun turer med loggført drivstoff</span>
        </div>
        <div class="eff-chart-body"><canvas id="eff-trips-chart"></canvas></div>
      </div>
      <div id="eff-trips-empty" style="display:none;padding:24px;text-align:center;font-size:13px;color:var(--ink-light)">Ingen turer med drivstoffdata funnet. Logg drivstoff via Turer-siden.</div>
    </div>

    <div id="eff-loading" style="display:none;padding:32px;text-align:center">
      <div class="spin" style="display:inline-block;margin-right:8px"></div>
      <span style="font-size:13px;color:var(--ink-light)">Korrelerer sensordata…</span>
    </div>

    <div id="eff-empty" style="display:none;padding:32px;text-align:center;font-size:13px;color:var(--ink-light)">
      Ingen korrelerte data funnet for valgt periode.<br>
      Sensorhistorikk fra kjøreturer med motor i gang trengs for å beregne effektivitetskurver.
    </div>

  <style>
    .eff-summary-card { background:var(--white);border:1px solid var(--line);padding:14px 16px; }
    .eff-summary-label { font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-light);margin-bottom:4px; }
    .eff-summary-value { font-family:'DM Mono','Courier New',monospace;font-size:1.5rem;font-weight:700;color:var(--ink);line-height:1.1; }
    .eff-summary-sub { font-size:11px;color:var(--ink-light);margin-top:3px; }
    .eff-summary-card.optimal { border-top:3px solid var(--ok); }
    .eff-summary-card.hump    { border-top:3px solid var(--warn); }
    .eff-regime-pill { display:inline-block;font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:1px 6px;margin-left:6px;vertical-align:middle;border:1px solid currentColor; }
    .eff-regime-low   { color:#003b7e; }
    .eff-regime-plane { color:var(--ok); }
    .eff-regime-hump  { color:var(--warn); }
    .eff-table tr.hump td { color:var(--warn); }

    .eff-chart-card { background:var(--white);border:1px solid var(--line);overflow:hidden; }
    .eff-chart-head { padding:12px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-wrap:wrap; }
    .eff-chart-title { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink); }
    .eff-chart-sub { font-size:11px;color:var(--ink-light);margin-left:auto; }
    .eff-chart-body { padding:12px;height:240px;position:relative; }
    .eff-chart-body canvas { width:100%!important;height:100%!important; }

    .eff-table { width:100%;border-collapse:collapse;font-size:12px; }
    .eff-table th { font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-light);padding:6px 10px;text-align:right;background:var(--surface);border-bottom:1px solid var(--line); }
    .eff-table th:first-child { text-align:left; }
    .eff-table td { padding:5px 10px;text-align:right;border-bottom:1px solid var(--line);font-family:'DM Mono','Courier New',monospace;font-size:11px; }
    .eff-table td:first-child { text-align:left;font-family:inherit;font-size:12px; }
    .eff-table tr.optimal { background:var(--ok-tint); }
    .eff-table tr.optimal td { color:var(--ok);font-weight:600; }
    .eff-table .badge-opt { font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:var(--ok);color:#fff;padding:1px 5px;margin-left:6px;vertical-align:middle; }
  </style>`;

  // Tab-bytting
  container.querySelectorAll('.page-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.page-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ['rpm', 'speed', 'trips'].forEach(t =>
        (container.querySelector(`#eff-${t}-tab`).style.display = btn.dataset.tab === t ? '' : 'none'));
    });
  });

  document.getElementById('eff-days').addEventListener('change', runAnalysis);
  document.getElementById('eff-refresh').addEventListener('click', runAnalysis);

  await runAnalysis();
}

async function runAnalysis() {
  const days = parseInt(document.getElementById('eff-days').value);
  const loading = document.getElementById('eff-loading');
  const empty   = document.getElementById('eff-empty');
  const summary = document.getElementById('eff-summary');

  loading.style.display = '';
  empty.style.display   = 'none';
  summary.style.display = 'none';
  ['rpm', 'speed', 'trips'].forEach(t => {
    const el = document.getElementById(`eff-${t}-tab`);
    if (el) el.style.opacity = '0.4';
  });

  try {
    const url = days > 0
      ? `${BASE()}/api/efficiency?days=${days}`
      : `${BASE()}/api/efficiency`;

    const [effData, tripsData] = await Promise.all([
      fetch(url).then(r => r.json()),
      fetch(`${BASE()}/api/trips?limit=50`).then(r => r.json()).catch(() => ({ trips: [] })),
    ]);

    loading.style.display = 'none';
    ['rpm', 'speed', 'trips'].forEach(t => {
      const el = document.getElementById(`eff-${t}-tab`);
      if (el) el.style.opacity = '';
    });

    if (!effData.sample_count) {
      empty.style.display = '';
      return;
    }

    const meta = document.getElementById('eff-meta');
    if (meta) {
      const fromStr = new Date(effData.from).toLocaleDateString('no');
      const toStr   = new Date(effData.to).toLocaleDateString('no');
      meta.textContent = `${effData.sample_count.toLocaleString('no')} korrelerte målinger · ${fromStr}–${toStr}`;
    }

    renderSummary(effData);
    await ensureChartJS();
    renderRpmChart(effData);
    renderSpdChart(effData);
    renderTripsChart(tripsData.trips || tripsData);
  } catch (err) {
    loading.style.display = 'none';
    empty.style.display   = '';
    console.error('[efficiency]', err);
  }
}

function renderSummary(data) {
  const el = document.getElementById('eff-summary');
  el.style.display = 'grid';

  const ol  = data.optimal_low;
  const op  = data.optimal_plane;
  const orl = data.optimal_rpm_low;
  const orp = data.optimal_rpm_plane;
  const reg = data.regimes || { low_max: 10, plane_min: 20 };

  const card = (title, spd, rpm, sub) => `
    <div class="eff-summary-card optimal">
      <div class="eff-summary-label">${title}</div>
      <div class="eff-summary-value">${spd ? `${spd.speed_mid.toFixed(1)} kn` : '—'}</div>
      <div class="eff-summary-sub">${spd
        ? `${spd.avg_lnm} L/nm · ${spd.avg_lph} L/h${rpm ? ` · ${rpm.rpm_min}–${rpm.rpm_max} RPM` : ''}`
        : (sub || 'Trenger mer data')}</div>
    </div>`;

  el.innerHTML = `
    ${card(`Lav fart (≤ ${reg.low_max} kn)`, ol, orl)}
    ${card(`I plan (≥ ${reg.plane_min} kn)`, op, orp)}
    <div class="eff-summary-card">
      <div class="eff-summary-label">Datapunkter</div>
      <div class="eff-summary-value">${data.sample_count.toLocaleString('no')}</div>
      <div class="eff-summary-sub">${data.rpm_buckets.length} RPM-band · ${data.speed_buckets.length} fartsbånd</div>
    </div>`;

  const help = document.getElementById('eff-regime-help');
  if (help) {
    help.style.display = '';
    help.innerHTML = `
      <span class="eff-regime-pill eff-regime-low">Lav fart</span> deplassement ·
      <span class="eff-regime-pill eff-regime-hump">${reg.low_max}–${reg.plane_min} kn</span> "humpen" — dyrest L/nm ·
      <span class="eff-regime-pill eff-regime-plane">I plan</span> skroget løftes, L/nm faller igjen<br>
      Grønn = best i regimet · oransje = hump eller L/nm > ${INEFF_FACTOR}× regime-minimum (ineffektiv)`;
  }
}

function renderRpmChart(data) {
  destroyChart('rpm');
  const canvas = document.getElementById('eff-rpm-chart');
  if (!canvas || !window.Chart) return;

  const buckets   = data.rpm_buckets;
  const optLow    = data.optimal_rpm_low?.rpm_min;
  const optPlane  = data.optimal_rpm_plane?.rpm_min;
  const isOpt     = b => b.rpm_min === optLow || b.rpm_min === optPlane;
  const effCls    = classify(buckets, isOpt);
  const labels    = buckets.map(b => `${b.rpm_min}`);
  const lphVals   = buckets.map(b => b.avg_lph);
  const lnmVals   = buckets.map(b => b.avg_lnm);
  const barColors = effCls.map(c => EFF_COLORS[c].fill);
  const barBorder = effCls.map(c => EFF_COLORS[c].border);

  _charts['rpm'] = new window.Chart(canvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'L/h',
          data: lphVals,
          backgroundColor: barColors,
          borderColor: barBorder,
          borderWidth: 1,
          yAxisID: 'yLph',
          order: 2,
        },
        {
          type: 'line',
          label: 'L/nm',
          data: lnmVals,
          borderColor: '#b86000',
          backgroundColor: 'transparent',
          pointBackgroundColor: effCls.map(c => EFF_COLORS[c].border),
          pointRadius: 4,
          tension: 0.3,
          yAxisID: 'yLnm',
          order: 1,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Barlow Condensed', size: 11 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            title: items => `${items[0].label}–${+items[0].label + 100} RPM`,
            afterBody: items => {
              const idx = items[0].dataIndex;
              return `Snittfart: ${buckets[idx].avg_kn} kn · ${buckets[idx].samples} målinger`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'RPM', font: { family: 'Barlow Condensed', size: 10 } },
          grid: { color: '#f0f0f0' },
          ticks: { font: { family: 'Barlow Condensed', size: 10 } },
        },
        yLph: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'L/h', font: { family: 'Barlow Condensed', size: 10 } },
          grid: { color: '#f0f0f0' },
          ticks: { font: { family: 'DM Mono', size: 10 } },
        },
        yLnm: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'L/nm', font: { family: 'Barlow Condensed', size: 10 } },
          grid: { drawOnChartArea: false },
          ticks: { font: { family: 'DM Mono', size: 10 } },
        },
      },
    },
  });

  // Tabell
  const table = document.getElementById('eff-rpm-table');
  if (!table) return;
  const regLabel = r => r === 'hump' ? 'Hump' : r === 'plane' ? 'Plan' : 'Lav';
  const optBadge = b => b.rpm_min === optLow   ? '<span class="badge-opt">Best lav</span>'
                      : b.rpm_min === optPlane ? '<span class="badge-opt">Best plan</span>'
                      : '';
  const rows = buckets
    .map((b, i) => ({ b, c: effCls[i] }))
    .filter(({ b }) => b.avg_lnm != null);
  table.innerHTML = `
    <table class="eff-table">
      <thead><tr>
        <th>RPM-band</th><th>Regime</th><th>L/h</th><th>L/nm</th><th>Snitt kn</th><th>Målinger</th>
      </tr></thead>
      <tbody>
        ${rows.map(({ b, c }) => `
          <tr class="${c === 'optimal' ? 'optimal' : (c === 'hump' || c === 'inefficient' ? 'hump' : '')}">
            <td>${b.rpm_min}–${b.rpm_max}${optBadge(b)}</td>
            <td><span class="eff-regime-pill eff-regime-${b.regime}">${regLabel(b.regime)}</span>${c === 'inefficient' ? '<span class="eff-regime-pill eff-regime-hump">Ineff.</span>' : ''}</td>
            <td>${b.avg_lph.toFixed(1)}</td>
            <td>${b.avg_lnm.toFixed(2)}</td>
            <td>${b.avg_kn.toFixed(1)}</td>
            <td>${b.samples}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderSpdChart(data) {
  destroyChart('spd');
  const canvas = document.getElementById('eff-spd-chart');
  if (!canvas || !window.Chart) return;

  const buckets   = data.speed_buckets;
  const optLow    = data.optimal_low?.speed_min;
  const optPlane  = data.optimal_plane?.speed_min;
  const isOpt     = b => b.speed_min === optLow || b.speed_min === optPlane;
  const effCls    = classify(buckets, isOpt);
  const labels    = buckets.map(b => b.speed_mid.toFixed(1));
  const lphVals   = buckets.map(b => b.avg_lph);
  const lnmVals   = buckets.map(b => b.avg_lnm);
  const barColors = effCls.map(c => EFF_COLORS[c].fill);
  const barBorder = effCls.map(c => EFF_COLORS[c].border);

  _charts['spd'] = new window.Chart(canvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'L/h',
          data: lphVals,
          backgroundColor: barColors,
          borderColor: barBorder,
          borderWidth: 1,
          yAxisID: 'yLph',
          order: 2,
        },
        {
          type: 'line',
          label: 'L/nm',
          data: lnmVals,
          borderColor: '#003b7e',
          backgroundColor: 'transparent',
          pointBackgroundColor: effCls.map(c => EFF_COLORS[c].border),
          pointRadius: 4,
          tension: 0.3,
          yAxisID: 'yLnm',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Barlow Condensed', size: 11 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            title: items => `${items[0].label} kn (±0.25 kn)`,
            afterBody: items => `${buckets[items[0].dataIndex].samples} målinger`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Fart (kn)', font: { family: 'Barlow Condensed', size: 10 } },
          grid: { color: '#f0f0f0' },
          ticks: { font: { family: 'Barlow Condensed', size: 10 } },
        },
        yLph: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'L/h', font: { family: 'Barlow Condensed', size: 10 } },
          grid: { color: '#f0f0f0' },
          ticks: { font: { family: 'DM Mono', size: 10 } },
        },
        yLnm: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'L/nm', font: { family: 'Barlow Condensed', size: 10 } },
          grid: { drawOnChartArea: false },
          ticks: { font: { family: 'DM Mono', size: 10 } },
        },
      },
    },
  });

  // Tabell
  const table = document.getElementById('eff-spd-table');
  if (!table) return;
  const regLabel = r => r === 'hump' ? 'Hump' : r === 'plane' ? 'Plan' : 'Lav';
  const optBadge = b => b.speed_min === optLow   ? '<span class="badge-opt">Best lav</span>'
                      : b.speed_min === optPlane ? '<span class="badge-opt">Best plan</span>'
                      : '';
  table.innerHTML = `
    <table class="eff-table">
      <thead><tr>
        <th>Fart</th><th>Regime</th><th>L/h</th><th>L/nm</th><th>Målinger</th>
      </tr></thead>
      <tbody>
        ${buckets.map((b, i) => {
          const c = effCls[i];
          return `
          <tr class="${c === 'optimal' ? 'optimal' : (c === 'hump' || c === 'inefficient' ? 'hump' : '')}">
            <td>${b.speed_mid.toFixed(1)} kn${optBadge(b)}</td>
            <td><span class="eff-regime-pill eff-regime-${b.regime}">${regLabel(b.regime)}</span>${c === 'inefficient' ? '<span class="eff-regime-pill eff-regime-hump">Ineff.</span>' : ''}</td>
            <td>${b.avg_lph.toFixed(1)}</td>
            <td>${b.avg_lnm.toFixed(2)}</td>
            <td>${b.samples}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderTripsChart(trips) {
  destroyChart('trips');
  const canvas = document.getElementById('eff-trips-chart');
  const emptyEl = document.getElementById('eff-trips-empty');
  if (!canvas || !window.Chart) return;

  const validTrips = (trips || [])
    .filter(t => parseFloat(t.fuel_used_l) > 0 && parseFloat(t.distance_nm) > 0.5)
    .map(t => ({
      name: t.name || t.start_ts?.slice(0, 10) || 'Tur',
      lnm:  Math.round((parseFloat(t.fuel_used_l) / parseFloat(t.distance_nm)) * 100) / 100,
      nm:   parseFloat(t.distance_nm).toFixed(1),
      fuel: parseFloat(t.fuel_used_l).toFixed(1),
      date: t.start_ts,
    }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(-20); // maks 20 turer

  if (!validTrips.length) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const avgLnm = validTrips.reduce((s, t) => s + t.lnm, 0) / validTrips.length;

  _charts['trips'] = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: validTrips.map(t => t.name.length > 16 ? t.name.slice(0, 14) + '…' : t.name),
      datasets: [
        {
          label: 'L/nm',
          data: validTrips.map(t => t.lnm),
          backgroundColor: validTrips.map(t => t.lnm <= avgLnm ? '#1a704044' : '#003b7e33'),
          borderColor:     validTrips.map(t => t.lnm <= avgLnm ? '#1a7040'   : '#003b7e'),
          borderWidth: 1,
        },
        {
          type: 'line',
          label: `Snitt (${avgLnm.toFixed(2)} L/nm)`,
          data: validTrips.map(() => avgLnm),
          borderColor: '#b86000',
          borderDash: [5, 4],
          pointRadius: 0,
          tension: 0,
          borderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Barlow Condensed', size: 11 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            title: (items) => validTrips[items[0].dataIndex].name,
            afterBody: (items) => {
              const t = validTrips[items[0].dataIndex];
              return [`${t.fuel} L · ${t.nm} nm`, t.date ? new Date(t.date).toLocaleDateString('no') : ''];
            },
          },
        },
      },
      scales: {
        x: { ticks: { font: { family: 'Barlow Condensed', size: 10 }, maxRotation: 40 }, grid: { color: '#f0f0f0' } },
        y: {
          title: { display: true, text: 'L/nm', font: { family: 'Barlow Condensed', size: 10 } },
          ticks: { font: { family: 'DM Mono', size: 10 } },
          grid: { color: '#f0f0f0' },
        },
      },
    },
  });
}

function destroyChart(key) {
  if (_charts[key]) { _charts[key].destroy(); delete _charts[key]; }
}
