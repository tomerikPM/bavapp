// pages/cv.js — Sommers CV · auto-generert fra all loggdata
import { trips, costs } from '../api.js';
import { toast } from '../app.js';

const BASE = () => localStorage.getItem('backend_url') || 'http://localhost:3001';

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Sommers CV</div>
      <div class="ph-s">Bavaria Sport 32 · FAR999 · livshistorie i tall og ord</div>
    </div>
    <div id="cv-loading" class="wx-load"><div class="spin"></div>Samler data…</div>
    <div id="cv-body" style="display:none"></div>
  <style>
    .cv-hero { background:var(--blue);padding:28px 20px;position:relative;overflow:hidden;margin-bottom:0; }
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

  try {
    const [tripRes, costRes, healthRes] = await Promise.all([
      trips.list({ limit: 500 }),
      costs.summary({}),
      fetch(`${BASE()}/api/anomaly/engine-health`).then(r => r.json()).catch(() => ({ sessions: [] })),
    ]);
    renderCV(container, tripRes.data || [], costRes, healthRes);
  } catch(e) {
    document.getElementById('cv-loading').innerHTML = `<span style="color:var(--danger)">Feil: ${e.message}</span>`;
  }
}

function renderCV(container, allTrips, costSummary, healthData) {
  document.getElementById('cv-loading').style.display = 'none';
  const body = document.getElementById('cv-body');
  body.style.display = '';

  const totalNm  = allTrips.reduce((s,t) => s + (parseFloat(t.distance_nm)||0), 0);
  const totalHrs = allTrips.reduce((s,t) => s + (parseFloat(t.engine_hours)||0), 0);
  const maxSpd   = allTrips.reduce((m,t) => Math.max(m, parseFloat(t.max_speed_kn)||0), 0);
  const maxPax   = allTrips.reduce((m,t) => Math.max(m, parseInt(t.persons)||0), 0);
  const totalCost = costSummary.grandTotal || 0;
  const fuelL    = (costSummary.totals||[]).find(r => r.category==='fuel')?.total_liters || 0;

  const longestTrip = allTrips.reduce((best,t) =>
    (parseFloat(t.distance_nm)||0) > (parseFloat(best?.distance_nm)||0) ? t : best, null);

  // Sesongstatistikk
  const bySeason = {};
  for (const t of allTrips) {
    const yr = new Date(t.start_ts).getFullYear();
    if (!bySeason[yr]) bySeason[yr] = { trips:0, nm:0, hrs:0 };
    bySeason[yr].trips++;
    bySeason[yr].nm  += parseFloat(t.distance_nm)||0;
    bySeason[yr].hrs += parseFloat(t.engine_hours)||0;
  }

  const sessAvgCool = healthData.sessions
    .map(s => s.stats['propulsion.port.temperature']?.avg)
    .filter(Boolean);
  const avgCoolant = sessAvgCool.length
    ? (sessAvgCool.reduce((a,b)=>a+b,0)/sessAvgCool.length).toFixed(0) : null;

  const records = [
    { l:'Lengste tur',       v: longestTrip ? parseFloat(longestTrip.distance_nm).toFixed(1)+' nm':'—', s: longestTrip?.name||'' },
    { l:'Rekord fart',       v: maxSpd.toFixed(1)+' kn', s:'høyeste toppfart' },
    { l:'Flest ombord',      v: maxPax||'—', s: maxPax ? 'på én tur':'' },
    { l:'Total distanse',    v: Math.round(totalNm).toLocaleString('no')+' nm', s:'' },
    { l:'Gangtimer total',   v: Math.round(totalHrs).toLocaleString('no')+' t', s:'motor' },
    { l:'Diesel totalt',     v: Math.round(fuelL).toLocaleString('no')+' L', s:'forbrukt' },
  ];

  // Bygg AI-kontekst-streng (gjenbrukt i biografi-genereringen)
  const aiCtx = [
    `Bavaria Sport 32 "Summer" (FAR999, 2013), Kristiansand.`,
    `Motor: Volvo Penta D6 330hk, ${Math.round(totalHrs)} gangtimer.`,
    `Familie: Tom Erik (46), Mailinn (40), Eva (14), Erik (13), Isak (11), Liv (9).`,
    `${allTrips.length} turer, ${Math.round(totalNm)} nm totalt, rekord ${maxSpd.toFixed(1)} kn.`,
    `Flest ombord én tur: ${maxPax||'ukjent'}. Diesel brukt: ${Math.round(fuelL)} L. Totalkostnad: ${Math.round(totalCost).toLocaleString('no')} kr.`,
    avgCoolant ? `Gjennomsnittlig kjølevannstemperatur: ${avgCoolant}°C.` : '',
    allTrips.length ? `Siste destinasjoner: ${allTrips.slice(0,5).map(t=>t.name||'ukjent').filter(Boolean).join(', ')}.` : '',
  ].filter(Boolean).join('\n');

  body.innerHTML = `
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

    <div class="sl">Rekorder og høydepunkter</div>
    <div class="cv-recs">
      ${records.map(r => `
        <div class="cv-rec">
          <div class="cv-rec-l">${r.l}</div>
          <div class="cv-rec-v">${r.v}</div>
          ${r.s ? `<div class="cv-rec-s">${r.s}</div>` : ''}
        </div>`).join('')}
    </div>

    <div class="sl">Sesonghistorikk</div>
    ${Object.keys(bySeason).length ? `
      <div class="cv-seasons">
        ${Object.entries(bySeason).sort((a,b)=>b[0]-a[0]).map(([yr,s]) => `
          <div class="cv-srow">
            <div class="cv-syr">${yr}</div>
            <div class="cv-sbody">
              <span class="cv-sstat"><strong>${s.trips}</strong> turer</span>
              <span class="cv-sstat"><strong>${s.nm.toFixed(0)}</strong> nm</span>
              <span class="cv-sstat"><strong>${s.hrs.toFixed(1)}</strong>t motor</span>
            </div>
          </div>`).join('')}
      </div>` : '<div class="empty">Ingen sesongdata ennå</div>'}

    <div class="sl">Narrativ biografi</div>
    <div class="cv-bio">
      <div class="cv-bio-title">✦ AI-generert fra loggdata</div>
      <div id="cv-bio-wrap">
        <div class="cv-bio-hint">Klikk for å generere en personlig biografi om Summer basert på all loggdata.</div>
        <button class="cv-gen-btn" id="cv-gen-btn">🤖 Generer Sommers biografi</button>
      </div>
    </div>`;

  // Biografi-generator (gjenbrukbar)
  async function genBio() {
    const apiKey = localStorage.getItem('api_key');
    if (!apiKey) { toast('API-nøkkel mangler — legg inn i ⚙ Innstillinger', 'err'); return; }
    const btn  = document.getElementById('cv-gen-btn');
    const wrap = document.getElementById('cv-bio-wrap');
    btn.textContent = '⏳ Skriver biografi…'; btn.disabled = true;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `Skriv en levende, personlig biografi på norsk om båten "Summer" (Bavaria Sport 32). Skriv i første person som om båten forteller sin egen historie. Bruk en varm, stolt og litt poetisk tone. Bruk de konkrete tallene fra fakta nedenfor. Ikke lag punktlister — skriv sammenhengende prosa. Ca 250 ord.

${aiCtx}`,
          }],
        }),
      });
      const d = await res.json();
      const text = d.content?.[0]?.text || 'Ingen svar generert.';
      wrap.innerHTML = `
        <div class="cv-bio-text">${escHtml(text)}</div>
        <button class="cv-gen-btn" id="cv-gen-btn" style="margin-top:12px">🔄 Generer ny versjon</button>`;
      document.getElementById('cv-gen-btn').addEventListener('click', genBio);
    } catch(e) {
      wrap.innerHTML = `
        <div class="cv-bio-hint" style="color:var(--danger)">Feil: ${e.message}</div>
        <button class="cv-gen-btn" id="cv-gen-btn">Prøv igjen</button>`;
      document.getElementById('cv-gen-btn').addEventListener('click', genBio);
    }
  }

  document.getElementById('cv-gen-btn').addEventListener('click', genBio);
}

function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
