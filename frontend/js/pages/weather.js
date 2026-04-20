// pages/weather.js — full værsiden med MET Norway
import * as SK from '../signalk.js';

const DEFAULT_LAT = 58.15, DEFAULT_LON = 7.99;

function coords() {
  const s = SK.getState();
  const lat = SK.get.lat(s), lon = SK.get.lon(s);
  return {
    lat: (lat && Math.abs(lat) > 1) ? lat : parseFloat(localStorage.getItem('wx_lat') || DEFAULT_LAT),
    lon: (lon && Math.abs(lon) > 1) ? lon : parseFloat(localStorage.getItem('wx_lon') || DEFAULT_LON),
  };
}

// ── Reverse geocoding via Nominatim (OpenStreetMap) ───────────────────────────
// Cacher stedsnavn i localStorage i 6 timer for å unngå rate-limit
async function reverseGeocode(lat, lon) {
  const cacheKey = `place_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached   = localStorage.getItem(cacheKey);
  if (cached) {
    const { name, ts } = JSON.parse(cached);
    if (Date.now() - ts < 6 * 3600_000) return name;
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=no`,
      { headers: { 'User-Agent': 'Bavaria32App/1.0 tom.erik.thorsen@gmail.com' } }
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    const a    = data.address || {};
    // Prioriter stedsnavn: havbunn/farvann > by > kommune > fylke
    const name = a.body_of_water || a.sea || a.bay ||
                 a.city || a.town || a.village ||
                 a.municipality || a.county ||
                 data.display_name?.split(',')[0] ||
                 `${lat.toFixed(2)}°N ${lon.toFixed(2)}°Ø`;
    localStorage.setItem(cacheKey, JSON.stringify({ name, ts: Date.now() }));
    return name;
  } catch {
    return `${lat.toFixed(2)}°N ${lon.toFixed(2)}°Ø`;
  }
}

function metUrl(path) {
  const { hostname } = window.location;
  const isExternal = hostname !== 'localhost' && hostname !== '127.0.0.1';
  if (isExternal) return window.location.origin + '/met' + path;
  return 'https://api.met.no' + path;
}

async function fetchMET(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 9000);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: { 'User-Agent': 'Bavaria32App/1.0 tom.erik.thorsen@gmail.com' },
    });
    clearTimeout(t);
    if (r.ok) return r.json();
    throw new Error('HTTP ' + r.status);
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

// ── Mini-widget for dashboard ─────────────────────────────────────────────────
export async function fetchAndRenderMini(container) {
  const { lat, lon } = coords();
  try {
    const [fc, ocean, place] = await Promise.all([
      fetchMET(metUrl(`/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`)),
      fetchMET(metUrl(`/weatherapi/oceanforecast/2.0/complete?lat=${lat}&lon=${lon}`)).catch(() => null),
      reverseGeocode(lat, lon),
    ]);
    const cur   = fc.properties.timeseries[0]?.data?.instant?.details || {};
    const next  = fc.properties.timeseries[0]?.data?.next_1_hours || fc.properties.timeseries[0]?.data?.next_6_hours || {};
    const sym   = next?.summary?.symbol_code || '';
    const wind  = Number(cur.wind_speed || 0);
    const bft   = beaufort(wind);
    const waveH = safeNum(ocean?.properties?.timeseries?.[0]?.data?.instant?.details?.sea_surface_wave_height);

    container.innerHTML = `
      <div class="wx-hero">
        <div class="wx-eyebrow"><div class="wx-rdot"></div>${place} · MET Norway</div>
        <div class="wx-top">
          <div class="wx-temp">${Math.round(cur.air_temperature || 0)}<sub>°C</sub></div>
          <div class="wx-desc">
            <div class="wx-cond">${symIcon(sym)} ${symDesc(sym)}</div>
            <div class="wx-feels">Vind ${Math.round(wind)} m/s Bf${bft} · Bølger ${waveH != null ? waveH.toFixed(1)+' m' : '—'}</div>
          </div>
        </div>
      </div>`;
  } catch {
    container.innerHTML = `<div class="wx-load">⚠ Vær ikke tilgjengelig</div>`;
  }
}

