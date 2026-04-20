// pages/planner.js — turplanlegger med vær og drivstoffestimat
import { toast } from '../app.js';
import * as SK from '../signalk.js';

const HOME = { lat: 58.1467, lon: 7.9956, name: 'Kristiansand' };

const DESTINATIONS = [
  { name: 'Oksøy fyr',       lat: 58.074, lon: 8.067,  desc: 'Fyrstasjon · 8 nm fra havn' },
  { name: 'Ryvingen fyr',    lat: 58.058, lon: 7.736,  desc: 'Fyrstasjon · Mandalsfjorden' },
  { name: 'Ny-Hellesund',    lat: 58.061, lon: 7.645,  desc: 'Populær ankerplass' },
  { name: 'Mandal',          lat: 58.027, lon: 7.459,  desc: 'Nordens sørligste by' },
  { name: 'Lindesnes',       lat: 57.983, lon: 7.046,  desc: 'Norges sydspiss · fyr' },
  { name: 'Farsund',         lat: 58.097, lon: 6.798,  desc: 'Kystby · god havn' },
  { name: 'Flekkefjord',     lat: 58.299, lon: 6.663,  desc: 'Den hvite by' },
  { name: 'Egersund',        lat: 58.450, lon: 6.002,  desc: 'Rogaland · stor havn' },
  { name: 'Stavanger',       lat: 58.970, lon: 5.733,  desc: 'Oljehovedstaden · 140 nm' },
  { name: 'Lillesand',       lat: 58.250, lon: 8.383,  desc: 'Kystperle Aust-Agder' },
  { name: 'Grimstad',        lat: 58.342, lon: 8.593,  desc: 'Ibsenby · gjestemarina' },
  { name: 'Arendal',         lat: 58.462, lon: 8.772,  desc: 'Kanalby · gode fasiliteter' },
  { name: 'Risør',           lat: 58.721, lon: 9.235,  desc: 'Den hvite by Telemark' },
  { name: 'Lyngør',          lat: 58.637, lon: 9.143,  desc: 'Bilfritt øysamfunn' },
  { name: 'Larvik',          lat: 59.054, lon: 10.037, desc: 'Vestfold · 230 nm' },
];

