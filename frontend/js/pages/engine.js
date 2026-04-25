// pages/engine.js — Motor + Helse (faner)
// Motorside med alle YDEG-04/EVC datapunkter + motorhelse som fane
import * as SK from '../signalk.js';

const NORMAL = {
  rpm:      { min: 600,  max: 3600, warnHigh: 3200, cruise: [1500, 3000] },
  coolant:  { min: 0,    max: 110,  ok: [70, 90],   warnHigh: 90,  critHigh: 95 },
  oil:      { min: 0,    max: 8,    ok: [2.5, 6.0], warnLow: 1.5,  critLow: 1.0 },
  oilTemp:  { min: 0,    max: 130,  ok: [70, 105],  warnHigh: 105, critHigh: 115 },
  boost:    { min: 0,    max: 200,  ok: [0, 150],   warnHigh: 150 },
  load:     { min: 0,    max: 100,  warnHigh: 85 },
  fuelRate: { min: 0,    max: 60 },
  alt:      { min: 0,    max: 15,   ok: [13.8, 14.6], warnLow: 13.0 },
};

const _todayMax = { rpm: null, coolant: null, load: null, fuelRate: null };

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Motor</div>
      <div class="ph-s">Volvo Penta D6 330 · S/N 21918547 · via YDEG-04 gateway</div>
    </div>

    <div class="page-tabs">
      <button class="page-tab active" data-tab="motor">⚙ Motor</button>
      <button class="page-tab" data-tab="helse">❤ Helse</button>
    </div>

    <!-- MOTOR-FANE -->
    <div id="eng-motor-tab">
      <div id="eng-alarms"></div>

      <div class="eng-hero" id="eng-hero">
        <div class="eng-hero-left">
          <div class="eng-hero-label">Status</div>
          <div class="eng-hero-state" id="eh-state">—</div>
          <div class="eng-hero-gear" id="eh-gear">—</div>
        </div>
        <div class="eng-hero-right">
          <div class="eng-rpm-wrap">
            <div class="eng-rpm" id="eh-rpm">—</div>
            <div class="eng-rpm-unit">RPM</div>
          </div>
          <div class="eng-rpm-bar-wrap">
            <div class="eng-rpm-bar-bg">
              <div class="eng-rpm-normal"></div>
              <div class="eng-rpm-fill" id="eh-rpmbar" style="width:0%"></div>
            </div>
            <div class="eng-rpm-ticks"><span>0</span><span>1000</span><span>2000</span><span>3000</span><span>3600</span></div>
          </div>
        </div>
      </div>

      <div class="sl">Kjøling og smøring</div>
      <div class="sgrid">
        ${gc('cool',  'Kjølevann',  '—', '°C',  'EVC / NMEA 2000', '')}
        ${gc('oilt',  'Oljetemp.',  '—', '°C',  'EVC / NMEA 2000', '')}
        ${gc('oilp',  'Oljetrykk',  '—', 'bar', 'EVC / NMEA 2000', '')}
        ${gc('alt',   'Alternator', '—', 'V',   'EVC / NMEA 2000', '')}
      </div>

      <div class="sl">Ytelse og forbruk</div>
      <div class="sgrid">
        ${gc('load',  'Motorlast',  '—', '%',   'EVC / NMEA 2000', '')}
        ${gc('boost', 'Boost',      '—', 'kPa', 'EVC / NMEA 2000', '')}
        ${gc('fuel',  'Forbruk nå', '—', 'L/h', 'EVC / NMEA 2000', '')}
        ${gc('hours', 'Gangtimer',  '—', 't',   'Signal K',         'ok')}
      </div>

      <div class="sl">Normalområder</div>
      <div class="eng-gauges">
        ${gauge('g-cool',  'Kjølevann', '°C',  0, 110, 70,  90,  90,  null)}
        ${gauge('g-oilp',  'Oljetrykk', 'bar', 0, 8,   2.5, 6.0, null, 1.5)}
        ${gauge('g-load',  'Motorlast', '%',   0, 100, 20,  80,  85,  null)}
        ${gauge('g-boost', 'Boost',     'kPa', 0, 200, 0,   140, 150, null)}
      </div>

      <div class="sl">Drivstoff</div>
      <div class="sgrid">
        ${gc('fuelp',   'Dieseltank',    '—', '',    'Tankgiver', '')}
        ${gc('fuell',   'Tank liter',    '—', 'L',   'Tankgiver', '')}
        ${gc('range',   'Rekkevidde',    '—', 'nm',  'Beregnet',  '')}
        ${gc('fuelday', 'Forbruk i dag', '—', 'L',   'Beregnet',  '')}
      </div>

      <div class="sl">Dagens maks</div>
      <div class="sgrid">
        ${gc('mx-rpm',  'Maks RPM',       '—', 'rpm', 'I dag', '')}
        ${gc('mx-cool', 'Maks kjølevann', '—', '°C',  'I dag', '')}
        ${gc('mx-load', 'Maks last',      '—', '%',   'I dag', '')}
        ${gc('mx-fuel', 'Maks forbruk',   '—', 'L/h', 'I dag', '')}
      </div>

      <div class="sl">Spesifikasjoner</div>
      <div class="spg">
        <div class="spc"><div class="spk">Modell</div><div class="spv">Volvo Penta D6 330</div></div>
        <div class="spc"><div class="spk">Effekt</div><div class="spv">330 hk (243 kW)</div></div>
        <div class="spc"><div class="spk">Motor S/N</div><div class="spv m">21918547</div></div>
        <div class="spc"><div class="spk">Drev</div><div class="spv">Volvo Penta DP-D 1.76</div></div>
        <div class="spc"><div class="spk">EVC PCU</div><div class="spv m">21722886 · R1I</div></div>
        <div class="spc"><div class="spk">Normal kjølevann</div><div class="spv">70 – 90°C</div></div>
        <div class="spc"><div class="spk">Normal oljetrykk</div><div class="spv">2,5 – 6,0 bar</div></div>
        <div class="spc"><div class="spk">Dieseltank</div><div class="spv">370 liter</div></div>
      </div>
    </div>

    <!-- HELSE-FANE -->
    <div id="eng-helse-tab" style="display:none">
      <div class="wx-load" id="eh-loading"><div class="spin"></div>Henter motorsesjondata…</div>
      <div id="eh-body"></div>
    </div>

  <style>
    #eng-alarms { margin-bottom: 4px; }
    .eng-alarm-ok { display:flex;align-items:center;gap:8px;padding:10px 14px;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--ok);border-bottom:2px solid var(--ok);background:var(--ok-tint); }
    .eng-alarm-row { display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);animation:alarmIn .2s ease; }
    @keyframes alarmIn { from{opacity:0;transform:translateY(-3px)} to{opacity:1;transform:none} }
    .eng-alarm-cr { background:#fff5f5;border-left:4px solid var(--danger); }
    .eng-alarm-wn { background:#fffbf0;border-left:4px solid var(--warn); }
    .eng-alarm-in { background:var(--blue-tint);border-left:4px solid var(--blue); }
    .eng-alarm-icon { font-size:1.1rem;flex-shrink:0;margin-top:1px;width:20px;text-align:center; }
    .eng-alarm-cr .eng-alarm-icon { color:var(--danger); }
    .eng-alarm-wn .eng-alarm-icon { color:var(--warn); }
    .eng-alarm-in .eng-alarm-icon { color:var(--blue); }
    .eng-alarm-body { flex:1;min-width:0; }
    .eng-alarm-msg  { font-size:13px;font-weight:600;color:var(--ink);margin-bottom:2px; }
    .eng-alarm-meta { font-size:11px;color:var(--ink-light);font-family:'DM Mono',monospace; }
    .eng-alarm-badge { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border:1px solid;border-radius:2px;flex-shrink:0;margin-top:2px; }
    .eng-alarm-cr .eng-alarm-badge { color:var(--danger);border-color:var(--danger);background:#fff5f5; }
    .eng-alarm-wn .eng-alarm-badge { color:var(--warn);border-color:var(--warn);background:#fffbf0; }
    .eng-alarm-in .eng-alarm-badge { color:var(--blue);border-color:var(--blue);background:var(--blue-tint); }
    .eng-hero { background:var(--blue);color:#fff;padding:20px;margin-bottom:4px;display:flex;gap:20px;flex-wrap:wrap;border-bottom:3px solid var(--red);position:relative;overflow:hidden; }
    .eng-hero::before { content:'D6';position:absolute;right:8px;bottom:-20px;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:6rem;color:rgba(255,255,255,.04);pointer-events:none; }
    .eng-hero-left { flex:0 0 auto; }
    .eng-hero-right { flex:1;min-width:200px;display:flex;flex-direction:column;justify-content:center;gap:10px; }
    .eng-hero-label { font-size:10px;font-weight:400;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:6px; }
    .eng-hero-state { font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:2.2rem;line-height:1;color:#fff;margin-bottom:4px; }
    .eng-hero-gear { font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5); }
    .eng-hero-gear.forward { color:#5de8a0; }
    .eng-hero-gear.reverse { color:#f87171; }
    .eng-rpm-wrap { display:flex;align-items:baseline;gap:6px; }
    .eng-rpm { font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:3rem;line-height:1;color:#fff; }
    .eng-rpm-unit { font-size:11px;color:rgba(255,255,255,.4); }
    .eng-rpm-bar-bg { height:6px;background:rgba(255,255,255,.15);border-radius:3px;overflow:visible;position:relative;margin-bottom:5px; }
    .eng-rpm-normal { position:absolute;top:0;height:100%;border-radius:3px;left:calc(1500/3600*100%);width:calc((3000-1500)/3600*100%);background:rgba(93,232,160,.25); }
    .eng-rpm-fill { height:100%;border-radius:3px;transition:width .6s ease;background:#5de8a0;position:absolute;top:0;left:0; }
    .eng-rpm-ticks { display:flex;justify-content:space-between;font-size:9px;color:rgba(255,255,255,.3); }
    .eng-gauges { display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:4px; }
    @media(min-width:600px){ .eng-gauges { grid-template-columns:repeat(4,1fr); } }
    .eng-gauge { background:var(--white);border:1px solid var(--line);padding:14px 12px 10px; }
    .eng-gauge-title { font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#bbb;margin-bottom:10px; }
    .eng-gauge-val { font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.8rem;line-height:1;margin-bottom:4px; }
    .eng-gauge-unit { font-size:10px;color:#bbb;margin-bottom:10px; }
    .eng-gauge-track { height:5px;background:var(--line);border-radius:3px;overflow:hidden;position:relative;margin-bottom:5px; }
    .eng-gauge-ok { position:absolute;top:0;height:100%;background:rgba(0,150,80,.15); }
    .eng-gauge-fill { position:absolute;top:0;height:100%;left:0;border-radius:3px;transition:width .6s ease,background .3s; }
    .eng-gauge-range { font-size:10px;color:#ccc;display:flex;justify-content:space-between; }
    /* Helse-fane */
    .eh-kpi-row { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px; }
    @media(min-width:500px){ .eh-kpi-row { grid-template-columns:repeat(5,1fr); } }
    .eh-kpi { background:var(--white);border:1px solid var(--line);padding:12px 14px;position:relative;overflow:hidden; }
    .eh-kpi::before { content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--ek,var(--blue)); }
    .eh-kpi-l { font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#bbb;margin-bottom:3px; }
    .eh-kpi-v { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.3rem;color:var(--ink);line-height:1; }
    .eh-chart-card { background:var(--white);border:1px solid var(--line);margin-bottom:16px;overflow:hidden; }
    .eh-chart-head { padding:12px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between; }
    .eh-chart-title { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase; }
    .eh-chart-body { padding:8px;height:160px; }
    .eh-milestone { display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--white); }
    .eh-milestone:last-child { border-bottom:none; }
    .eh-ms-text { font-size:13px;color:var(--ink); }
    .eh-ms-sub  { font-size:11px;color:var(--ink-light); }
    .eh-ms-done { color:var(--ok);font-size:10px;font-weight:600;margin-left:auto;white-space:nowrap; }
    .eh-ai-wrap { background:var(--blue-tint);border:1px solid var(--blue);padding:14px;margin-bottom:8px; }
    .eh-ai-btn { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:8px 16px;background:var(--blue);border:none;color:#fff;cursor:pointer;width:100%; }
    .eh-ai-result { margin-top:10px;font-size:13px;color:var(--ink-medium);line-height:1.7;display:none; }
  </style>`;

  // Fane-logikk
  container.querySelectorAll('.page-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.page-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('eng-motor-tab').style.display = tab === 'motor' ? '' : 'none';
      document.getElementById('eng-helse-tab').style.display = tab === 'helse' ? '' : 'none';
      if (tab === 'helse') loadHelse();
    });
  });

  const state = SK.getState();
  if (Object.keys(state).length) onSkUpdate(state);
}

// ── Helse-fane ────────────────────────────────────────────────────────────────
let _helseLoaded = false;
let _helseChartjsReady = false;

async function loadHelse() {
  if (_helseLoaded) return;
  _helseLoaded = true;
  const loading = document.getElementById('eh-loading');
  const body    = document.getElementById('eh-body');
  const BASE    = () => localStorage.getItem('backend_url') || 'http://localhost:3001';
  try {
    const res  = await fetch(`${BASE()}/api/anomaly/engine-health`);
    const data = await res.json();
    const { sessions } = data;

    if (loading) loading.style.display = 'none';
    body.style.display = '';

    if (!sessions.length) {
      body.innerHTML = '<div class="empty">Ingen motorsesjondata ennå<br><span style="font-size:.7rem;font-weight:300">Logg turer for å bygge opp motorhelse-historikk</span></div>';
      return;
    }

    const allCool = sessions.map(s=>s.stats['propulsion.port.temperature']?.avg).filter(Boolean);
    const allOil  = sessions.map(s=>s.stats['propulsion.port.oilPressure']?.avg).filter(Boolean);
    const totalHrs= sessions.reduce((s,t)=>s+(parseFloat(t.engine_hours)||0),0);
    const latest  = sessions[0];

    const tL = v => v?.length>=3 ? (() => {
      const f=v.slice(0,Math.ceil(v.length/2)).reduce((a,b)=>a+b,0)/Math.ceil(v.length/2);
      const l=v.slice(-Math.ceil(v.length/2)).reduce((a,b)=>a+b,0)/Math.ceil(v.length/2);
      const p=Math.round((l-f)/f*100);
      return Math.abs(p)<3?'→ Stabil':l>f?`↑ +${p}%`:`↓ ${p}%`;
    })() : '—';

    const PATHS_CONFIG = [
      { path:'propulsion.port.temperature', label:'Kjølevann', unit:'°C', color:'#b01020' },
      { path:'propulsion.port.oilPressure',        label:'Oljetrykk', unit:'bar', color:'#e65c00' },
      { path:'propulsion.port.fuel.rate',           label:'Forbruk',   unit:'L/h', color:'#b86000' },
      { path:'propulsion.port.revolutions',        label:'RPM',       unit:'rpm', color:'#003b7e' },
    ];

    body.innerHTML = `
      <div class="eh-kpi-row">
        <div class="eh-kpi" style="--ek:#b01020">
          <div class="eh-kpi-l">Siste kjølevann</div>
          <div class="eh-kpi-v">${latest.stats['propulsion.port.temperature']?.avg?.toFixed(1)||'—'} °C</div>
        </div>
        <div class="eh-kpi" style="--ek:#e65c00">
          <div class="eh-kpi-l">Siste oljetrykk</div>
          <div class="eh-kpi-v">${latest.stats['propulsion.port.oilPressure']?.avg?.toFixed(2)||'—'} bar</div>
        </div>
        <div class="eh-kpi" style="--ek:#003b7e">
          <div class="eh-kpi-l">Loggede turer</div>
          <div class="eh-kpi-v">${sessions.length}</div>
        </div>
        <div class="eh-kpi">
          <div class="eh-kpi-l">Kjølevann trend</div>
          <div class="eh-kpi-v">${tL(allCool)}</div>
        </div>
        <div class="eh-kpi">
          <div class="eh-kpi-l">Gangtimer logg</div>
          <div class="eh-kpi-v">${Math.round(totalHrs).toLocaleString('no')} t</div>
        </div>
      </div>

      <div class="sl">Sesjon-for-sesjon — siste ${Math.min(sessions.length,20)} turer</div>
      ${PATHS_CONFIG.map(cfg => {
        const vals  = sessions.slice(0,20).reverse().map(s=>s.stats[cfg.path]?.avg||null);
        const dates = sessions.slice(0,20).reverse().map(s=>s.date?.slice(5)||'');
        return `
          <div class="eh-chart-card">
            <div class="eh-chart-head" style="border-top:3px solid ${cfg.color}">
              <span class="eh-chart-title" style="color:${cfg.color}">${cfg.label}</span>
              <span style="font-size:11px;color:var(--ink-light)">${vals.filter(Boolean).length} datapunkter</span>
            </div>
            <div class="eh-chart-body"><canvas id="ehc-${cfg.path.replace(/\./g,'-')}" style="width:100%;height:100%"></canvas></div>
          </div>`;
      }).join('')}

      <div class="sl">Vedlikeholdsmilepæler</div>
      <div style="border:1px solid var(--line);margin-bottom:20px">
        ${milestones(1085).map(m=>`
          <div class="eh-milestone">
            <div style="font-size:1.1rem;width:28px;text-align:center">${m.done?'✓':'○'}</div>
            <div>
              <div class="eh-ms-text">${m.label}</div>
              <div class="eh-ms-sub">${m.desc}</div>
            </div>
            <div class="eh-ms-done" style="color:${m.done?'var(--ok)':'var(--ink-light)'}">${m.done?'Passert':m.hours+' t'}</div>
          </div>`).join('')}
      </div>

      <div class="eh-ai-wrap">
        <button class="eh-ai-btn" id="eh-ai-btn">🤖 AI-vurdering av motorhelse</button>
        <div class="eh-ai-result" id="eh-ai-result"></div>
      </div>`;

    // Chart.js
    if (!_helseChartjsReady) {
      if (!window.Chart) await new Promise((res,rej) => {
        const s = document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';
        s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
      _helseChartjsReady = true;
    }

    for (const cfg of PATHS_CONFIG) {
      const canvas = document.getElementById(`ehc-${cfg.path.replace(/\./g,'-')}`);
      if (!canvas||!window.Chart) continue;
      const vals  = sessions.slice(0,20).reverse().map(s=>s.stats[cfg.path]?.avg||null);
      const dates = sessions.slice(0,20).reverse().map(s=>s.date?.slice(5)||'');
      if (!vals.some(v=>v!==null)) continue;
      const ctx  = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0,0,0,160);
      grad.addColorStop(0,cfg.color+'35'); grad.addColorStop(1,cfg.color+'05');
      new window.Chart(ctx, {
        type:'line',
        data:{ labels:dates, datasets:[{data:vals,borderColor:cfg.color,borderWidth:2,backgroundColor:grad,fill:true,tension:0.3,pointRadius:3,pointBackgroundColor:cfg.color}] },
        options:{
          responsive:true,maintainAspectRatio:false,animation:{duration:400},
          interaction:{mode:'index',intersect:false},
          plugins:{legend:{display:false},tooltip:{backgroundColor:'#0d0d0d',titleColor:'#9a9a9a',bodyColor:'#fff',borderColor:cfg.color,borderWidth:1,padding:8}},
          scales:{
            x:{grid:{display:false},ticks:{color:'#bbb',font:{family:'Barlow Condensed',size:10}}},
            y:{grid:{color:'#f0f0f0'},ticks:{color:'#bbb',font:{family:'Barlow Condensed',size:10}}},
          },
        },
      });
    }

    // AI
    document.getElementById('eh-ai-btn').onclick = async () => {
      const apiKey = localStorage.getItem('api_key');
      if (!apiKey) { alert('API-nøkkel mangler'); return; }
      const btn=document.getElementById('eh-ai-btn'), res2=document.getElementById('eh-ai-result');
      btn.textContent='⏳…'; btn.disabled=true; res2.style.display='block'; res2.textContent='…';
      const last5=sessions.slice(0,5).map(s=>{
        const c=s.stats['propulsion.port.temperature'];
        const o=s.stats['propulsion.port.oilPressure'];
        const f=s.stats['propulsion.port.fuel.rate'];
        return `${s.date}: kjølevann ${c?.avg?.toFixed(0)||'—'}°C (maks ${c?.max?.toFixed(0)||'—'}), olje ${o?.avg?.toFixed(2)||'—'} bar, forbruk ${f?.avg?.toFixed(1)||'—'} L/h`;
      }).join('\n');
      try {
        const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
          body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:400,messages:[{role:'user',content:`Volvo Penta D6 330hk, ~1085 gangtimer.\nSiste 5 sesjoner:\n${last5}\n\nGi en kort motorhelse-vurdering på norsk (maks 5 setninger): degradering, forbruk, hva sjekkes ved neste service?`}]})});
        const d=await r.json(); res2.textContent=d.content?.[0]?.text||'Ingen svar';
      } catch(e){res2.textContent='Feil: '+e.message;}
      finally{btn.textContent='🤖 AI-vurdering av motorhelse';btn.disabled=false;}
    };

  } catch(e) {
    if (loading) loading.innerHTML = `<span style="color:var(--danger)">Feil: ${e.message}</span>`;
  }
}

function milestones(h) {
  return [
    {hours:200,  done:h>=200,  label:'Oljeskift + oljefilter',   desc:'Volvo Penta D6 · 200t / 12 mnd'},
    {hours:200,  done:h>=200,  label:'Dieselfilter primær',       desc:'Art. 3840524 · 200t'},
    {hours:400,  done:h>=400,  label:'Impeller sjøvannskjøling',  desc:'Art. 21951346 · 400t — kritisk'},
    {hours:400,  done:h>=400,  label:'Drevoljeskift',             desc:'1 liter · 400t / 24 mnd'},
    {hours:1000, done:h>=1000, label:'1000-timers service',       desc:'Større gjennomgang anbefalt'},
    {hours:1200, done:h>=1200, label:'Belg drev',                 desc:'Art. 3853807 · kritisk · 3 år'},
  ];
}

// ── Live SK ───────────────────────────────────────────────────────────────────
export function onSkUpdate(state) {
  if (document.getElementById('eng-motor-tab')?.style.display === 'none') return;
  const on      = SK.get.engineOn(state);
  const rpm     = SK.get.rpm(state);
  const coolant = SK.get.coolant(state);
  const oilT    = SK.get.oilTemp(state);
  const oilP    = SK.get.oilPressureBar(state);
  const load    = SK.get.engineLoad(state);
  const boost   = SK.get.boostKpa(state);
  const fuelR   = SK.get.fuelRateLH(state);
  const hrs     = SK.get.engineHours(state);
  const gear    = SK.get.gear(state);
  const alt     = SK.get.alternatorVolt(state);
  const fuelPct = SK.get.fuelPct(state);
  const fuelLit = SK.get.fuelLitres(state);
  const alarms  = SK.get.engineAlarms(state);

  updateAlarms(alarms);

  setText('eh-state', on ? 'Startet' : 'Stoppet');
  const heroEl = document.getElementById('eng-hero');
  if (heroEl) {
    const hasCrit = alarms.some(a=>a.severity==='emergency');
    const hasWarn = alarms.some(a=>a.severity==='warning');
    heroEl.style.borderBottomColor = hasCrit?'var(--danger)':hasWarn?'var(--warn)':on?'#5de8a0':'var(--red)';
  }
  const gearEl = document.getElementById('eh-gear');
  if (gearEl) {
    gearEl.textContent = gear==='forward'?'Fremover':gear==='reverse'?'Revers':'Nøytral';
    gearEl.className = 'eng-hero-gear '+(gear==='forward'?'forward':gear==='reverse'?'reverse':'');
  }
  setText('eh-rpm', rpm!=null?rpm.toLocaleString('no'):'—');
  const rpmFill = document.getElementById('eh-rpmbar');
  if (rpmFill&&rpm!=null) {
    rpmFill.style.width = Math.min(100,(rpm/3600)*100)+'%';
    rpmFill.style.background = rpm>3200?'#f87171':rpm>3000?'#fbbf24':'#5de8a0';
  }

  setCell('cool',  coolant!=null?coolant+'°C':'—', 'kjølevann',  coolant!=null?(coolant>=95?'cr':coolant>=90?'wn':coolant>=70?'ok':''):'');
  setCell('oilt',  oilT!=null?oilT+'°C':'—',       'olje',        oilT!=null?(oilT>=115?'cr':oilT>=105?'wn':oilT>=60?'ok':''):'');
  setCell('oilp',  oilP!=null?oilP.toFixed(1)+' bar':'—', on?(oilP!=null?'normal 2,5–6 bar':''):'motor av', oilP!=null&&on?(oilP<1.0?'cr':oilP<1.5?'wn':'ok'):'');
  setCell('alt',   alt!=null&&alt>1?alt.toFixed(1)+' V':'—', on?(alt!=null&&alt>13.8?'lader':'kontroller'):'motor av', alt!=null&&on?(alt<13.0?'wn':alt>=13.8?'ok':''):'');
  setCell('load',  load!=null?load+'%':'—', '', load!=null?(load>=85?'wn':load>0?'ok':''):'');
  setCell('boost', boost!=null?boost+' kPa':'—', '', boost!=null?(boost>150?'wn':boost>0?'ok':''):'');
  setCell('fuel',  fuelR!=null&&on?fuelR+' L/h':'—', on?'':'motor av', fuelR!=null&&on?(fuelR>45?'wn':'ok'):'');
  setCell('hours', hrs!=null?Math.round(hrs).toLocaleString('no'):'—', 'timer', 'ok');
  setCell('fuelp', fuelPct!=null?fuelPct+'%':'—', '', fuelPct!=null?(fuelPct<15?'cr':fuelPct<25?'wn':'ok'):'');
  setCell('fuell', fuelLit!=null?fuelLit+' L':'—', 'av 370 L', '');
  const sogKn=SK.get.sogKnots(state);
  if (fuelLit!=null&&fuelR!=null&&fuelR>0.5&&sogKn>0.5) {
    const nm=Math.round((fuelLit/fuelR)*sogKn);
    setCell('range',nm+' nm',`ved ${fuelR} L/h · ${Math.round(sogKn*10)/10} kn`,nm<30?'wn':'ok');
  } else setCell('range','—','motor må gå','');
  updateDailyFuel(fuelR,on);
  updateGauge('g-cool',  coolant, NORMAL.coolant);
  updateGauge('g-oilp',  oilP,    NORMAL.oil);
  updateGauge('g-load',  load,    NORMAL.load);
  updateGauge('g-boost', boost,   NORMAL.boost);
  if (on) {
    if (rpm&&rpm>(_todayMax.rpm??0))         _todayMax.rpm=rpm;
    if (coolant&&coolant>(_todayMax.coolant??0)) _todayMax.coolant=coolant;
    if (load&&load>(_todayMax.load??0))      _todayMax.load=load;
    if (fuelR&&fuelR>(_todayMax.fuelRate??0))_todayMax.fuelRate=fuelR;
  }
  setCell('mx-rpm',  _todayMax.rpm!=null?_todayMax.rpm.toLocaleString('no'):'—','rpm','');
  setCell('mx-cool', _todayMax.coolant!=null?_todayMax.coolant+'°C':'—','',_todayMax.coolant>=90?'wn':'');
  setCell('mx-load', _todayMax.load!=null?_todayMax.load+'%':'—','',_todayMax.load>=85?'wn':'');
  setCell('mx-fuel', _todayMax.fuelRate!=null?_todayMax.fuelRate+' L/h':'—','','');
}

function updateAlarms(alarms) {
  const box = document.getElementById('eng-alarms');
  if (!box) return;
  if (!alarms||!alarms.length) {
    box.innerHTML=`<div class="eng-alarm-ok"><span>✓</span> Ingen aktive motormeldinger</div>`; return;
  }
  const sorted=[...alarms].sort((a,b)=>({'emergency':0,'warning':1,'info':2}[a.severity]??3)-({'emergency':0,'warning':1,'info':2}[b.severity]??3));
  box.innerHTML=sorted.map(a=>{
    const c=a.severity==='emergency'?'cr':a.severity==='warning'?'wn':'in';
    const icon=a.severity==='emergency'?'⚠':a.severity==='warning'?'◉':'ℹ';
    const lbl=a.severity==='emergency'?'Kritisk':a.severity==='warning'?'Advarsel':'Info';
    return `<div class="eng-alarm-row eng-alarm-${c}"><div class="eng-alarm-icon">${icon}</div><div class="eng-alarm-body"><div class="eng-alarm-msg">${a.message}</div><div class="eng-alarm-meta">${a.code} · ${a.source}</div></div><div class="eng-alarm-badge">${lbl}</div></div>`;
  }).join('');
}

let _fuelAccL=0,_lastFuelTs=null;
function updateDailyFuel(fuelRLH,engineOn) {
  const now=Date.now();
  if (engineOn&&fuelRLH!=null&&fuelRLH>0&&_lastFuelTs!=null) _fuelAccL+=fuelRLH*((now-_lastFuelTs)/3600000);
  _lastFuelTs=engineOn?now:null;
  setCell('fuelday',_fuelAccL>0?Math.round(_fuelAccL*10)/10+' L':'—','denne session','');
}

function updateGauge(id,value,norm) {
  const valEl=document.getElementById(id+'-val'),fillEl=document.getElementById(id+'-fill');
  if(!valEl||value==null) return;
  valEl.textContent=value+'';
  let cls='ok';
  if(norm.critHigh&&value>=norm.critHigh) cls='cr';
  else if(norm.warnHigh&&value>=norm.warnHigh) cls='wn';
  else if(norm.critLow&&value<=norm.critLow) cls='cr';
  else if(norm.warnLow&&value<=norm.warnLow) cls='wn';
  valEl.style.color=cls==='cr'?'var(--danger)':cls==='wn'?'var(--warn)':'var(--ok)';
  if(fillEl){const pct=Math.min(100,Math.max(0,((value-norm.min)/(norm.max-norm.min))*100));fillEl.style.width=pct+'%';fillEl.style.background=cls==='cr'?'var(--danger)':cls==='wn'?'var(--warn)':'var(--ok)';}
}

function gc(id,label,val,unit,source,cls) {
  return `<div class="sc"><div class="sc-line ${cls}" id="scl-${id}"></div><div class="sc-src">${source}</div><div class="sc-lbl">${label}</div><div class="sc-v ${cls}" id="scv-${id}">${val}</div><div class="sc-u" id="scu-${id}">${unit}</div></div>`;
}
function gauge(id,title,unit,min,max,okMin,okMax,warnHigh,warnLow) {
  const okLeft=((okMin-min)/(max-min))*100,okWidth=((okMax-okMin)/(max-min))*100;
  return `<div class="eng-gauge"><div class="eng-gauge-title">${title}</div><div class="eng-gauge-val" id="${id}-val" style="color:var(--ink-light)">—</div><div class="eng-gauge-unit">${unit}</div><div class="eng-gauge-track"><div class="eng-gauge-ok" style="left:${okLeft}%;width:${okWidth}%"></div><div class="eng-gauge-fill" id="${id}-fill" style="width:0%"></div></div><div class="eng-gauge-range"><span>${min}</span><span>${max} ${unit}</span></div></div>`;
}
function setCell(id,val,unit,cls) {
  const v=document.getElementById('scv-'+id),u=document.getElementById('scu-'+id),l=document.getElementById('scl-'+id);
  if(v){v.textContent=val;v.className='sc-v '+cls;}
  if(u) u.textContent=unit;
  if(l) l.className='sc-line '+cls;
}
function setText(id,val) { const el=document.getElementById(id); if(el) el.textContent=val; }