// ── Full værsiden ─────────────────────────────────────────────────────────────
export async function render(container) {
  const { lat, lon } = coords();
  const place = await reverseGeocode(lat, lon);

  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Vær</div>
      <div class="ph-s">${place} · MET Norway</div>
    </div>
    <div id="wx-full"><div class="wx-load"><div class="spin"></div>Henter fra MET Norway…</div></div>`;

  try {
    const [fc, ocean, sun] = await Promise.all([
      fetchMET(metUrl(`/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`)),
      fetchMET(metUrl(`/weatherapi/oceanforecast/2.0/complete?lat=${lat}&lon=${lon}`)).catch(() => null),
      fetchMET(metUrl(`/weatherapi/sunrise/3.0/sun?lat=${lat}&lon=${lon}&date=${today()}&offset=+02:00`)).catch(() => null),
    ]);
    renderFull(container, fc, ocean, sun, lat, lon, place);
  } catch (e) {
    document.getElementById('wx-full').innerHTML =
      `<div class="wx-load">⚠ Kan ikke hente MET-data: ${e.message}</div>`;
  }
}

function renderFull(container, fc, ocean, sun, lat, lon, place) {
  const ts    = fc.properties.timeseries;
  if (!ts?.length) throw new Error('Ingen timeseries');

  const now   = ts[0];
  const cur   = now?.data?.instant?.details || {};
  const next1 = now?.data?.next_1_hours || now?.data?.next_6_hours || {};
  const sym   = next1?.summary?.symbol_code || '';

  const wind_ms   = Number(cur.wind_speed || 0);
  const wind_dir  = Number(cur.wind_from_direction || 0);
  const gust_ms   = Number(cur.wind_speed_of_gust || wind_ms);
  const temp      = Math.round(cur.air_temperature || 0);
  const humidity  = Math.round(cur.relative_humidity || 0);
  const pressure  = Math.round(cur.air_pressure_at_sea_level || 0);
  const cloud     = Math.round(cur.cloud_area_fraction || 0);
  const prec1h    = Number(next1?.details?.precipitation_amount || 0);
  const precProb  = Number(next1?.details?.probability_of_precipitation || 0);
  const bft       = beaufort(wind_ms);

  let feels = temp;
  if (wind_ms > 1.3 && temp < 10) {
    feels = Math.round(13.12 + 0.6215*temp - 11.37*Math.pow(wind_ms,0.16) + 0.3965*temp*Math.pow(wind_ms,0.16));
  }

  let waveH = null, waveDir = null, wavePer = null, seaTemp = null;
  if (ocean) {
    try {
      const od = ocean.properties.timeseries[0]?.data?.instant?.details || {};
      waveH   = safeNum(od.sea_surface_wave_height);
      waveDir = safeNum(od.sea_surface_wave_from_direction);
      wavePer = safeNum(od.sea_surface_wave_period_at_variance_spectral_density_maximum ?? od.sea_surface_wave_mean_period);
      seaTemp = safeNum(od.sea_water_temperature);
    } catch {}
  }

  let sunriseStr = '—', sunsetStr = '—';
  try {
    if (sun?.properties?.sunrise?.time) sunriseStr = fmtTime(sun.properties.sunrise.time);
    if (sun?.properties?.sunset?.time)  sunsetStr  = fmtTime(sun.properties.sunset.time);
  } catch {}

  const sailBad  = bft >= 7 || (waveH != null && waveH > 1.5);
  const sailWarn = !sailBad && ((bft >= 5) || (waveH != null && waveH > 1.0));
  const sailCls  = sailBad ? 'cr' : sailWarn ? 'wn' : 'ok';
  const sailTxt  = sailBad  ? 'Krevende — ikke anbefalt for Bavaria Sport 32'
                 : sailWarn ? 'Moderat — vær forsiktig'
                 : 'Gode forhold';

  // 24-timers timestrip
  const hourStrip = ts.slice(0, 24).map((t, i) => {
    const d  = t?.data?.instant?.details || {};
    const n  = t?.data?.next_1_hours || t?.data?.next_6_hours || {};
    const s  = n?.summary?.symbol_code || '';
    const tm = Math.round(d.air_temperature ?? 0);
    const pr = Number(n?.details?.precipitation_amount || 0);
    const pp = Number(n?.details?.probability_of_precipitation || 0);
    return `
      <div class="wx-hcell${i===0?' wx-hcell-now':''}">
        <div class="wx-ht">${i===0?'Nå':fmtTime(t.time)}</div>
        <div class="wx-hi">${symIcon(s)}</div>
        <div class="wx-hv">${tm}°</div>
        ${pr > 0.1 ? `<div class="wx-hp">${pr.toFixed(1)}mm</div>`
          : pp > 20 ? `<div class="wx-hp">${pp}%</div>` : ''}
      </div>`;
  }).join('');

  const dayMap = {};
  for (const t of ts) {
    const key = t.time.slice(0, 10);
    if (!dayMap[key]) dayMap[key] = { temps:[], syms:[], windMax:0, prec:0 };
    const d  = t?.data?.instant?.details || {};
    const tm = Number(d.air_temperature);
    if (!isNaN(tm)) dayMap[key].temps.push(tm);
    const s = t?.data?.next_6_hours?.summary?.symbol_code || t?.data?.next_1_hours?.summary?.symbol_code;
    if (s) dayMap[key].syms.push(s);
    const ws = Number(d.wind_speed || 0);
    if (ws > dayMap[key].windMax) dayMap[key].windMax = ws;
    dayMap[key].prec += Number(t?.data?.next_6_hours?.details?.precipitation_amount || 0);
  }
  const DAYS = ['Søn','Man','Tir','Ons','Tor','Fre','Lør'];
  const fcCells = Object.entries(dayMap).slice(0, 6).map(([k, dd], i) => {
    const dt    = new Date(k + 'T12:00:00');
    const label = i === 0 ? 'I dag' : DAYS[dt.getDay()];
    const tMax  = dd.temps.length ? Math.round(Math.max(...dd.temps)) : '—';
    const tMin  = dd.temps.length ? Math.round(Math.min(...dd.temps)) : '—';
    const sym2  = dd.syms[Math.floor(dd.syms.length/2)] || '';
    const bf    = beaufort(dd.windMax);
    const prec  = dd.prec.toFixed(1);
    return `
      <div class="wx-dc${i===0?' wx-dc-today':''}">
        <div class="wx-dd">${label}</div>
        <div class="wx-di">${symIcon(sym2)}</div>
        <div class="wx-dt">${tMax}° / ${tMin}°</div>
        <div class="wx-dw">${Math.round(dd.windMax)} m/s Bf${bf}</div>
        ${parseFloat(prec)>0 ? `<div class="wx-dp">${prec}mm</div>` : ''}
      </div>`;
  }).join('');

  document.getElementById('wx-full').innerHTML = `

    <div class="wx-hero">
      <div class="wx-eyebrow">
        <div class="wx-rdot"></div>
        ${place} · ${new Date().toLocaleString('no',{weekday:'long',hour:'2-digit',minute:'2-digit'})}
      </div>
      <div class="wx-top">
        <div class="wx-temp">${temp}<sub>°C</sub></div>
        <div class="wx-desc">
          <div class="wx-cond">${symIcon(sym)} ${symDesc(sym)}</div>
          <div class="wx-feels">Føles som ${feels}°C · Fukt ${humidity}%</div>
        </div>
      </div>
      <div class="wx-sun-row">
        <span>☀ Opp ${sunriseStr}</span>
        <span>☽ Ned ${sunsetStr}</span>
        <span>☁ Skydekke ${cloud}%</span>
        <span>↓ Trykk ${pressure} hPa</span>
      </div>
    </div>

    <div class="sl">Vind og nedbør</div>
    <div class="sgrid">
      ${sc('Vind nå',   Math.round(wind_ms) + ' m/s', windDir(wind_dir) + ' · Bf ' + bft, bft>=7?'cr':bft>=5?'wn':'ok')}
      ${sc('Vindkast',  Math.round(gust_ms) + ' m/s', 'maks kast', gust_ms>15?'wn':'')}
      ${sc('Nedbør 1t', prec1h.toFixed(1) + ' mm', precProb > 0 ? precProb + '% sannsynlig' : 'liten sannsynlighet', '')}
      ${sc('Luftfukt.', humidity + '%', 'relativ fuktighet', '')}
    </div>

    <div class="sl">Neste 24 timer</div>
    <div class="wx-hstrip">${hourStrip}</div>

    <div class="sl">Marine forhold · Oceanforecast</div>
    <div class="sgrid">
      ${sc('Bølgehøyde', waveH!=null ? waveH.toFixed(1)+' m' : '—',
            waveH!=null ? (waveH>1.5?'Krevende':waveH>0.8?'Moderat':'Rolig') : 'ingen data',
            waveH!=null ? (waveH>1.5?'cr':waveH>0.8?'wn':'ok') : '')}
      ${sc('Bølgeperiode', wavePer!=null ? Math.round(wavePer)+' s' : '—', 'sekunder', '')}
      ${sc('Bølgeretning', waveDir!=null ? windDir(waveDir) : '—', waveDir!=null ? Math.round(waveDir)+'°' : '', '')}
      ${sc('Sjøtemp.', seaTemp!=null ? Math.round(seaTemp)+'°C' : '—', 'overflate', '')}
    </div>

    <div class="sl">Seilanbefalning</div>
    <div class="al ${sailCls}" style="margin-bottom:20px">
      <span style="font-size:1.1rem">${sailBad?'⚠':sailWarn?'◉':'✓'}</span>
      <div class="al-t">
        <strong>${sailTxt}</strong><br>
        Bølger ${waveH!=null?waveH.toFixed(1)+' m':'—'} · Vind Bf ${bft} (${Math.round(wind_ms)} m/s) · ${symDesc(sym)}
      </div>
    </div>

    <div class="sl">5-dagers varsel</div>
    <div class="wx-dstrip">${fcCells}</div>

    <div class="wx-source">
      Kilde: MET Norway (api.met.no) · Locationforecast 2.0 · Oceanforecast 2.0 · Sunrise 3.0
      · Oppdatert ${new Date().toLocaleTimeString('no',{hour:'2-digit',minute:'2-digit'})}
    </div>

  <style>
    .wx-sun-row { display:flex; gap:16px; flex-wrap:wrap; font-size:11px; color:rgba(255,255,255,.5); padding-bottom:16px; }
    .wx-sun-row span { white-space:nowrap; }
    .wx-hstrip { display:flex; overflow-x:auto; gap:0; scrollbar-width:none; margin-bottom:4px; border:1px solid var(--line); }
    .wx-hstrip::-webkit-scrollbar { display:none; }
    .wx-hcell { flex:0 0 64px; padding:10px 8px; text-align:center; border-right:1px solid var(--line); background:var(--white); }
    .wx-hcell:last-child { border-right:none; }
    .wx-hcell-now { background:var(--blue-tint); }
    .wx-ht { font-family:'Barlow Condensed',sans-serif; font-size:10px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-light); margin-bottom:5px; }
    .wx-hi { font-size:1.3rem; line-height:1; margin-bottom:4px; }
    .wx-hv { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:1rem; color:var(--ink); }
    .wx-hp { font-size:10px; color:var(--blue); margin-top:2px; font-weight:600; }
    .wx-hcell-now .wx-ht { color:var(--blue); }
    .wx-dstrip { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:var(--line); border:1px solid var(--line); margin-bottom:16px; }
    @media (min-width:500px) { .wx-dstrip { grid-template-columns:repeat(6,1fr); } }
    .wx-dc { background:var(--white); padding:12px 8px; text-align:center; }
    .wx-dc-today { background:var(--blue-tint); }
    .wx-dd { font-family:'Barlow Condensed',sans-serif; font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light); margin-bottom:6px; }
    .wx-dc-today .wx-dd { color:var(--blue); }
    .wx-di { font-size:1.5rem; line-height:1; margin-bottom:6px; }
    .wx-dt { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:.85rem; color:var(--ink); margin-bottom:3px; }
    .wx-dw { font-size:10px; color:var(--ink-light); }
    .wx-dp { font-size:10px; color:var(--blue); margin-top:2px; font-weight:600; }
  </style>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sc(label, val, sub, cls) {
  return `<div class="sc">
    <div class="sc-line ${cls}"></div>
    <div class="sc-lbl">${label}</div>
    <div class="sc-v ${cls}">${val}</div>
    <div class="sc-u">${sub}</div>
  </div>`;
}