export async function render(container) {
  const fuelLitres = SK.get.fuelLitres(SK.getState());

  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Turplanlegger</div>
      <div class="ph-s">Distanse · drivstoffbehov · vær · AI-anbefaling</div>
    </div>

    <div class="plan-form">
      <div class="plan-row">
        <div class="plan-field">
          <label>Fra</label>
          <div class="plan-fixed">⚓ Kristiansand (hjemmehavn)</div>
        </div>
        <div class="plan-field" style="flex:2">
          <label>Til</label>
          <select id="pl-dest" class="set-inp" style="font-family:inherit">
            <option value="">— Velg destinasjon —</option>
            ${DESTINATIONS.map(d => `<option value="${d.lat},${d.lon},${d.name}">${d.name} · ${d.desc}</option>`).join('')}
            <option value="custom">+ Egendefinert posisjon</option>
          </select>
        </div>
      </div>

      <div id="pl-custom" style="display:none" class="plan-row">
        <div class="plan-field">
          <label>Breddegrad</label>
          <input class="set-inp" id="pl-clat" type="number" step="0.001" placeholder="58.100">
        </div>
        <div class="plan-field">
          <label>Lengdegrad</label>
          <input class="set-inp" id="pl-clon" type="number" step="0.001" placeholder="7.500">
        </div>
        <div class="plan-field">
          <label>Navn</label>
          <input class="set-inp" id="pl-cname" type="text" placeholder="Destinasjonsnavn">
        </div>
      </div>

      <div class="plan-row">
        <div class="plan-field">
          <label>Avreisedato</label>
          <input class="set-inp" id="pl-date" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="plan-field">
          <label>Planlagt hastighet</label>
          <select class="set-inp" id="pl-speed" style="font-family:inherit">
            <option value="18,28">Økonomi — 18 kn (~28 L/h)</option>
            <option value="22,38" selected>Cruise — 22 kn (~38 L/h)</option>
            <option value="27,55">Hurtig — 27 kn (~55 L/h)</option>
          </select>
        </div>
        <div class="plan-field">
          <label>Tur-retur?</label>
          <select class="set-inp" id="pl-roundtrip" style="font-family:inherit">
            <option value="1">Ja — beregn retur</option>
            <option value="0">Nei — enveis</option>
          </select>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn-primary" id="pl-calc-btn">Beregn tur</button>
        <div style="font-size:11px;color:var(--ink-light);align-self:center">
          ${fuelLitres != null ? `Tilgjengelig diesel: ${fuelLitres} L` : 'Diesel: ukjent (Signal K offline)'}
        </div>
      </div>
    </div>

    <div id="pl-result" style="display:none"></div>

  <style>
    .plan-form { background:var(--white);border:1px solid var(--line);border-top:3px solid var(--blue);padding:16px;margin-bottom:16px; }
    .plan-row { display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px; }
    .plan-field { flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px; }
    .plan-field label { font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-medium); }
    .plan-fixed { font-size:13px;color:var(--ink-light);padding:10px 12px;background:var(--surface);border:1px solid var(--line); }

    .plan-result { background:var(--white);border:1px solid var(--line);overflow:hidden; }
    .plan-result-hero { background:var(--blue);padding:20px;color:#fff;position:relative; }
    .plan-result-hero::after { content:'';position:absolute;left:0;bottom:0;right:0;height:3px;background:var(--red); }
    .plan-dest-name { font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.5rem;letter-spacing:.06em;text-transform:uppercase; }
    .plan-dest-sub  { font-size:12px;color:rgba(255,255,255,.5);margin-top:2px; }
    .plan-stats { display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin:12px 0; }
    @media(min-width:450px){ .plan-stats { grid-template-columns:repeat(4,1fr); } }
    .plan-stat { background:var(--white);padding:12px 14px; }
    .plan-stat-l { font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#bbb;margin-bottom:3px; }
    .plan-stat-v { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.3rem;color:var(--ink);line-height:1; }
    .plan-stat-s { font-size:10px;color:var(--ink-light);margin-top:2px; }
    .plan-stat.warn .plan-stat-v { color:var(--warn); }
    .plan-stat.crit .plan-stat-v { color:var(--danger); }

    .plan-wx { padding:12px 16px;border-bottom:1px solid var(--line); }
    .plan-wx-title { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);margin-bottom:8px; }
    .plan-wx-grid { display:flex;gap:16px;flex-wrap:wrap; }
    .plan-wx-item { font-size:12px;color:var(--ink); }
    .plan-wx-item span { color:var(--ink-light); }

    .plan-ai { padding:14px 16px; }
    .plan-ai-btn { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:10px 20px;background:var(--blue);border:none;color:#fff;cursor:pointer;width:100%; }
    .plan-ai-resp { margin-top:10px;font-size:13px;color:var(--ink-medium);line-height:1.7;background:var(--blue-tint);padding:12px 14px;border-left:3px solid var(--blue);display:none;white-space:pre-line; }
  </style>`;

  document.getElementById('pl-dest').onchange = () => {
    const val = document.getElementById('pl-dest').value;
    document.getElementById('pl-custom').style.display = val === 'custom' ? 'flex' : 'none';
  };

  document.getElementById('pl-calc-btn').onclick = calculate;
}

async function calculate() {
  const destVal   = document.getElementById('pl-dest').value;
  const dateVal   = document.getElementById('pl-date').value;
  const speedSel  = document.getElementById('pl-speed').value.split(',');
  const roundtrip = document.getElementById('pl-roundtrip').value === '1';
  const knots     = parseFloat(speedSel[0]);
  const lph       = parseFloat(speedSel[1]);

  let destLat, destLon, destName;

  if (!destVal) { toast('Velg destinasjon', 'err'); return; }
  if (destVal === 'custom') {
    destLat  = parseFloat(document.getElementById('pl-clat').value);
    destLon  = parseFloat(document.getElementById('pl-clon').value);
    destName = document.getElementById('pl-cname').value.trim() || 'Egendefinert';
    if (isNaN(destLat) || isNaN(destLon)) { toast('Ugyldig koordinater', 'err'); return; }
  } else {
    const parts = destVal.split(',');
    destLat  = parseFloat(parts[0]);
    destLon  = parseFloat(parts[1]);
    destName = parts[2];
  }

  const btn = document.getElementById('pl-calc-btn');
  btn.textContent = '⏳ Beregner…'; btn.disabled = true;

  const oneWayNm = haversineNm(HOME.lat, HOME.lon, destLat, destLon);
  const totalNm  = roundtrip ? oneWayNm * 2 : oneWayNm;
  const hours    = totalNm / knots;
  const fuelNeeded = hours * lph;
  const reserve  = 50;

  const fuelAvail  = SK.get.fuelLitres(SK.getState()) ?? null;
  const fuelOk     = fuelAvail != null ? fuelAvail - reserve >= fuelNeeded : null;

  // Hent vær for dato
  let wx = null;
  try {
    const midLat = (HOME.lat + destLat) / 2;
    const midLon = (HOME.lon + destLon) / 2;
    const { hostname } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    const metBase = isLocal ? 'https://api.met.no' : (localStorage.getItem('backend_url') || 'http://localhost:3001') + '/met';
    const wxRes = await fetch(`${metBase}/weatherapi/locationforecast/2.0/compact?lat=${midLat.toFixed(2)}&lon=${midLon.toFixed(2)}`, {
      headers: isLocal ? { 'User-Agent': 'Bavaria32App/1.0 tom.erik.thorsen@gmail.com' } : {},
    });
    if (wxRes.ok) {
      const wxData = await wxRes.json();
      // Finn timeserie nærmest planlagt dato
      const target = new Date(dateVal + 'T10:00:00');
      const ts = wxData.properties.timeseries;
      const closest = ts.reduce((best, t) => {
        const diff = Math.abs(new Date(t.time) - target);
        return diff < Math.abs(new Date(best.time) - target) ? t : best;
      }, ts[0]);
      const d = closest?.data?.instant?.details || {};
      const sym = closest?.data?.next_6_hours?.summary?.symbol_code || closest?.data?.next_1_hours?.summary?.symbol_code || '';
      wx = {
        temp:     Math.round(d.air_temperature || 0),
        wind:     Math.round(d.wind_speed || 0),
        windDir:  windDir(d.wind_from_direction || 0),
        bft:      beaufort(d.wind_speed || 0),
        symbol:   symIcon(sym),
        desc:     symDesc(sym),
        pressure: Math.round(d.air_pressure_at_sea_level || 0),
      };
    }
  } catch {}

  const result = document.getElementById('pl-result');
  result.style.display = '';

  const fuelStat = fuelAvail != null
    ? `${fuelAvail} L tilgjengelig → ${fuelOk ? Math.round(fuelAvail - reserve - fuelNeeded) + ' L igjen' : 'IKKE NOK'}`
    : 'Ukjent (Signal K offline)';

  result.innerHTML = `
    <div class="plan-result">
      <div class="plan-result-hero">
        <div class="plan-dest-name">${HOME.name} → ${destName}</div>
        <div class="plan-dest-sub">${roundtrip ? 'Tur-retur' : 'Enveistur'} · Planlagt ${new Date(dateVal).toLocaleDateString('no', {weekday:'long',day:'2-digit',month:'long'})}</div>
      </div>

      <div style="padding:0 16px">
        <div class="plan-stats">
          <div class="plan-stat">
            <div class="plan-stat-l">Distanse</div>
            <div class="plan-stat-v">${totalNm.toFixed(1)} nm</div>
            <div class="plan-stat-s">${roundtrip ? oneWayNm.toFixed(1)+' nm × 2' : 'enveis'}</div>
          </div>
          <div class="plan-stat">
            <div class="plan-stat-l">Reisetid</div>
            <div class="plan-stat-v">${formatDuration(hours)}</div>
            <div class="plan-stat-s">ved ${knots} kn</div>
          </div>
          <div class="plan-stat ${fuelOk === false ? 'crit' : fuelOk === true ? '' : ''}">
            <div class="plan-stat-l">Dieselbehov</div>
            <div class="plan-stat-v">${Math.round(fuelNeeded)} L</div>
            <div class="plan-stat-s">${fuelStat}</div>
          </div>
          <div class="plan-stat">
            <div class="plan-stat-l">Snitt forbruk</div>
            <div class="plan-stat-v">${lph} L/h</div>
            <div class="plan-stat-s">${(fuelNeeded / totalNm).toFixed(1)} L/nm</div>
          </div>
        </div>
      </div>

      ${wx ? `
        <div class="plan-wx">
          <div class="plan-wx-title">⛅ Vær rundt midtpunktet — ${new Date(dateVal).toLocaleDateString('no')}</div>
          <div class="plan-wx-grid">
            <div class="plan-wx-item">${wx.symbol} ${wx.desc}</div>
            <div class="plan-wx-item"><span>Vind:</span> ${wx.wind} m/s Bf${wx.bft} ${wx.windDir}</div>
            <div class="plan-wx-item"><span>Temp:</span> ${wx.temp}°C</div>
            <div class="plan-wx-item"><span>Trykk:</span> ${wx.pressure} hPa</div>
          </div>
        </div>` : ''}

      <div class="plan-ai">
        <button class="plan-ai-btn" id="pl-ai-btn">🤖 Få AI-anbefaling for denne turen</button>
        <div class="plan-ai-resp" id="pl-ai-resp"></div>
      </div>
    </div>`;

  // AI-anbefaling
  document.getElementById('pl-ai-btn').onclick = async () => {
    const apiKey = localStorage.getItem('api_key');
    if (!apiKey) { toast('API-nøkkel mangler', 'err'); return; }
    const aiBtn  = document.getElementById('pl-ai-btn');
    const aiResp = document.getElementById('pl-ai-resp');
    aiBtn.textContent = '⏳ Tenker…'; aiBtn.disabled = true;
    aiResp.style.display = 'block'; aiResp.textContent = '…';

    const ctx = [
      `Rute: Kristiansand → ${destName}${roundtrip ? ' og tilbake' : ''}`,
      `Distanse: ${totalNm.toFixed(1)} nm, reisetid ca ${formatDuration(hours)} ved ${knots} kn`,
      `Dieselbehov: ${Math.round(fuelNeeded)} L${fuelAvail != null ? `, tilgjengelig ${fuelAvail} L (50L reserve)` : ''}`,
      `Forbruk: ${lph} L/h`,
      wx ? `Vær: ${wx.desc}, vind ${wx.wind} m/s Bf${wx.bft} fra ${wx.windDir}, ${wx.temp}°C` : 'Vær: ikke tilgjengelig',
      `Dato: ${new Date(dateVal).toLocaleDateString('no', {weekday:'long',day:'2-digit',month:'long'})}`,
    ].join('\n');

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 500,
          messages: [{ role:'user', content:`Du er båtekspert og rådgiver for Bavaria Sport 32 "Summer" (35 fot, 330hk, hjemmehavn Kristiansand).

${ctx}

Gi en konkret turanbefaling på norsk (maks 6 setninger):
1. Er dette en gjennomførbar tur?
2. Er diesel OK med 50L reserve?
3. Er været akseptabelt for en 35-fots motorbåt med familie?
4. Praktiske råd / advarsler.` }],
        }),
      });
      const d = await res.json();
      aiResp.textContent = d.content?.[0]?.text || 'Ingen svar';
    } catch(e) { aiResp.textContent = 'Feil: ' + e.message; }
    finally { aiBtn.textContent = '🤖 Få AI-anbefaling for denne turen'; aiBtn.disabled = false; }
  };

  btn.textContent = 'Beregn tur'; btn.disabled = false;
}

// ── Hjelpefunksjoner ──────────────────────────────────────────────────────────
function haversineNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065, r = Math.PI / 180;
  const dLat = (lat2-lat1)*r, dLon = (lon2-lon1)*r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatDuration(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}t ${m}m` : `${m} min`;
}

function beaufort(ms) {
  const l = [0.3,1.6,3.4,5.5,8,10.8,13.9,17.2,20.8,24.5,28.5,32.7];
  for (let i=0; i<l.length; i++) if (ms < l[i]) return i;
  return 12;
}

function windDir(deg) {
  const dirs = ['N','NNØ','NØ','ØNØ','Ø','ØSØ','SØ','SSØ','S','SSV','SV','VSV','V','VNV','NV','NNV'];
  return dirs[Math.round(deg / 22.5) % 16];
}

const ICONS = { clearsky:'☀️', fair:'🌤️', partlycloudy:'⛅', cloudy:'☁️', fog:'🌫️', rain:'🌧️', lightrainshowers:'🌦️', snow:'❄️', thunder:'⛈️' };
const DESCS = { clearsky:'Klarvær', fair:'Lettskyet', partlycloudy:'Delvis skyet', cloudy:'Skyet', fog:'Tåke', rain:'Regn', lightrainshowers:'Lette regnbyger', snow:'Snø', thunder:'Torden' };
function symBase(c) { return (c||'').replace(/_day|_night|_polartwilight/,''); }
function symIcon(c) { const b=symBase(c); for(const k of Object.keys(ICONS)) if(b.startsWith(k)) return ICONS[k]; return '🌡️'; }
function symDesc(c) { const b=symBase(c); for(const k of Object.keys(DESCS)) if(b.startsWith(k)) return DESCS[k]; return b||''; }
