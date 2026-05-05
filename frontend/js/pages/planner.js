// pages/planner.js — turplanlegger med flere stopp, live tank, faktisk-data forbruk og plotter-eksport
import { toast } from '../app.js';
import * as SK from '../signalk.js';

const HOME = { lat: 58.1467, lon: 7.9956, name: 'Kristiansand' };
const BASE = () => localStorage.getItem('backend_url') || 'http://localhost:3001';

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

const FUEL_RESERVE_L = 50;
const FALLBACK_SPEEDS = [
  { kn: 7,  lph: 5,  lnm: 0.71, regime: 'low'   },
  { kn: 12, lph: 30, lnm: 2.50, regime: 'hump'  },
  { kn: 18, lph: 28, lnm: 1.56, regime: 'plane' },
  { kn: 22, lph: 38, lnm: 1.73, regime: 'plane' },
  { kn: 27, lph: 55, lnm: 2.04, regime: 'plane' },
];

let _stops      = [];   // [{ lat, lon, name, key }]   — uten HOME
let _stopId     = 0;
let _speedOpts  = null; // [{ kn, lph, lnm, regime, samples }]
let _lastResult = null; // { points:[{lat,lon,name}], roundtrip, ... } for plotter-eksport

export async function render(container) {
  _stops = [];
  _stopId = 0;
  _lastResult = null;

  const fuelLitres = SK.get.fuelLitres(SK.getState());
  const fuelPct    = SK.get.fuelPct(SK.getState());

  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Turplanlegger</div>
      <div class="ph-s">Flere stopp · live tank · forbruk fra faktiske data · plotter-eksport</div>
    </div>

    <div class="plan-form">
      <div class="plan-tank" id="pl-tank">
        <span class="plan-tank-l">⛽ Tank</span>
        <span class="plan-tank-v" id="pl-tank-v">${fuelLitres != null ? `${fuelLitres} L (${fuelPct}%)` : 'ukjent'}</span>
        <span class="plan-tank-s">Reserve ${FUEL_RESERVE_L} L holdes igjen</span>
        <button class="plan-tank-r" id="pl-tank-refresh" title="Oppdater">⟳</button>
      </div>

      <div class="plan-route">
        <div class="plan-leg plan-leg-home">
          <div class="plan-leg-pin">⚓</div>
          <div class="plan-leg-name">${HOME.name} <span class="plan-leg-tag">(start · hjemmehavn)</span></div>
        </div>
        <div id="pl-stops"></div>
        <button class="plan-add-stop" id="pl-add-stop">+ Legg til stopp</button>
      </div>

      <div class="plan-row">
        <div class="plan-field">
          <label>Avreisedato</label>
          <input class="set-inp" id="pl-date" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="plan-field" style="flex:2">
          <label>Planlagt hastighet (fra logget data)</label>
          <select class="set-inp" id="pl-speed" style="font-family:inherit">
            <option value="">— laster faktiske data…</option>
          </select>
        </div>
        <div class="plan-field">
          <label>Tur-retur?</label>
          <select class="set-inp" id="pl-roundtrip" style="font-family:inherit">
            <option value="1">Ja — beregn retur til Kristiansand</option>
            <option value="0">Nei — enveis</option>
          </select>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
        <button class="btn-primary" id="pl-calc-btn">Beregn tur</button>
      </div>
    </div>

    <div id="pl-result" style="display:none"></div>

  <style>
    .plan-form { background:var(--white);border:1px solid var(--line);border-top:3px solid var(--blue);padding:16px;margin-bottom:16px; }
    .plan-row { display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px; }
    .plan-field { flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px; }
    .plan-field label { font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-medium); }

    .plan-tank { display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);padding:8px 12px;margin-bottom:12px; }
    .plan-tank-l { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-medium); }
    .plan-tank-v { font-family:'DM Mono',monospace;font-size:13px;color:var(--ink);font-weight:600; }
    .plan-tank-s { font-size:10.5px;color:var(--ink-light);margin-left:auto; }
    .plan-tank-r { background:none;border:1px solid var(--line);width:26px;height:26px;cursor:pointer;color:var(--ink-light);font-size:13px;line-height:1;border-radius:2px; }
    .plan-tank-r:hover { background:var(--white);color:var(--blue); }

    .plan-route { margin-bottom:12px; }
    .plan-leg { display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-bottom:none; }
    .plan-leg:last-of-type { border-bottom:1px solid var(--line); }
    .plan-leg-home { background:var(--blue-tint,#eef3fa);border-left:3px solid var(--blue); }
    .plan-leg-pin { width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:var(--blue);color:#fff;font-size:12px;flex-shrink:0; }
    .plan-leg-name { font-size:13px;color:var(--ink);font-weight:500; }
    .plan-leg-tag { color:var(--ink-light);font-weight:400;font-size:11px; }
    .plan-leg select, .plan-leg input { flex:1;font-family:inherit;font-size:13px;border:none;border-bottom:1px solid var(--line);background:var(--white);padding:6px 8px;outline:none;min-width:0; }
    .plan-leg .plan-leg-rm { background:none;border:1px solid var(--line);width:26px;height:26px;cursor:pointer;color:var(--danger);font-size:14px;line-height:1;border-radius:2px;flex-shrink:0; }
    .plan-leg .plan-leg-rm:hover { background:var(--white); }
    .plan-leg-custom { display:flex;gap:6px;flex:1;flex-wrap:wrap; }
    .plan-leg-custom input { flex:1;min-width:90px; }
    .plan-add-stop { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding:9px 14px;background:var(--white);border:1px dashed var(--blue);color:var(--blue);cursor:pointer;width:100%;margin-top:4px; }
    .plan-add-stop:hover { background:var(--blue-tint,#eef3fa); }

    .plan-result { background:var(--white);border:1px solid var(--line);overflow:hidden; }
    .plan-result-hero { background:var(--blue);padding:20px;color:#fff;position:relative; }
    .plan-result-hero::after { content:'';position:absolute;left:0;bottom:0;right:0;height:3px;background:var(--red); }
    .plan-dest-name { font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.5rem;letter-spacing:.04em;text-transform:uppercase;line-height:1.15; }
    .plan-dest-sub  { font-size:12px;color:rgba(255,255,255,.5);margin-top:4px; }
    .plan-stats { display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin:12px 0; }
    @media(min-width:450px){ .plan-stats { grid-template-columns:repeat(4,1fr); } }
    .plan-stat { background:var(--white);padding:12px 14px; }
    .plan-stat-l { font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#bbb;margin-bottom:3px; }
    .plan-stat-v { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.3rem;color:var(--ink);line-height:1; }
    .plan-stat-s { font-size:10px;color:var(--ink-light);margin-top:2px; }
    .plan-stat.warn .plan-stat-v { color:var(--warn); }
    .plan-stat.crit .plan-stat-v { color:var(--danger); }

    .plan-legs { padding:0 16px 12px; }
    .plan-legs-title { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);margin:8px 0 6px; }
    .plan-legs-tbl { width:100%;border-collapse:collapse;font-size:12px; }
    .plan-legs-tbl th { text-align:left;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-light);padding:6px 8px;border-bottom:1px solid var(--line); }
    .plan-legs-tbl td { padding:7px 8px;border-bottom:1px solid var(--line);font-family:'DM Mono',monospace;font-size:12px;color:var(--ink); }
    .plan-legs-tbl td:first-child { font-family:inherit; }

    .plan-wx { padding:12px 16px;border-bottom:1px solid var(--line); }
    .plan-wx-title { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);margin-bottom:8px; }
    .plan-wx-grid { display:flex;gap:16px;flex-wrap:wrap; }
    .plan-wx-item { font-size:12px;color:var(--ink); }
    .plan-wx-item span { color:var(--ink-light); }

    .plan-actions { padding:14px 16px;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--line); }
    .plan-action-btn { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding:10px 18px;border:none;cursor:pointer; }
    .plan-action-btn.primary { background:var(--blue);color:#fff; }
    .plan-action-btn.primary:hover { background:var(--blue-hover,#002a5c); }
    .plan-action-btn.secondary { background:var(--white);color:var(--blue);border:1px solid var(--blue); }
    .plan-action-btn.secondary:hover { background:var(--blue-tint,#eef3fa); }
    .plan-action-btn:disabled { opacity:.6;cursor:wait; }

    .plan-ai { padding:14px 16px; }
    .plan-ai-resp { margin-top:10px;font-size:13px;color:var(--ink-medium);line-height:1.7;background:var(--blue-tint,#eef3fa);padding:12px 14px;border-left:3px solid var(--blue);display:none;white-space:pre-line; }

    .speed-regime-low   { color:#1a7040; }
    .speed-regime-hump  { color:var(--warn); }
    .speed-regime-plane { color:var(--blue); }
  </style>`;

  // Initialiser med ett stopp så formen ikke er tom
  addStop();
  renderStops(container);

  // Last faktiske farts-data fra /api/efficiency parallelt
  loadSpeedOptions().then(() => {
    populateSpeedSelect(container);
  });

  container.querySelector('#pl-add-stop').onclick = () => {
    addStop();
    renderStops(container);
  };

  container.querySelector('#pl-tank-refresh').onclick = () => updateTankDisplay(container);

  container.querySelector('#pl-calc-btn').onclick = () => calculate(container);
}

// ── Stopp-håndtering ──────────────────────────────────────────────────────────

function addStop() {
  _stops.push({ key: ++_stopId, mode: 'preset', lat: null, lon: null, name: '' });
}

function renderStops(container) {
  const wrap = container.querySelector('#pl-stops');
  wrap.innerHTML = _stops.map((s, i) => `
    <div class="plan-leg" data-stop-key="${s.key}">
      <div class="plan-leg-pin">${i + 1}</div>
      ${s.mode === 'custom' ? `
        <div class="plan-leg-custom">
          <input type="number" step="0.001" placeholder="Bredde (lat)"  data-fld="lat"  value="${s.lat ?? ''}">
          <input type="number" step="0.001" placeholder="Lengde (lon)"  data-fld="lon"  value="${s.lon ?? ''}">
          <input type="text"                placeholder="Navn"          data-fld="name" value="${s.name || ''}">
        </div>` : `
        <select data-fld="preset">
          <option value="">— Velg destinasjon —</option>
          ${DESTINATIONS.map(d => `<option value="${d.lat},${d.lon},${d.name}" ${s.name === d.name ? 'selected' : ''}>${d.name} · ${d.desc}</option>`).join('')}
          <option value="__custom__">+ Egendefinert posisjon…</option>
        </select>`}
      <button class="plan-leg-rm" title="Fjern">×</button>
    </div>
  `).join('');

  wrap.querySelectorAll('.plan-leg').forEach(row => {
    const key = parseInt(row.dataset.stopKey);
    const stop = _stops.find(s => s.key === key);
    if (!stop) return;

    row.querySelector('.plan-leg-rm').onclick = () => {
      _stops = _stops.filter(s => s.key !== key);
      if (!_stops.length) addStop();
      renderStops(container);
    };

    const presetSel = row.querySelector('select[data-fld="preset"]');
    if (presetSel) {
      presetSel.onchange = () => {
        const v = presetSel.value;
        if (v === '__custom__') {
          stop.mode = 'custom'; stop.lat = null; stop.lon = null; stop.name = '';
          renderStops(container);
        } else if (v) {
          const [lat, lon, name] = v.split(',');
          stop.mode = 'preset';
          stop.lat = parseFloat(lat);
          stop.lon = parseFloat(lon);
          stop.name = name;
        } else {
          stop.lat = null; stop.lon = null; stop.name = '';
        }
      };
    }
    row.querySelectorAll('input[data-fld]').forEach(inp => {
      inp.oninput = () => {
        const fld = inp.dataset.fld;
        if (fld === 'lat' || fld === 'lon') {
          stop[fld] = inp.value === '' ? null : parseFloat(inp.value);
        } else {
          stop[fld] = inp.value;
        }
      };
    });
  });
}

// ── Faktiske farts-buckets fra /api/efficiency ────────────────────────────────

async function loadSpeedOptions() {
  if (_speedOpts) return _speedOpts;
  try {
    const res = await fetch(`${BASE()}/api/efficiency?days=365`);
    const d   = await res.json();
    const buckets = (d.speed_buckets || [])
      .filter(b => b.samples >= 3 && b.speed_mid >= 4) // dropp sløv-trolling og støy
      .map(b => ({
        kn:      b.speed_mid,
        lph:     b.avg_lph,
        lnm:     b.avg_lnm,
        regime:  b.regime,
        samples: b.samples,
      }));
    _speedOpts = buckets.length ? buckets : FALLBACK_SPEEDS.map(f => ({ ...f, samples: 0 }));
  } catch {
    _speedOpts = FALLBACK_SPEEDS.map(f => ({ ...f, samples: 0 }));
  }
  return _speedOpts;
}

function populateSpeedSelect(container) {
  const sel = container.querySelector('#pl-speed');
  if (!sel || !_speedOpts) return;
  const opts = _speedOpts;

  // Velg cruise-default: høyeste plane-bucket med best L/nm, ellers midt-bucket
  const planeBuckets = opts.filter(o => o.regime === 'plane');
  const cruiseDefault = planeBuckets.length
    ? planeBuckets.reduce((best, b) => (b.lnm < best.lnm ? b : best))
    : opts[Math.floor(opts.length / 2)];

  const labelFor = (o) => {
    const regimeTag = o.regime === 'low' ? 'lav' : o.regime === 'plane' ? 'plan' : 'plog';
    const samples   = o.samples ? `· ${o.samples} pkt` : '· estimat';
    const lnm       = o.lnm != null ? `${o.lnm.toFixed(2)} L/nm` : '—';
    return `${o.kn.toFixed(1)} kn · ${o.lph.toFixed(1)} L/h · ${lnm} (${regimeTag} ${samples})`;
  };

  sel.innerHTML = opts.map(o => {
    const isDef = o === cruiseDefault;
    return `<option value="${o.kn},${o.lph},${o.lnm ?? ''}" ${isDef ? 'selected' : ''} class="speed-regime-${o.regime}">${labelFor(o)}</option>`;
  }).join('');
}

// ── Tank-oppdatering ──────────────────────────────────────────────────────────

function updateTankDisplay(container) {
  const fuelLitres = SK.get.fuelLitres(SK.getState());
  const fuelPct    = SK.get.fuelPct(SK.getState());
  const el = container.querySelector('#pl-tank-v');
  if (el) el.textContent = fuelLitres != null ? `${fuelLitres} L (${fuelPct}%)` : 'ukjent (Signal K offline)';
}

// ── Beregn tur ────────────────────────────────────────────────────────────────

async function calculate(container) {
  // Valider stopp
  const valid = _stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  if (!valid.length) { toast('Legg til minst ett stopp', 'err'); return; }
  if (valid.length !== _stops.length) {
    toast('Noen stopp mangler koordinater — fyll inn eller fjern', 'err');
    return;
  }
  for (const s of valid) {
    if (!s.name) s.name = `WP ${valid.indexOf(s) + 1}`;
  }

  const dateVal   = container.querySelector('#pl-date').value;
  const speedVal  = container.querySelector('#pl-speed').value;
  if (!speedVal) { toast('Velg hastighet', 'err'); return; }
  const [knStr, lphStr] = speedVal.split(',');
  const knots = parseFloat(knStr);
  const lph   = parseFloat(lphStr);
  const roundtrip = container.querySelector('#pl-roundtrip').value === '1';

  // Bygg ruten: HOME → stopp[0..n] → (HOME hvis tur-retur)
  const sequence = [HOME, ...valid];
  if (roundtrip) sequence.push({ ...HOME, name: HOME.name + ' (retur)' });

  // Per-leg distanse
  const legs = [];
  for (let i = 1; i < sequence.length; i++) {
    const a = sequence[i - 1], b = sequence[i];
    const nm = haversineNm(a.lat, a.lon, b.lat, b.lon);
    legs.push({ from: a.name, to: b.name, nm });
  }
  const totalNm  = legs.reduce((s, l) => s + l.nm, 0);
  const hours    = totalNm / knots;
  const fuelNeeded = hours * lph;

  updateTankDisplay(container);
  const fuelAvail = SK.get.fuelLitres(SK.getState());
  const fuelOk    = fuelAvail != null ? (fuelAvail - FUEL_RESERVE_L) >= fuelNeeded : null;

  const btn = container.querySelector('#pl-calc-btn');
  btn.textContent = '⏳ Beregner…'; btn.disabled = true;

  // Vær — bruk midtpunktet av hele ruten
  let wx = null;
  try {
    const allLats = sequence.map(p => p.lat);
    const allLons = sequence.map(p => p.lon);
    const midLat = (Math.min(...allLats) + Math.max(...allLats)) / 2;
    const midLon = (Math.min(...allLons) + Math.max(...allLons)) / 2;
    const { hostname } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    const metBase = isLocal ? 'https://api.met.no' : BASE() + '/met';
    const wxRes = await fetch(`${metBase}/weatherapi/locationforecast/2.0/compact?lat=${midLat.toFixed(2)}&lon=${midLon.toFixed(2)}`, {
      headers: isLocal ? { 'User-Agent': 'Bavaria32App/1.0 tom.erik.thorsen@gmail.com' } : {},
    });
    if (wxRes.ok) {
      const wxData = await wxRes.json();
      const target = new Date(dateVal + 'T10:00:00');
      const ts = wxData.properties.timeseries;
      const closest = ts.reduce((best, t) =>
        Math.abs(new Date(t.time) - target) < Math.abs(new Date(best.time) - target) ? t : best, ts[0]);
      const d = closest?.data?.instant?.details || {};
      const sym = closest?.data?.next_6_hours?.summary?.symbol_code
               || closest?.data?.next_1_hours?.summary?.symbol_code || '';
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

  _lastResult = {
    sequence, legs, totalNm, hours, fuelNeeded, knots, lph, roundtrip, dateVal, wx,
    fuelAvail, fuelOk,
  };

  renderResult(container, _lastResult);

  btn.textContent = 'Beregn tur'; btn.disabled = false;
}

function renderResult(container, r) {
  const result = container.querySelector('#pl-result');
  result.style.display = '';

  const fuelStat = r.fuelAvail != null
    ? `${r.fuelAvail} L i tank → ${r.fuelOk ? Math.round(r.fuelAvail - FUEL_RESERVE_L - r.fuelNeeded) + ' L igjen' : 'IKKE NOK med ' + FUEL_RESERVE_L + ' L reserve'}`
    : 'Tank ukjent (Signal K offline)';

  const titleStops = r.sequence.map(p => p.name).join(' → ');

  result.innerHTML = `
    <div class="plan-result">
      <div class="plan-result-hero">
        <div class="plan-dest-name">${titleStops}</div>
        <div class="plan-dest-sub">${r.legs.length} etappe${r.legs.length !== 1 ? 'r' : ''} · ${new Date(r.dateVal).toLocaleDateString('no', {weekday:'long',day:'2-digit',month:'long'})}</div>
      </div>

      <div style="padding:0 16px">
        <div class="plan-stats">
          <div class="plan-stat">
            <div class="plan-stat-l">Total distanse</div>
            <div class="plan-stat-v">${r.totalNm.toFixed(1)} nm</div>
            <div class="plan-stat-s">${r.legs.length} etappe${r.legs.length !== 1 ? 'r' : ''}</div>
          </div>
          <div class="plan-stat">
            <div class="plan-stat-l">Reisetid</div>
            <div class="plan-stat-v">${formatDuration(r.hours)}</div>
            <div class="plan-stat-s">ved ${r.knots} kn</div>
          </div>
          <div class="plan-stat ${r.fuelOk === false ? 'crit' : ''}">
            <div class="plan-stat-l">Dieselbehov</div>
            <div class="plan-stat-v">${Math.round(r.fuelNeeded)} L</div>
            <div class="plan-stat-s">${fuelStat}</div>
          </div>
          <div class="plan-stat">
            <div class="plan-stat-l">Snitt forbruk</div>
            <div class="plan-stat-v">${r.lph} L/h</div>
            <div class="plan-stat-s">${(r.fuelNeeded / r.totalNm).toFixed(2)} L/nm</div>
          </div>
        </div>
      </div>

      <div class="plan-legs">
        <div class="plan-legs-title">Etapper</div>
        <table class="plan-legs-tbl">
          <thead>
            <tr><th>#</th><th>Fra → Til</th><th style="text-align:right">Distanse</th><th style="text-align:right">Tid</th><th style="text-align:right">Diesel</th></tr>
          </thead>
          <tbody>
            ${r.legs.map((l, i) => {
              const lh = l.nm / r.knots;
              const lf = lh * r.lph;
              return `<tr>
                <td>${i + 1}</td>
                <td style="font-family:inherit">${l.from} → ${l.to}</td>
                <td style="text-align:right">${l.nm.toFixed(1)} nm</td>
                <td style="text-align:right">${formatDuration(lh)}</td>
                <td style="text-align:right">${lf.toFixed(1)} L</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      ${r.wx ? `
        <div class="plan-wx">
          <div class="plan-wx-title">⛅ Vær rundt midtpunktet — ${new Date(r.dateVal).toLocaleDateString('no')}</div>
          <div class="plan-wx-grid">
            <div class="plan-wx-item">${r.wx.symbol} ${r.wx.desc}</div>
            <div class="plan-wx-item"><span>Vind:</span> ${r.wx.wind} m/s Bf${r.wx.bft} ${r.wx.windDir}</div>
            <div class="plan-wx-item"><span>Temp:</span> ${r.wx.temp}°C</div>
            <div class="plan-wx-item"><span>Trykk:</span> ${r.wx.pressure} hPa</div>
          </div>
        </div>` : ''}

      <div class="plan-actions">
        <button class="plan-action-btn primary"   id="pl-send-plotter">⬆ Send rute til plotter</button>
        <button class="plan-action-btn secondary" id="pl-cancel-plotter">⏹ Avbryt aktiv rute</button>
      </div>

      <div class="plan-ai">
        <button class="plan-action-btn secondary" id="pl-ai-btn" style="width:100%">🤖 Få AI-anbefaling for denne turen</button>
        <div class="plan-ai-resp" id="pl-ai-resp"></div>
      </div>
    </div>`;

  result.querySelector('#pl-send-plotter').onclick = () => sendToPlotter(container);
  result.querySelector('#pl-cancel-plotter').onclick = () => cancelActiveRoute();
  result.querySelector('#pl-ai-btn').onclick = () => requestAi(container, r);
}

// ── Plotter-eksport ───────────────────────────────────────────────────────────

async function sendToPlotter(container) {
  if (!_lastResult) return;
  const r = _lastResult;
  const btn = container.querySelector('#pl-send-plotter');
  btn.textContent = '⏳ Sender…'; btn.disabled = true;

  // Plotter får hele ruten inkl. start (HOME) og evt. retur, men vi sender bare
  // stopp-punktene (uten HOME-start) — navigate.js prepender båt-posisjon ved single-point.
  // Multi-point: vi inkluderer HOME som første punkt så plotter får hele rutelinja.
  const points = r.sequence.map(p => ({ lat: p.lat, lon: p.lon, name: p.name }));
  const routeName = `BavApp · ${r.sequence.slice(1).map(p => p.name).join(' → ')}`.slice(0, 60);

  try {
    const res = await fetch(`${BASE()}/api/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points, routeName }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast(d.error || `Plotter feilet (HTTP ${res.status})`, 'err');
      btn.textContent = '⬆ Send rute til plotter'; btn.disabled = false;
      return;
    }
    toast(`Rute sendt til plotter (${points.length} pkt) ✓`, 'ok');
    btn.textContent = '✓ Sendt til plotter'; btn.disabled = false;
  } catch (e) {
    toast('Feil: ' + e.message, 'err');
    btn.textContent = '⬆ Send rute til plotter'; btn.disabled = false;
  }
}

async function cancelActiveRoute() {
  try {
    const res = await fetch(`${BASE()}/api/navigate`, { method: 'DELETE' });
    if (res.ok) toast('Aktiv rute avbrutt ⏹', 'ok');
    else toast('Klarte ikke avbryte', 'err');
  } catch (e) { toast('Feil: ' + e.message, 'err'); }
}

// ── AI ────────────────────────────────────────────────────────────────────────

async function requestAi(container, r) {
  const apiKey = localStorage.getItem('api_key');
  if (!apiKey) { toast('API-nøkkel mangler', 'err'); return; }
  const btn  = container.querySelector('#pl-ai-btn');
  const resp = container.querySelector('#pl-ai-resp');
  btn.textContent = '⏳ Tenker…'; btn.disabled = true;
  resp.style.display = 'block'; resp.textContent = '…';

  const ctx = [
    `Rute: ${r.sequence.map(p => p.name).join(' → ')}`,
    `Etapper: ${r.legs.map(l => `${l.from}→${l.to} ${l.nm.toFixed(1)}nm`).join('; ')}`,
    `Total: ${r.totalNm.toFixed(1)} nm, ${formatDuration(r.hours)} ved ${r.knots} kn`,
    `Dieselbehov: ${Math.round(r.fuelNeeded)} L${r.fuelAvail != null ? `, i tank ${r.fuelAvail} L (${FUEL_RESERVE_L}L reserve)` : ''}`,
    `Forbruk: ${r.lph} L/h (${(r.fuelNeeded / r.totalNm).toFixed(2)} L/nm)`,
    r.wx ? `Vær: ${r.wx.desc}, vind ${r.wx.wind} m/s Bf${r.wx.bft} fra ${r.wx.windDir}, ${r.wx.temp}°C` : 'Vær: ikke tilgjengelig',
    `Dato: ${new Date(r.dateVal).toLocaleDateString('no', {weekday:'long',day:'2-digit',month:'long'})}`,
  ].join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 600,
        messages: [{ role:'user', content:`Du er båtekspert og rådgiver for Bavaria Sport 32 "Summer" (35 fot, 330hk, hjemmehavn Kristiansand).

${ctx}

Gi en konkret turanbefaling på norsk (maks 7 setninger):
1. Er ruten gjennomførbar?
2. Er diesel OK med ${FUEL_RESERVE_L}L reserve?
3. Er været akseptabelt for en 35-fots motorbåt med familie?
4. Praktiske råd / advarsler / alternative stopp.` }],
      }),
    });
    const d = await res.json();
    resp.textContent = d.content?.[0]?.text || 'Ingen svar';
  } catch (e) { resp.textContent = 'Feil: ' + e.message; }
  finally { btn.textContent = '🤖 Få AI-anbefaling for denne turen'; btn.disabled = false; }
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