function safeNum(v) {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function beaufort(ms) {
  const limits = [0.3,1.6,3.4,5.5,8,10.8,13.9,17.2,20.8,24.5,28.5,32.7];
  for (let i = 0; i < limits.length; i++) if (ms < limits[i]) return i;
  return 12;
}

function windDir(deg) {
  const dirs = ['N','NNØ','NØ','ØNØ','Ø','ØSØ','SØ','SSØ','S','SSV','SV','VSV','V','VNV','NV','NNV'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function fmtTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleTimeString('no', { hour:'2-digit', minute:'2-digit' });
}

function today() { return new Date().toISOString().slice(0, 10); }

const ICONS = {
  clearsky:'☀️', fair:'🌤️', partlycloudy:'⛅', cloudy:'☁️', fog:'🌫️',
  lightrainshowers:'🌦️', rainshowers:'🌧️', lightrain:'🌧️', rain:'🌧️',
  heavyrain:'🌧️', lightsnow:'🌨️', snow:'❄️', heavysnow:'❄️',
  sleet:'🌧️', thunder:'⛈️', thunderstorm:'⛈️',
};
const DESCS = {
  clearsky:'Klarvær', fair:'Lettskyet', partlycloudy:'Delvis skyet',
  cloudy:'Skyet', fog:'Tåke', lightrainshowers:'Lette regnbyger',
  rainshowers:'Regnbyger', lightrain:'Lett regn', rain:'Regn',
  heavyrain:'Kraftig regn', lightsnow:'Lett snø', snow:'Snø',
  heavysnow:'Kraftig snø', sleet:'Sludd', thunder:'Torden', thunderstorm:'Tordenværr',
};
function symBase(code) { return (code||'').replace(/_day|_night|_polartwilight/,''); }
function symIcon(code) { const b=symBase(code); for(const k of Object.keys(ICONS)) if(b.startsWith(k)) return ICONS[k]; return '🌡️'; }
function symDesc(code) { const b=symBase(code); for(const k of Object.keys(DESCS)) if(b.startsWith(k)) return DESCS[k]; return b||'Ukjent'; }
