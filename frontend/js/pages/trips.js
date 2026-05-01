// pages/trips.js — turlogg med live turdeteksjon + Sommers CV som innebygd fane
import { trips } from '../api.js';
import { toast } from '../app.js';
import { getDieselFunFact } from '../fun.js';

let _activeTimer = null;
let _expandedId  = null;
let _activeTab   = 'trips';
let _leafletReady = false;

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

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Turer</div>
      <div class="ph-s">Automatisk GPS-spor · statistikk · historikk</div>
    </div>

    <!-- Faner -->
    <div class="trips-tabs">
      <button class="trips-tab active" id="tab-trips" data-tab="trips">⚓ Turer</button>
      <button class="trips-tab" id="tab-cv"   data-tab="cv">⛵ Sommers CV</button>
      <button class="trips-tab" id="tab-plan" data-tab="plan">🗺 Planlegger</button>
    </div>

    <!-- Turer-innhold -->
    <div id="trips-view">
      <div id="active-trip-banner" style="display:none;background:var(--ok);color:#fff;padding:16px 18px;margin-bottom:16px;border-bottom:3px solid #0d4a26">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:.7;margin-bottom:8px;display:flex;align-items:center;gap:6px">
          <span style="width:6px;height:6px;border-radius:50%;background:#fff;display:inline-block;animation:pulse 1.5s infinite"></span>
          TUR PÅGÅR
        </div>
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          <div><div style="font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px">Distanse</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.8rem;line-height:1" id="at-dist">—</div>
            <div style="font-size:10px;opacity:.6">nm</div></div>
          <div><div style="font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px">Varighet</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.8rem;line-height:1" id="at-dur">—</div>
            <div style="font-size:10px;opacity:.6">min</div></div>
          <div><div style="font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px">Maks fart</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.8rem;line-height:1" id="at-spd">—</div>
            <div style="font-size:10px;opacity:.6">kn</div></div>
          <div><div style="font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px">GPS-punkter</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.8rem;line-height:1" id="at-pts">—</div></div>
        </div>
        <div style="margin-top:14px">
          <button onclick="manualStopTrip()" style="background:rgba(255,255,255,.2);border:1.5px solid rgba(255,255,255,.5);color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:8px 16px;cursor:pointer">
            ⏹ Avslutt tur manuelt
          </button>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
        <button class="btn-primary" id="trip-add-btn">+ Logg tur manuelt</button>
        <button class="btn-secondary" id="trip-start-btn">▶ Start tur nå</button>
      </div>

      <div id="trip-form" style="display:none;flex-direction:column;gap:8px;padding:16px;background:var(--surface);border:1px solid var(--line);margin-bottom:16px">
        <input id="tf-name" placeholder="Navn på turen" style="font-family:inherit;font-size:.85rem;border:none;border-bottom:2px solid var(--blue);padding:9px 12px;background:var(--white);outline:none">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label style="font-size:10px;color:var(--ink-light);display:block;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">Startdato/-tid</label>
            <input id="tf-start" type="datetime-local" style="width:100%;font-family:inherit;font-size:.8rem;border:none;border-bottom:1px solid var(--line);padding:8px;background:var(--white);outline:none"></div>
          <div><label style="font-size:10px;color:var(--ink-light);display:block;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">Slutt</label>
            <input id="tf-end" type="datetime-local" style="width:100%;font-family:inherit;font-size:.8rem;border:none;border-bottom:1px solid var(--line);padding:8px;background:var(--white);outline:none"></div>
          <div><label style="font-size:10px;color:var(--ink-light);display:block;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">Distanse (nm)</label>
            <input id="tf-dist" type="number" step="0.1" style="width:100%;font-family:'DM Mono',monospace;font-size:.82rem;border:none;border-bottom:1px solid var(--line);padding:8px;background:var(--white);outline:none"></div>
          <div><label style="font-size:10px;color:var(--ink-light);display:block;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">Maks fart (kn)</label>
            <input id="tf-spd" type="number" step="0.1" style="width:100%;font-family:'DM Mono',monospace;font-size:.82rem;border:none;border-bottom:1px solid var(--line);padding:8px;background:var(--white);outline:none"></div>
          <div><label style="font-size:10px;color:var(--ink-light);display:block;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">Motortimer</label>
            <input id="tf-hrs" type="number" step="0.1" style="width:100%;font-family:'DM Mono',monospace;font-size:.82rem;border:none;border-bottom:1px solid var(--line);padding:8px;background:var(--white);outline:none"></div>
          <div><label style="font-size:10px;color:var(--ink-light);display:block;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">Ombord (antall)</label>
            <input id="tf-pax" type="number" style="width:100%;font-family:'DM Mono',monospace;font-size:.82rem;border:none;border-bottom:1px solid var(--line);padding:8px;background:var(--white);outline:none"></div>
        </div>
        <textarea id="tf-notes" placeholder="Notater" rows="2" style="font-family:inherit;font-size:.82rem;border:none;border-bottom:1px solid var(--line);padding:9px 12px;background:var(--white);outline:none;resize:vertical"></textarea>
        <div style="display:flex;gap:8px">
          <button class="btn-primary" id="tf-save">Lagre tur</button>
          <button class="btn-secondary" id="tf-cancel">Avbryt</button>
        </div>
      </div>

      <div id="trip-stats" style="display:none" class="krow"></div>
      <div id="trips-list"><div class="wx-load"><div class="spin"></div>Laster…</div></div>
    </div>

    <!-- CV-innhold -->
    <div id="cv-view" style="display:none"></div>

    <!-- Planlegger-innhold -->
    <div id="plan-view" style="display:none"></div>

  <style>
    /* Faner */
    .trips-tabs { display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--line); }
    .trips-tab {
      font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;
      letter-spacing:.1em;text-transform:uppercase;
      padding:10px 20px;border:none;background:none;
      color:var(--ink-light);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;
    }
    .trips-tab.active { color:var(--blue);border-bottom-color:var(--blue); }
    .trips-tab:hover:not(.active) { color:var(--ink); }

    /* Turliste */
    .trip-r { border:1px solid var(--line);border-top:none;background:var(--white);cursor:pointer;transition:background .12s; }
    .trip-r:first-child { border-top:1px solid var(--line); }
    .trip-r:hover { background:var(--surface); }
    .trip-r.expanded { border-bottom:none; }
    .trip-header { display:flex;align-items:center; }
    .trip-dc { flex:0 0 52px;text-align:center;padding:12px 8px;background:var(--blue);color:#fff;align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center; }
    .trip-d  { font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.4rem;line-height:1; }
    .trip-m  { font-family:'Barlow Condensed',sans-serif;font-size:10px;letter-spacing:.06em;text-transform:uppercase;opacity:.7; }
    .trip-i  { flex:1;padding:10px 14px;min-width:0; }
    .trip-n  { font-size:13px;font-weight:600;color:var(--ink);margin-bottom:3px; }
    .trip-s  { display:flex;gap:8px;flex-wrap:wrap; }
    .trip-st { font-family:'Barlow Condensed',sans-serif;font-size:12px;color:var(--ink-light); }
    .trip-chevron { padding:10px 14px;font-size:.75rem;color:#bbb;flex-shrink:0;transition:transform .2s; }
    .trip-r.expanded .trip-chevron { transform:rotate(180deg); }
    .trip-detail { border:1px solid var(--line);border-top:2px solid var(--blue);background:var(--surface);padding:16px;display:none;animation:fadeSlide .15s ease; }
    .trip-detail.open { display:block; }
    @keyframes fadeSlide { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
    .trip-detail-stats { display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:16px; }
    .td-stat { background:var(--white);border:1px solid var(--line);padding:10px 12px; }
    .td-stat-l { font-size:10px;color:var(--ink-light);letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px; }
    .td-stat-v { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.2rem;color:var(--ink);line-height:1; }
    .td-stat.warn .td-stat-v { color:var(--warn); }
    .td-stat.crit .td-stat-v { color:var(--danger); }
    .trip-charts-grid { display:grid;grid-template-columns:1fr 1fr;gap:10px; }
    @media (max-width:500px) { .trip-charts-grid { grid-template-columns:1fr; } }
    .trip-chart-card { background:var(--white);border:1px solid var(--line);overflow:hidden; }
    .trip-chart-head { display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line); }
    .trip-chart-title { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase; }
    .trip-chart-peak  { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.1rem; }
    .trip-chart-body  { padding:4px 6px 6px;height:90px; }
    .trip-funfact { margin-top:12px;padding:10px 12px;background:var(--white);border:1px solid var(--line);border-left:3px solid var(--blue);font-size:12px;font-style:italic;color:var(--ink-light); }
    .trip-funfact strong { color:var(--blue);font-style:normal; }

    /* GPS-kart per tur */
    .trip-map-wrap { position:relative;width:100%;max-width:640px;margin:0 auto; }
    .trip-map { aspect-ratio:1/1;background:var(--surface);border:1px solid var(--line);position:relative;overflow:hidden; }
    .trip-map-wrap:fullscreen { max-width:none;width:100vw;height:100vh;background:#000;display:flex;align-items:center;justify-content:center; }
    .trip-map-wrap:fullscreen .trip-map { aspect-ratio:auto;width:100%;height:100%;border:none; }
    .trip-map-fs {
      position:absolute;top:8px;right:8px;z-index:1000;
      width:34px;height:34px;border:none;border-radius:3px;
      background:rgba(255,255,255,.92);color:var(--ink);
      font-size:16px;line-height:1;cursor:pointer;
      box-shadow:0 1px 4px rgba(0,0,0,.25);
      display:flex;align-items:center;justify-content:center;
    }
    .trip-map-fs:hover { background:#fff; }

    /* CV-styles */
    .cv-hero { background:var(--blue);padding:28px 20px;position:relative;overflow:hidden; }
    .cv-hero::before { content:'SPORT 32';position:absolute;right:-10px;bottom:-20px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:5rem;letter-spacing:.08em;color:rgba(255,255,255,.04);pointer-events:none; }
    .cv-hero::after { content:'';position:absolute;left:0;bottom:0;right:0;height:3px;background:var(--red); }
    .cv-name { font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:2.2rem;letter-spacing:.08em;text-transform:uppercase;color:#fff;line-height:1; }
    .cv-sub  { font-size:12px;color:rgba(255,255,255,.45);font-weight:300;margin-top:4px;margin-bottom:16px; }
    .cv-hs   { display:grid;grid-template-columns:repeat(3,1fr);gap:16px; }
    @media(min-width:450px){ .cv-hs { grid-template-columns:repeat(5,1fr); } }
    .cv-hs-l { font-size:9px;font-weight:300;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:3px; }
    .cv-hs-v { font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.4rem;color:#fff;line-height:1; }
    .cv-hs-u { font-size:9px;color:rgba(255,255,255,.35); }
    .cv-recs { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px; }
    @media(min-width:500px){ .cv-recs { grid-template-columns:repeat(3,1fr); } }
    .cv-rec  { background:var(--white);border:1px solid var(--line);padding:12px 14px;border-left:3px solid var(--blue); }
    .cv-rec-l { font-size:9.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-light);margin-bottom:4px; }
    .cv-rec-v { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.2rem;color:var(--ink);line-height:1; }
    .cv-rec-s { font-size:10px;color:var(--ink-light);margin-top:2px; }
    .cv-seasons { border:1px solid var(--line);margin-bottom:16px; }
    .cv-srow { display:flex;align-items:center;border-bottom:1px solid var(--line); }
    .cv-srow:last-child { border-bottom:none; }
    .cv-syr  { flex:0 0 52px;background:var(--blue);color:#fff;text-align:center;padding:12px 8px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.1rem;align-self:stretch;display:flex;align-items:center;justify-content:center; }
    .cv-sbody { flex:1;padding:10px 14px;display:flex;gap:16px;flex-wrap:wrap; }
    .cv-sstat { font-family:'Barlow Condensed',sans-serif;font-size:13px;color:var(--ink-light); }
    .cv-sstat strong { color:var(--ink); }
    .cv-bio  { background:var(--white);border:1px solid var(--line);border-top:3px solid var(--blue);padding:16px;margin-bottom:16px; }
    .cv-bio-title { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);margin-bottom:10px; }
    .cv-bio-text  { font-size:13px;line-height:1.9;color:var(--ink-medium);white-space:pre-line; }
    .cv-bio-hint  { font-size:12px;color:var(--ink-light);font-style:italic;margin-bottom:8px; }
    .cv-gen-btn { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:10px 20px;background:var(--blue);border:none;color:#fff;cursor:pointer;width:100%;margin-top:8px; }
    .cv-gen-btn:hover { background:var(--blue-hover); }
  </style>`;

  // Fane-logikk
  container.querySelectorAll('.trips-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      container.querySelectorAll('.trips-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('trips-view').style.display = _activeTab === 'trips' ? '' : 'none';
      const cvView   = document.getElementById('cv-view');
      const planView = document.getElementById('plan-view');
      cvView.style.display   = _activeTab === 'cv'   ? '' : 'none';
      planView.style.display = _activeTab === 'plan' ? '' : 'none';
      if (_activeTab === 'cv' && !cvView._loaded) {
        cvView._loaded = true;
        loadCV(cvView);
      }
      if (_activeTab === 'plan' && !planView._loaded) {
        planView._loaded = true;
        import('./planner.js').then(m => m.render(planView)).catch(e => {
          planView.innerHTML = `<div class="empty">Feil: ${e.message}</div>`;
        });
      }
    });
  });

  await loadTrips();
  pollActiveTrip();

  document.getElementById('trip-add-btn').onclick = () => {
    const f = document.getElementById('trip-form');
    f.style.display = f.style.display === 'none' ? 'flex' : 'none';
  };
  document.getElementById('tf-cancel').onclick = () => { document.getElementById('trip-form').style.display = 'none'; };
  document.getElementById('trip-start-btn').onclick = async () => {
    await fetch(`${localStorage.getItem('backend_url')||'http://localhost:3001'}/api/trips/track/start`,
      { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
    toast('Tur startet ▶', 'ok');
    pollActiveTrip();
  };
  document.getElementById('tf-save').onclick = async () => {
    const start_ts = document.getElementById('tf-start').value;
    if (!start_ts) { toast('Startdato er påkrevd', 'err'); return; }
    await trips.create({
      name:         document.getElementById('tf-name').value.trim() || null,
      start_ts:     new Date(start_ts).toISOString(),
      end_ts:       document.getElementById('tf-end').value ? new Date(document.getElementById('tf-end').value).toISOString() : null,
      distance_nm:  document.getElementById('tf-dist').value || null,
      max_speed_kn: document.getElementById('tf-spd').value  || null,
      engine_hours: document.getElementById('tf-hrs').value  || null,
      persons:      document.getElementById('tf-pax').value  || null,
      notes:        document.getElementById('tf-notes').value.trim() || null,
    });
    document.getElementById('trip-form').style.display = 'none';
    toast('Tur lagret ✓', 'ok');
    await loadTrips();
  };

  window.manualStopTrip = async () => {
    await fetch(`${localStorage.getItem('backend_url')||'http://localhost:3001'}/api/trips/track/stop`,
      { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
    toast('Tur avsluttet ⏹');
    document.getElementById('active-trip-banner').style.display = 'none';
    setTimeout(loadTrips, 6000);
  };
}

export function onHide() {
  if (_activeTimer) { clearInterval(_activeTimer); _activeTimer = null; }
}

// ── Sommers CV ─────────────────────────────────────────────────────────────────
async function loadCV(container) {
  container.innerHTML = `<div class="wx-load"><div class="spin"></div>Samler data…</div>`;
  try {
    const { render } = await import('./cv.js');
    // cv.js forventer en container med ph-header — vi lager en wrapper uten header
    const wrapper = document.createElement('div');
    container.innerHTML = '';
    container.appendChild(wrapper);
    // Kall render men hopp over ph-headeren ved å bruke en enkel wrapper
    await renderCV(wrapper);
  } catch(e) {
    container.innerHTML = `<div class="empty">Feil: ${e.message}</div>`;
  }
}

async function renderCV(container) {
  // Importerer og bruker cv-logikken direkte
  const { trips: tripsApi, costs } = await import('../api.js');
  const BASE = () => localStorage.getItem('backend_url') || 'http://localhost:3001';

  container.innerHTML = `<div class="wx-load"><div class="spin"></div>Samler data…</div>`;

  try {
    const [tripRes, costRes, healthRes] = await Promise.all([
      tripsApi.list({ limit: 500 }),
      costs.summary({}),
      fetch(`${BASE()}/api/anomaly/engine-health`).then(r=>r.json()).catch(()=>({sessions:[]})),
    ]);

    const allTrips  = tripRes.data || [];
    const totalNm   = allTrips.reduce((s,t)=>s+(parseFloat(t.distance_nm)||0), 0);
    const totalHrs  = allTrips.reduce((s,t)=>s+(parseFloat(t.engine_hours)||0), 0);
    const maxSpd    = allTrips.reduce((m,t)=>Math.max(m,parseFloat(t.max_speed_kn)||0), 0);
    const maxPax    = allTrips.reduce((m,t)=>Math.max(m,parseInt(t.persons)||0), 0);
    const totalCost = costRes.grandTotal || 0;
    const fuelL     = (costRes.totals||[]).find(r=>r.category==='fuel')?.total_liters || 0;

    const longestTrip = allTrips.reduce((best,t)=>
      (parseFloat(t.distance_nm)||0)>(parseFloat(best?.distance_nm)||0)?t:best, null);

    const bySeason = {};
    for (const t of allTrips) {
      const yr = new Date(t.start_ts).getFullYear();
      if (!bySeason[yr]) bySeason[yr] = {trips:0,nm:0,hrs:0};
      bySeason[yr].trips++;
      bySeason[yr].nm  += parseFloat(t.distance_nm)||0;
      bySeason[yr].hrs += parseFloat(t.engine_hours)||0;
    }

    const sessAvgCool = healthRes.sessions
      .map(s=>s.stats['propulsion.port.temperature']?.avg).filter(Boolean);
    const avgCoolant = sessAvgCool.length
      ? (sessAvgCool.reduce((a,b)=>a+b,0)/sessAvgCool.length).toFixed(0) : null;

    const aiCtx = [
      `Bavaria Sport 32 "Summer" (FAR999, 2013), Kristiansand.`,
      `Motor: Volvo Penta D6 330hk, ${Math.round(totalHrs)} gangtimer.`,
      `Familie: Tom Erik (46), Mailinn (40), Eva (14), Erik (13), Isak (11), Liv (9).`,
      `${allTrips.length} turer, ${Math.round(totalNm)} nm totalt, rekord ${maxSpd.toFixed(1)} kn.`,
      `Flest ombord: ${maxPax||'ukjent'}. Diesel: ${Math.round(fuelL)} L. Kostnad: ${Math.round(totalCost).toLocaleString('no')} kr.`,
      avgCoolant ? `Snitt kjølevann: ${avgCoolant}°C.` : '',
      allTrips.length ? `Siste turer: ${allTrips.slice(0,5).map(t=>t.name||'ukjent').filter(Boolean).join(', ')}.` : '',
    ].filter(Boolean).join('\n');

    const records = [
      { l:'Lengste tur',     v:longestTrip?parseFloat(longestTrip.distance_nm).toFixed(1)+' nm':'—', s:longestTrip?.name||'' },
      { l:'Rekord fart',     v:maxSpd.toFixed(1)+' kn', s:'toppfart' },
      { l:'Flest ombord',    v:maxPax||'—', s:maxPax?'på én tur':'' },
      { l:'Total distanse',  v:Math.round(totalNm).toLocaleString('no')+' nm', s:'' },
      { l:'Gangtimer total', v:Math.round(totalHrs).toLocaleString('no')+' t', s:'motor' },
      { l:'Diesel totalt',   v:Math.round(fuelL).toLocaleString('no')+' L', s:'forbrukt' },
    ];

    container.innerHTML = `
      <div class="cv-hero">
        <div class="cv-name">Summer</div>
        <div class="cv-sub">Bavaria Sport 32 · Reg. FAR999 · Hjemmehavn Kristiansand · 2013–</div>
        <div class="cv-hs">
          <div><div class="cv-hs-l">Turer</div><div class="cv-hs-v">${allTrips.length}</div></div>
          <div><div class="cv-hs-l">Nautiske mil</div><div class="cv-hs-v">${Math.round(totalNm).toLocaleString('no')}</div><div class="cv-hs-u">nm</div></div>
          <div><div class="cv-hs-l">Gangtimer</div><div class="cv-hs-v">${Math.round(totalHrs).toLocaleString('no')}</div><div class="cv-hs-u">t</div></div>
          <div><div class="cv-hs-l">Totalkostnad</div><div class="cv-hs-v">${Math.round(totalCost/1000)}k</div><div class="cv-hs-u">kr</div></div>
          <div><div class="cv-hs-l">Rekord fart</div><div class="cv-hs-v">${maxSpd.toFixed(1)}</div><div class="cv-hs-u">kn</div></div>
        </div>
      </div>

      <div class="sl" style="margin-top:16px">Rekorder</div>
      <div class="cv-recs">
        ${records.map(r=>`<div class="cv-rec"><div class="cv-rec-l">${r.l}</div><div class="cv-rec-v">${r.v}</div>${r.s?`<div class="cv-rec-s">${r.s}</div>`:''}</div>`).join('')}
      </div>

      <div class="sl">Sesonghistorikk</div>
      ${Object.keys(bySeason).length ? `
        <div class="cv-seasons">
          ${Object.entries(bySeason).sort((a,b)=>b[0]-a[0]).map(([yr,s])=>`
            <div class="cv-srow">
              <div class="cv-syr">${yr}</div>
              <div class="cv-sbody">
                <span class="cv-sstat"><strong>${s.trips}</strong> turer</span>
                <span class="cv-sstat"><strong>${s.nm.toFixed(0)}</strong> nm</span>
                <span class="cv-sstat"><strong>${s.hrs.toFixed(1)}</strong>t motor</span>
              </div>
            </div>`).join('')}
        </div>` : '<div class="empty" style="padding:20px 0">Ingen sesongdata ennå</div>'}

      <div class="sl">Biografi</div>
      <div class="cv-bio">
        <div class="cv-bio-title">✦ AI-generert fra loggdata</div>
        <div id="cv-bio-wrap">
          <div class="cv-bio-hint">Klikk for å generere en personlig biografi om Summer basert på loggdata.</div>
          <button class="cv-gen-btn" id="cv-gen-btn">🤖 Generer Sommers biografi</button>
        </div>
      </div>`;

    // Biografi-generator
    async function genBio() {
      const apiKey = localStorage.getItem('api_key');
      if (!apiKey) { toast('API-nøkkel mangler', 'err'); return; }
      const btn  = document.getElementById('cv-gen-btn');
      const wrap = document.getElementById('cv-bio-wrap');
      btn.textContent = '⏳ Skriver…'; btn.disabled = true;
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method:'POST',
          headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
          body: JSON.stringify({
            model:'claude-sonnet-4-20250514', max_tokens:800,
            messages:[{role:'user',content:`Skriv en levende, personlig biografi på norsk om båten "Summer" (Bavaria Sport 32). Skriv i første person som om båten forteller sin egen historie. Bruk en varm, stolt og litt poetisk tone. Bruk konkrete tall fra fakta. Ikke lag punktlister — skriv sammenhengende prosa. Ca 250 ord.\n\n${aiCtx}`}],
          }),
        });
        const d = await res.json();
        const text = d.content?.[0]?.text || 'Ingen svar.';
        wrap.innerHTML = `<div class="cv-bio-text">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div><button class="cv-gen-btn" id="cv-gen-btn" style="margin-top:12px">🔄 Generer ny versjon</button>`;
        document.getElementById('cv-gen-btn').addEventListener('click', genBio);
      } catch(e) {
        wrap.innerHTML = `<div class="cv-bio-hint" style="color:var(--danger)">Feil: ${e.message}</div><button class="cv-gen-btn" id="cv-gen-btn">Prøv igjen</button>`;
        document.getElementById('cv-gen-btn').addEventListener('click', genBio);
      }
    }
    document.getElementById('cv-gen-btn').addEventListener('click', genBio);

  } catch(e) {
    container.innerHTML = `<div class="empty">Feil: ${e.message}</div>`;
  }
}

// ── Aktiv tur-polling ─────────────────────────────────────────────────────────
async function pollActiveTrip() {
  if (_activeTimer) clearInterval(_activeTimer);
  const check = async () => {
    try {
      const base = localStorage.getItem('backend_url') || 'http://localhost:3001';
      const data = await fetch(`${base}/api/trips/active`).then(r=>r.json());
      const banner = document.getElementById('active-trip-banner');
      if (!banner) { clearInterval(_activeTimer); return; }
      if (data.active) {
        banner.style.display = '';
        setText('at-dist', data.distance_nm ?? '—');
        setText('at-dur',  data.duration_min ?? '—');
        setText('at-spd',  data.max_speed_kn ?? '—');
        setText('at-pts',  data.points ?? '—');
      } else {
        if (banner.style.display !== 'none') { banner.style.display='none'; await loadTrips(); }
      }
    } catch {}
  };
  await check();
  _activeTimer = setInterval(check, 15000);
}

async function loadTrips() {
  const box = document.getElementById('trips-list');
  if (!box) return;
  try {
    const { data } = await trips.list({ limit: 30 });
    if (!data.length) {
      box.innerHTML = `<div class="empty">Ingen turer ennå<br><span style="font-size:.7rem;font-weight:300">Turer opprettes automatisk når du er i bevegelse med Signal K tilkoblet</span></div>`;
      return;
    }

    const totalNm  = data.reduce((s,t)=>s+(parseFloat(t.distance_nm)||0), 0);
    const totalHrs = data.reduce((s,t)=>s+(parseFloat(t.engine_hours)||0), 0);
    const maxSpd   = Math.max(...data.map(t=>parseFloat(t.max_speed_kn)||0));
    const statsBox = document.getElementById('trip-stats');
    if (statsBox) {
      statsBox.style.display = 'grid';
      statsBox.innerHTML = `
        <div class="kc"><div class="kc-l">Turer totalt</div><div class="kc-v">${data.length}</div></div>
        <div class="kc"><div class="kc-l">Total distanse</div><div class="kc-v">${totalNm.toFixed(1)} nm</div></div>
        <div class="kc"><div class="kc-l">Motortimer</div><div class="kc-v">${totalHrs.toFixed(1)} t</div></div>
        <div class="kc"><div class="kc-l">Rekord fart</div><div class="kc-v">${maxSpd.toFixed(1)} kn</div></div>`;
    }

    box.innerHTML = data.map(t => {
      const d   = new Date(t.start_ts);
      const day = d.toLocaleDateString('no',{day:'2-digit'});
      const mon = d.toLocaleDateString('no',{month:'short'}).replace('.','');
      const yr  = d.getFullYear();
      const dur = t.end_ts ? Math.round((new Date(t.end_ts)-new Date(t.start_ts))/60000) : null;
      return `
        <div class="trip-r" id="trip-row-${t.id}" data-trip-id="${t.id}">
          <div class="trip-header">
            <div class="trip-dc">
              <div class="trip-d">${day}</div>
              <div class="trip-m">${mon}</div>
              <div class="trip-m">${yr}</div>
            </div>
            <div class="trip-i">
              <div class="trip-n">${t.name||'Tur '+d.toLocaleDateString('no')}</div>
              <div class="trip-s">
                ${t.distance_nm  ?`<span class="trip-st"><strong>${parseFloat(t.distance_nm).toFixed(1)} nm</strong></span>`:''}
                ${t.max_speed_kn ?`<span class="trip-st">maks <strong>${parseFloat(t.max_speed_kn).toFixed(1)} kn</strong></span>`:''}
                ${t.avg_speed_kn ?`<span class="trip-st">snitt ${parseFloat(t.avg_speed_kn).toFixed(1)} kn</span>`:''}
                ${t.engine_hours ?`<span class="trip-st">${parseFloat(t.engine_hours).toFixed(1)}t motor</span>`:''}
                ${dur            ?`<span class="trip-st">${dur} min</span>`:''}
              </div>
              ${t.notes?`<div class="dum" style="margin-top:3px">${t.notes}</div>`:''}
            </div>
            <div class="trip-chevron">▼</div>
          </div>
        </div>
        <div class="trip-detail" id="trip-detail-${t.id}">
          <div class="wx-load" id="trip-detail-loading-${t.id}"><div class="spin"></div>Laster historikk…</div>
        </div>`;
    }).join('');

    box.querySelectorAll('.trip-r').forEach(row => {
      row.querySelector('.trip-header').addEventListener('click', () => {
        const id     = row.dataset.tripId;
        const detail = document.getElementById('trip-detail-'+id);
        const isOpen = row.classList.contains('expanded');
        box.querySelectorAll('.trip-r.expanded').forEach(r => {
          r.classList.remove('expanded');
          const d = document.getElementById('trip-detail-'+r.dataset.tripId);
          if (d) d.classList.remove('open');
        });
        if (!isOpen) {
          row.classList.add('expanded'); detail.classList.add('open');
          if (_expandedId !== id) { _expandedId = id; loadTripDetail(id); }
        } else { _expandedId = null; }
      });
    });
  } catch(e) {
    box.innerHTML = `<div class="empty">Feil: ${e.message}</div>`;
  }
}

// ── Turdetaljer (uten rapport) ────────────────────────────────────────────────
const _chartInstances = {};

async function loadTripDetail(tripId) {
  const detail = document.getElementById('trip-detail-'+tripId);
  if (!detail) return;
  try {
    const base = localStorage.getItem('backend_url') || 'http://localhost:3001';
    const [tripRes, statsRes] = await Promise.all([
      fetch(`${base}/api/trips/${tripId}`).then(r=>r.json()),
      fetch(`${base}/api/trips/${tripId}/stats`).then(r=>r.json()),
    ]);

    const t      = tripRes;
    const stats  = statsRes.stats || {};
    const maxRpm    = stats['propulsion.port.revolutions']        ? Math.round(stats['propulsion.port.revolutions'].max*60) : null;
    const avgRpm    = stats['propulsion.port.revolutions']        ? Math.round(stats['propulsion.port.revolutions'].avg*60) : null;
    const maxCool   = stats['propulsion.port.temperature'] ? Math.round(stats['propulsion.port.temperature'].max-273.15) : null;
    const avgCool   = stats['propulsion.port.temperature'] ? Math.round(stats['propulsion.port.temperature'].avg-273.15) : null;
    const maxOilP   = stats['propulsion.port.oilPressure']        ? Math.round((stats['propulsion.port.oilPressure'].max/100000)*10)/10 : null;
    const maxLoad   = stats['propulsion.port.engineLoad']         ? Math.round(stats['propulsion.port.engineLoad'].max*100) : null;
    const avgFuelLH = stats['propulsion.port.fuel.rate']           ? Math.round(stats['propulsion.port.fuel.rate'].avg*3600000*10)/10 : null;
    const minSoc    = stats['electrical.batteries.279.capacity.stateOfCharge'] ? Math.round(stats['electrical.batteries.279.capacity.stateOfCharge'].min*100) : null;
    const maxSpdKn  = stats['navigation.speedOverGround']      ? Math.round(stats['navigation.speedOverGround'].max*1.94384*10)/10 : null;
    const totalFuel = statsRes.total_fuel_l;
    const dur       = t.end_ts ? Math.round((new Date(t.end_ts)-new Date(t.start_ts))/60000) : null;

    const funFact = getDieselFunFact(totalFuel||(t.fuel_used_l?parseFloat(t.fuel_used_l):null));

    detail.innerHTML = `
      <div class="trip-detail-stats">
        ${statCard('Distanse',       t.distance_nm  ?parseFloat(t.distance_nm).toFixed(1)+' nm':'—','')}
        ${statCard('Varighet',       dur             ?dur+' min':'—','')}
        ${statCard('Maks fart',      maxSpdKn        ?maxSpdKn+' kn':(t.max_speed_kn?parseFloat(t.max_speed_kn).toFixed(1)+' kn':'—'),'')}
        ${statCard('Motortimer',     t.engine_hours  ?parseFloat(t.engine_hours).toFixed(2)+'t':'—','')}
        ${statCard('Dieselforbruk',  totalFuel       ?totalFuel+' L':'—','')}
        ${statCard('Snitt forbruk',  avgFuelLH       ?avgFuelLH+' L/h':'—','')}
        ${statCard('Maks RPM',       maxRpm          ?maxRpm.toLocaleString('no'):'—','')}
        ${statCard('Snitt RPM',      avgRpm          ?avgRpm.toLocaleString('no'):'—','')}
        ${statCard('Maks kjølevann', maxCool         ?maxCool+'°C':'—', maxCool>=90?'warn':'')}
        ${statCard('Snitt kjølevann',avgCool         ?avgCool+'°C':'—','')}
        ${statCard('Maks oljetrykk', maxOilP         ?maxOilP+' bar':'—','')}
        ${statCard('Maks last',      maxLoad         ?maxLoad+'%':'—', maxLoad>=85?'warn':'')}
        ${statCard('Min batteri',    minSoc          ?minSoc+'%':'—', minSoc<=20?'crit':minSoc<=30?'warn':'')}
      </div>
      ${t.notes?`<div style="font-size:12px;color:var(--ink-light);padding:8px 12px;background:var(--white);border:1px solid var(--line);margin-bottom:12px;font-style:italic">${t.notes}</div>`:''}
      ${funFact?`<div class="trip-funfact">⛽ <strong>${(totalFuel||parseFloat(t.fuel_used_l)||0).toFixed(1)} L diesel:</strong> ${funFact}</div>`:''}

      <div class="sl" style="margin-bottom:8px">Sensorhistorikk</div>
      <div class="trip-charts-grid" id="trip-charts-${tripId}">
        ${miniChartCard(tripId,'rpm',  'Motor RPM',           '#003b7e')}
        ${miniChartCard(tripId,'cool', 'Kjølevannstemperatur','#b01020')}
        ${miniChartCard(tripId,'soc',  'Batteri SOC',         '#1a7040')}
        ${miniChartCard(tripId,'fuel', 'Forbruk L/h',         '#e65c00')}
      </div>

      <div class="sl" style="margin:16px 0 8px">GPS-spor</div>
      <div class="trip-map-wrap" id="trip-map-wrap-${tripId}">
        <div id="trip-map-${tripId}" class="trip-map">
          ${Array.isArray(t.track) && t.track.length >= 2
            ? `<div class="wx-load" style="position:absolute;inset:0;display:flex"><div class="spin"></div>Laster kart…</div>`
            : `<div style="height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#bbb">Ingen GPS-spor logget for denne turen</div>`}
        </div>
        ${Array.isArray(t.track) && t.track.length >= 2
          ? `<button class="trip-map-fs" id="trip-map-fs-${tripId}" title="Fullskjerm">⛶</button>`
          : ''}
      </div>`;

    await ensureChartJS();
    const paths = {
      rpm:  { path:'propulsion.port.revolutions',                     scale:v=>Math.round(v*60),          color:'#003b7e', unit:'rpm', yMax:3800 },
      cool: { path:'propulsion.port.temperature',               scale:v=>Math.round(v-273.15),      color:'#b01020', unit:'°C',  yMax:110  },
      soc:  { path:'electrical.batteries.279.capacity.stateOfCharge', scale:v=>Math.round(v*100),         color:'#1a7040', unit:'%',   yMax:100  },
      fuel: { path:'propulsion.port.fuel.rate',                         scale:v=>Math.round(v*3600000*10)/10,color:'#e65c00', unit:'L/h', yMax:null },
    };
    const allData = await Promise.all(
      Object.entries(paths).map(([key,cfg]) =>
        fetch(`${base}/api/trips/${tripId}/sensors/${encodeURIComponent(cfg.path)}`)
          .then(r=>r.json()).then(d=>({key,cfg,data:d.data||[]})).catch(()=>({key,cfg,data:[]}))
      )
    );
    for (const {key,cfg,data} of allData) {
      const canvas = document.getElementById(`tc-${tripId}-${key}`);
      if (!canvas||!window.Chart) continue;
      const hasData = data.length>=2;
      const labels  = hasData?data.map(r=>fmtTime(r.ts)):['—'];
      const values  = hasData?data.map(r=>cfg.scale(r.value)):[0];
      const instKey = `${tripId}-${key}`;
      if (_chartInstances[instKey]) _chartInstances[instKey].destroy();
      const ctx  = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0,0,0,90);
      grad.addColorStop(0,cfg.color+'40'); grad.addColorStop(1,cfg.color+'04');
      _chartInstances[instKey] = new window.Chart(ctx, {
        type:'line',
        data:{labels,datasets:[{data:values,borderColor:cfg.color,borderWidth:1.5,backgroundColor:grad,fill:true,tension:0.3,pointRadius:0}]},
        options:{
          responsive:true,maintainAspectRatio:false,animation:{duration:300},
          interaction:{mode:'index',intersect:false},
          plugins:{legend:{display:false},tooltip:{backgroundColor:'#0d0d0d',titleColor:'#9a9a9a',bodyColor:'#fff',borderColor:cfg.color,borderWidth:1,padding:8,callbacks:{label:item=>'  '+item.parsed.y+' '+cfg.unit}}},
          scales:{
            x:{grid:{display:false},ticks:{color:'#bbb',maxRotation:0,maxTicksLimit:5,font:{family:'Barlow Condensed',size:9}}},
            y:{min:0,max:cfg.yMax??undefined,grid:{color:'#f0f0f0'},ticks:{color:'#bbb',maxTicksLimit:4,font:{family:'Barlow Condensed',size:9},callback:v=>v+' '+cfg.unit}},
          },
        },
      });
      if (hasData) {
        const peakEl = document.getElementById(`tc-${tripId}-${key}-peak`);
        if (peakEl) peakEl.textContent = Math.max(...values)+' '+cfg.unit;
      } else {
        const bodyEl = document.getElementById(`tc-${tripId}-${key}-body`);
        if (bodyEl) bodyEl.innerHTML = '<div style="height:90px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#bbb">Ingen historikkdata</div>';
      }
    }

    if (Array.isArray(t.track) && t.track.length >= 2) {
      renderTripMap(tripId, t).catch(() => {});
    }
  } catch(e) {
    const loading = document.getElementById('trip-detail-loading-'+tripId);
    if (loading) loading.innerHTML = `<span style="color:var(--danger)">Feil: ${e.message}</span>`;
  }
}

function statCard(l,v,c) { return `<div class="td-stat ${c}"><div class="td-stat-l">${l}</div><div class="td-stat-v">${v}</div></div>`; }
function miniChartCard(tripId,key,title,color) {
  return `<div class="trip-chart-card"><div class="trip-chart-head" style="border-top:2px solid ${color}"><span class="trip-chart-title" style="color:${color}">${title}</span><span class="trip-chart-peak" style="color:${color}" id="tc-${tripId}-${key}-peak">—</span></div><div class="trip-chart-body" id="tc-${tripId}-${key}-body"><canvas id="tc-${tripId}-${key}" style="display:block;width:100%;height:100%"></canvas></div></div>`;
}
function fmtTime(iso) { const d=new Date(iso); return d.toLocaleTimeString('no',{hour:'2-digit',minute:'2-digit'}); }

// ── Per-tur GPS-kart ──────────────────────────────────────────────────────────
const _tripMaps = {};

async function ensureLeaflet() {
  if (_leafletReady && window.L) return;
  if (window.L) { _leafletReady = true; return; }
  if (!document.querySelector('link[href*="leaflet@1.9.4"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  await new Promise((res, rej) => {
    if (document.querySelector('script[src*="leaflet@1.9.4"]')) {
      const wait = () => window.L ? res() : setTimeout(wait, 50);
      wait(); return;
    }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  _leafletReady = true;
}

async function renderTripMap(tripId, trip) {
  await ensureLeaflet();
  const el = document.getElementById('trip-map-'+tripId);
  if (!el || !window.L) return;
  el.innerHTML = '';

  if (_tripMaps[tripId]) { _tripMaps[tripId].remove(); delete _tripMaps[tripId]; }

  const latlngs = trip.track.map(p => [p.lat, p.lon]);
  const map = window.L.map(el, { zoomControl: true, scrollWheelZoom: false }).setView(latlngs[0], 12);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19,
  }).addTo(map);

  const line = window.L.polyline(latlngs, { color:'#003b7e', weight:3, opacity:.9, lineJoin:'round', lineCap:'round' }).addTo(map);

  window.L.marker(latlngs[0], {
    icon: window.L.divIcon({
      className: '',
      html: `<div style="width:12px;height:12px;background:#1a7040;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
      iconSize: [12,12], iconAnchor: [6,6],
    }),
  }).addTo(map).bindPopup('<b>Start</b>');

  const endPt = latlngs[latlngs.length-1];
  const dx = (endPt[0]-latlngs[0][0])**2 + (endPt[1]-latlngs[0][1])**2;
  if (dx > 1e-7) {
    window.L.marker(endPt, {
      icon: window.L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;background:#b01020;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [12,12], iconAnchor: [6,6],
      }),
    }).addTo(map).bindPopup('<b>Slutt</b>');
  }

  map.fitBounds(line.getBounds(), { padding: [25, 25], maxZoom: 14 });
  setTimeout(() => map.invalidateSize(), 100);
  _tripMaps[tripId] = map;

  const wrap = document.getElementById('trip-map-wrap-'+tripId);
  const fsBtn = document.getElementById('trip-map-fs-'+tripId);
  if (wrap && fsBtn) {
    fsBtn.onclick = (e) => {
      e.stopPropagation();
      if (document.fullscreenElement === wrap) document.exitFullscreen();
      else wrap.requestFullscreen?.().catch(() => {});
    };
    const onFsChange = () => {
      const isFs = document.fullscreenElement === wrap;
      fsBtn.textContent = isFs ? '⛶ Lukk' : '⛶';
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(line.getBounds(), { padding: [25, 25], maxZoom: 15 });
      }, 150);
    };
    wrap.addEventListener('fullscreenchange', onFsChange);
  }
}
function setText(id,val) { const el=document.getElementById(id); if(el) el.textContent=val; }
