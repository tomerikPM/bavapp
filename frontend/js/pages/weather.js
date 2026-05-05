// pages/weather.js — full værsiden med MET Norway
import * as SK from '../signalk.js';
import { fetchTides } from '../fun.js';

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
    <div class="wx-tabs" role="tablist">
      <button class="wx-tab wx-tab-active" data-tab="wx"  role="tab">Vær</button>
      <button class="wx-tab"                data-tab="fog" role="tab">Sikt &amp; tåke</button>
    </div>
    <div id="wx-full" class="wx-panel wx-panel-active">
      <div class="wx-load"><div class="spin"></div>Henter fra MET Norway…</div>
    </div>
    <div id="wx-fog" class="wx-panel" hidden></div>`;

  // Tab-bytting — lazy-load av tåke-panelet første gang
  let fogLoaded = false;
  container.querySelectorAll('.wx-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      container.querySelectorAll('.wx-tab').forEach(b => b.classList.toggle('wx-tab-active', b === btn));
      document.getElementById('wx-full').hidden = tab !== 'wx';
      document.getElementById('wx-full').classList.toggle('wx-panel-active', tab === 'wx');
      document.getElementById('wx-fog').hidden  = tab !== 'fog';
      document.getElementById('wx-fog').classList.toggle('wx-panel-active', tab === 'fog');
      if (tab === 'fog' && !fogLoaded) {
        fogLoaded = true;
        renderFogTab(document.getElementById('wx-fog'), lat, lon);
      }
    });
  });

  try {
    const [fc, ocean, sun] = await Promise.all([
      fetchMET(metUrl(`/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`)),
      fetchMET(metUrl(`/weatherapi/oceanforecast/2.0/complete?lat=${lat}&lon=${lon}`)).catch(() => null),
      fetchMET(metUrl(`/weatherapi/sunrise/3.0/sun?lat=${lat}&lon=${lon}&date=${today()}&offset=+02:00`)).catch(() => null),
    ]);
    renderFull(container, fc, ocean, sun, lat, lon, place);
    loadTextForecast(lat, lon);
    loadTide(lat, lon);
    loadKystvaer(lat, lon, fc);
  } catch (e) {
    document.getElementById('wx-full').innerHTML =
      `<div class="wx-load">⚠ Kan ikke hente MET-data: ${e.message}</div>`;
  }
}

// Tekstvarsel (kystvarsel) — hentes asynkront etter at hovedsiden er tegnet
async function loadTextForecast(lat, lon) {
  const el = document.getElementById('wx-text-forecast');
  if (!el) return;
  try {
    const BASE = localStorage.getItem('backend_url') || 'http://localhost:3001';
    const r = await fetch(`${BASE}/api/textforecast?lat=${lat}&lon=${lon}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    el.innerHTML = renderTextForecast(data);
  } catch (e) {
    el.innerHTML = `<div class="wx-textfc-err">⚠ Kystvarsel ikke tilgjengelig: ${e.message}</div>`;
  }
}

function renderTextForecast(data) {
  if (!data?.match && !data?.areas?.length) {
    return '<div class="wx-textfc-err">Ingen varsler tilgjengelig.</div>';
  }

  const match = data.match;
  const matchHtml = match ? `
    <div class="wx-textfc-match">
      <div class="wx-textfc-area">📍 ${match.area}</div>
      <div class="wx-textfc-title">${fmtInterval(match.interval)}</div>
      <div class="wx-textfc-text">${match.text}</div>
    </div>` : `<div class="wx-textfc-err">Båten er utenfor kystvarsel-områdene — se nabo-områder under.</div>`;

  // Øvrige områder, skjulbare
  const others = (data.areas || [])
    .filter(a => !match || a.area !== match.area)
    .slice(0, 12);
  const othersHtml = others.length ? `
    <details class="wx-textfc-more">
      <summary>Øvrige områder (${others.length})</summary>
      <div class="wx-textfc-others">
        ${others.map(a => `
          <div class="wx-textfc-other">
            <div class="wx-textfc-other-area">${a.area}</div>
            <div class="wx-textfc-other-text">${a.text}</div>
          </div>`).join('')}
      </div>
    </details>` : '';

  return matchHtml + othersHtml;
}

function fmtInterval(interval) {
  if (!Array.isArray(interval) || interval.length < 2) return '';
  const a = new Date(interval[0]), b = new Date(interval[1]);
  const opts = { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
  return `${a.toLocaleString('no', opts)} – ${b.toLocaleString('no', opts)}`;
}

// Tidevann (Kartverket) — nærmeste høy-/lavvann + stasjonsnavn
async function loadTide(lat, lon) {
  const el = document.getElementById('wx-tide');
  if (!el) return;
  try {
    const { nextHigh, nextLow, stationName } = await fetchTides(lat, lon);
    el.innerHTML = renderTide(nextHigh, nextLow, stationName);
  } catch (e) {
    el.innerHTML = `<div class="wx-tide-err">⚠ Tidevann ikke tilgjengelig: ${e.message}</div>`;
  }
}

function renderTide(high, low, station) {
  const fmtTide = (p, label, icon, cls) => {
    if (!p) return `
      <div class="wx-tide-cell">
        <div class="wx-tide-lbl">${icon} ${label}</div>
        <div class="wx-tide-val">—</div>
      </div>`;
    const d   = new Date(p.t);
    const h   = Math.round((d.getTime() - Date.now()) / 3600_000);
    const rel = h <= 0 ? 'nå' : h < 24 ? `om ${h} t` : `om ${Math.round(h/24)} d`;
    const tid = d.toLocaleString('no', { weekday:'short', hour:'2-digit', minute:'2-digit' });
    return `
      <div class="wx-tide-cell ${cls}">
        <div class="wx-tide-lbl">${icon} ${label}</div>
        <div class="wx-tide-val">${tid}</div>
        <div class="wx-tide-sub">${p.v != null ? Math.round(p.v) + ' cm · ' + rel : rel}</div>
      </div>`;
  };

  return `
    <div class="wx-tide-grid">
      ${fmtTide(high, 'Høyvann', '▲', 'hi')}
      ${fmtTide(low,  'Lavvann', '▼', 'lo')}
    </div>
    <div class="wx-tide-src">Stasjon: ${station || 'ukjent'}</div>
  `;
}

// Live målt vind fra Kystverkets stasjoner. fc = MET-prognose; brukes til
// å sammenligne målt vs. prognosert vind for nærmeste stasjon, og flagge
// hvis avvik er stort (prognose usikker).
function renderTrend(trend) {
  if (!trend) return '';
  const { delta, ago_min, dir } = trend;
  const sym = dir === 'up' ? '↗' : dir === 'down' ? '↘' : '→';
  const cls = dir === 'flat' ? 'flat' : dir === 'up' ? 'up' : 'down';
  const text = dir === 'flat'
    ? `Stabil siste ${ago_min} min`
    : `${delta > 0 ? '+' : ''}${delta} m/s siste ${ago_min} min`;
  return `<div class="wx-kv-trend wx-kv-trend-${cls}"><span class="wx-kv-trend-sym">${sym}</span> ${text}</div>`;
}

async function loadKystvaer(lat, lon, fc) {
  const el = document.getElementById('wx-kystvaer');
  if (!el) return;
  try {
    const BASE = localStorage.getItem('backend_url') || 'http://localhost:3001';
    const r = await fetch(`${BASE}/api/kystvaer?lat=${lat}&lon=${lon}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();

    // Prognosert vind nå (m/s) for sammenligning
    const fcWind = Number(fc?.properties?.timeseries?.[0]?.data?.instant?.details?.wind_speed || 0);

    el.innerHTML = renderKystvaer(data, fcWind);
  } catch (e) {
    el.innerHTML = `<div class="wx-kv-err">⚠ Kystvær ikke tilgjengelig: ${e.message}</div>`;
  }
}

function renderKystvaer(data, fcWind) {
  const stations = data?.stations || [];
  if (!stations.length) {
    return `<div class="wx-kv-err">Ingen stasjoner svarer akkurat nå.</div>`;
  }

  const fmtAge = s => {
    if (s == null) return '';
    if (s < 90)        return 'nå';
    if (s < 3600)      return `${Math.round(s/60)} min siden`;
    return `${Math.round(s/3600)} t siden`;
  };

  // Avvik vs. MET-prognose for nærmeste stasjon
  const main = stations[0];
  let diffBadge = '';
  if (main.wind != null && fcWind > 0) {
    const diff = main.wind - fcWind;
    const pct  = Math.abs(diff) / Math.max(fcWind, 1);
    if (pct > 0.3 && Math.abs(diff) >= 2) {
      const sign = diff > 0 ? 'sterkere' : 'svakere';
      const cls  = Math.abs(diff) >= 5 ? 'cr' : 'wn';
      diffBadge = `<div class="wx-kv-diff ${cls}">⚠ ${Math.abs(diff).toFixed(1)} m/s ${sign} enn prognose (${fcWind.toFixed(1)} m/s)</div>`;
    } else {
      diffBadge = `<div class="wx-kv-diff ok">✓ Treffer prognose (${fcWind.toFixed(1)} m/s)</div>`;
    }
  }

  const mainBft = main.wind != null ? beaufort(main.wind) : null;
  const gustFactor = (main.wind > 0 && main.gust > 0) ? main.gust / main.wind : null;
  // Bare flagg ved sustained ≥ 5 m/s — under det er kastfaktor matematisk støy
  // (særlig fra mekanisk turbulens i havner). Ekte bygevær krever konvektiv
  // himmel, og det vet vi ikke fra målestasjonen alene.
  const gusty = main.wind >= 5 && gustFactor != null && gustFactor >= 1.5;

  const mainCard = `
    <div class="wx-kv-main${main.stale ? ' wx-kv-stale' : ''}">
      <div class="wx-kv-head">
        <div class="wx-kv-name">${main.name}</div>
        <div class="wx-kv-meta">${main.dist_km} km · ${main.source} · ${fmtAge(main.age_s)}</div>
      </div>
      <div class="wx-kv-body">
        <div class="wx-kv-big">
          <div class="wx-kv-wind">${main.wind ?? '—'}<sub>m/s</sub></div>
          <div class="wx-kv-bft">${mainBft != null ? 'Bf ' + mainBft : ''}</div>
        </div>
        <div class="wx-kv-arrow" style="transform:rotate(${(main.dir ?? 0) + 180}deg)">↓</div>
        <div class="wx-kv-dir">
          <div class="wx-kv-cardinal">${main.dir != null ? windDir(main.dir) : '—'}</div>
          <div class="wx-kv-deg">${main.dir != null ? main.dir + '°' : ''}</div>
        </div>
      </div>
      <div class="wx-kv-gust ${gusty ? 'wx-kv-gust-warn' : ''}">
        💨 Kast ${main.gust ?? '—'} m/s${gustFactor ? ` · faktor ${gustFactor.toFixed(1)}` : ''}${gusty ? ' — kraftige kast' : ''}
      </div>
      ${renderTrend(main.trend)}
      ${diffBadge}
    </div>`;

  const others = stations.slice(1).map(s => {
    const arrow = s.dir != null
      ? `<span class="wx-kv-row-arrow" style="transform:rotate(${s.dir + 180}deg)">↓</span>`
      : '';
    return `
      <div class="wx-kv-row${s.stale ? ' wx-kv-stale' : ''}">
        <div class="wx-kv-row-name">${s.name}</div>
        <div class="wx-kv-row-dist">${s.dist_km} km</div>
        <div class="wx-kv-row-wind">${s.wind ?? '—'}<small>m/s</small></div>
        <div class="wx-kv-row-gust">${s.gust != null ? '↗ ' + s.gust : '—'}</div>
        <div class="wx-kv-row-dir">${arrow} ${s.dir != null ? windDir(s.dir) : '—'}</div>
        <div class="wx-kv-row-age">${fmtAge(s.age_s)}</div>
      </div>`;
  }).join('');

  return `
    ${mainCard}
    ${others ? `<div class="wx-kv-others">${others}</div>` : ''}
    <div class="wx-kv-src">Kilde: Kystverket / MET / Statens vegvesen · oppdatert hvert 5. min</div>

    <style>
      .wx-kv { margin-bottom:20px; border:1px solid var(--line); background:var(--white); }
      .wx-kv-loading, .wx-kv-err { padding:14px; font-size:12px; color:var(--ink-light); }
      .wx-kv-main { padding:14px; border-bottom:1px solid var(--line); }
      .wx-kv-stale { opacity:.55; }
      .wx-kv-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px; gap:8px; }
      .wx-kv-name {
        font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:15px;
        letter-spacing:.04em; color:var(--blue);
      }
      .wx-kv-meta { font-size:10px; color:var(--ink-light); text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; }
      .wx-kv-body { display:flex; align-items:center; gap:18px; }
      .wx-kv-big { flex:1; }
      .wx-kv-wind { font-family:'DM Mono',monospace; font-weight:700; font-size:2.2rem; line-height:1; color:var(--ink); }
      .wx-kv-wind sub { font-size:.45em; font-weight:500; margin-left:3px; color:var(--ink-light); vertical-align:baseline; }
      .wx-kv-bft { font-size:11px; color:var(--ink-light); margin-top:4px; letter-spacing:.05em; text-transform:uppercase; }
      .wx-kv-arrow {
        font-size:2.4rem; color:var(--blue); line-height:1; width:42px; text-align:center;
        transform-origin:center; transition:transform .3s;
      }
      .wx-kv-dir { text-align:right; min-width:50px; }
      .wx-kv-cardinal { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:1.2rem; color:var(--ink); }
      .wx-kv-deg { font-family:'DM Mono',monospace; font-size:11px; color:var(--ink-light); margin-top:2px; }
      .wx-kv-gust {
        margin-top:10px; padding:6px 0 0; font-family:'DM Mono',monospace;
        font-size:11px; color:var(--ink-light); border-top:1px dashed var(--line);
      }
      .wx-kv-gust-warn { color:var(--warn); font-weight:600; }
      .wx-kv-trend {
        margin-top:6px; font-family:'DM Mono',monospace; font-size:11px;
        color:var(--ink-light); display:flex; align-items:center; gap:6px;
      }
      .wx-kv-trend-sym { font-size:14px; line-height:1; font-weight:700; }
      .wx-kv-trend-up   { color:var(--warn); }
      .wx-kv-trend-up   .wx-kv-trend-sym { color:var(--warn); }
      .wx-kv-trend-down { color:var(--ok); }
      .wx-kv-trend-down .wx-kv-trend-sym { color:var(--ok); }
      .wx-kv-trend-flat { color:var(--ink-light); }
      .wx-kv-diff {
        margin-top:8px; padding:6px 8px; font-size:11.5px; font-weight:600;
        border-left:3px solid var(--ink-light);
      }
      .wx-kv-diff.ok { background:#eaf6ee; border-color:var(--ok); color:var(--ok); }
      .wx-kv-diff.wn { background:#fff5e6; border-color:var(--warn); color:var(--warn); }
      .wx-kv-diff.cr { background:#fbe9eb; border-color:var(--danger); color:var(--danger); }

      .wx-kv-others { display:flex; flex-direction:column; }
      .wx-kv-row {
        display:grid; grid-template-columns: 1fr 50px 60px 50px 60px 70px;
        gap:8px; padding:8px 14px; align-items:center; font-size:12px;
        border-bottom:1px solid var(--line);
      }
      .wx-kv-row:last-child { border-bottom:none; }
      .wx-kv-row-name { color:var(--ink); font-weight:600; }
      .wx-kv-row-dist, .wx-kv-row-age { font-size:10px; color:var(--ink-light); }
      .wx-kv-row-wind { font-family:'DM Mono',monospace; font-weight:700; color:var(--ink); text-align:right; }
      .wx-kv-row-wind small { font-weight:500; color:var(--ink-light); margin-left:2px; font-size:.85em; }
      .wx-kv-row-gust { font-family:'DM Mono',monospace; font-size:11px; color:var(--ink-light); text-align:right; }
      .wx-kv-row-dir  { font-size:11px; color:var(--ink); text-align:right; }
      .wx-kv-row-arrow { display:inline-block; color:var(--blue); transform-origin:center; }

      .wx-kv-src { padding:8px 14px; font-size:10px; color:var(--ink-light); border-top:1px solid var(--line); text-align:right; }

      @media (max-width:480px) {
        .wx-kv-row { grid-template-columns: 1.4fr 50px 50px 60px; gap:6px; }
        .wx-kv-row-gust, .wx-kv-row-age { display:none; }
      }
    </style>`;
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

  // 12-timers timestrip
  const hourStrip = ts.slice(0, 12).map((t, i) => {
    const d  = t?.data?.instant?.details || {};
    const n  = t?.data?.next_1_hours || t?.data?.next_6_hours || {};
    const s  = n?.summary?.symbol_code || '';
    const tm = Math.round(d.air_temperature ?? 0);
    const ws = Number(d.wind_speed || 0);
    const wd = d.wind_from_direction != null ? Number(d.wind_from_direction) : null;
    const wg = d.wind_speed_of_gust != null ? Number(d.wind_speed_of_gust) : null;
    const pr = Number(n?.details?.precipitation_amount || 0);
    const pp = Number(n?.details?.probability_of_precipitation || 0);
    // Pil peker dit vinden KOMMER FRA — samme konvensjon som hovedkortet (rotér ↓ med dir+180)
    const arrow = wd != null
      ? `<span class="wx-h-arrow" style="transform:rotate(${wd + 180}deg)">↓</span>`
      : '';
    // Vis kast bare hvis det skiller seg merkbart fra snittvinden (≥ 1 m/s ekstra)
    const gustHtml = (wg != null && wg > ws + 1)
      ? `<div class="wx-hg">kast ${Math.round(wg)}</div>`
      : `<div class="wx-hg wx-hg-empty">—</div>`;
    const precHtml = pr > 0.1
      ? `<div class="wx-hp">💧 ${pr.toFixed(1)}mm</div>`
      : pp > 20
        ? `<div class="wx-hp wx-hp-prob">💧 ${pp}%</div>`
        : `<div class="wx-hp wx-hp-empty">—</div>`;
    return `
      <div class="wx-hcell${i===0?' wx-hcell-now':''}">
        <div class="wx-ht">${i===0?'Nå':fmtTime(t.time)}</div>
        <div class="wx-hi">${symIcon(s)}</div>
        <div class="wx-hv">${tm}°</div>
        <div class="wx-hw">${arrow}${Math.round(ws)} m/s</div>
        ${gustHtml}
        ${precHtml}
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

    <div class="sl">Målt vind nå · Kystverket</div>
    <div id="wx-kystvaer" class="wx-kv">
      <div class="wx-kv-loading">Henter live målinger…</div>
    </div>

    <div class="sl">Neste 12 timer</div>
    <div class="wx-hstrip">${hourStrip}</div>

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

    <div class="sl">Kystvarsel · MET Norway</div>
    <div id="wx-text-forecast" class="wx-textfc">
      <div class="wx-textfc-loading">Henter kystvarsel…</div>
    </div>

    <div class="sl">Tidevann · Kartverket</div>
    <div id="wx-tide" class="wx-tide">
      <div class="wx-tide-loading">Henter tidevann…</div>
    </div>

    <div class="sl">Vind og nedbør</div>
    <div class="sgrid">
      ${sc('Vind nå',   Math.round(wind_ms) + ' m/s', windDir(wind_dir) + ' · Bf ' + bft, bft>=7?'cr':bft>=5?'wn':'ok')}
      ${sc('Vindkast',  Math.round(gust_ms) + ' m/s', 'maks kast', gust_ms>15?'wn':'')}
      ${sc('Nedbør 1t', prec1h.toFixed(1) + ' mm', precProb > 0 ? precProb + '% sannsynlig' : 'liten sannsynlighet', '')}
      ${sc('Luftfukt.', humidity + '%', 'relativ fuktighet', '')}
    </div>

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
    .wx-tabs { display:flex; gap:0; margin-bottom:16px; border-bottom:1px solid var(--line); }
    .wx-tab {
      flex:1; padding:10px 12px; background:transparent; border:none; cursor:pointer;
      font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:12px;
      letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light);
      border-bottom:2px solid transparent; transition: color .15s, border-color .15s;
    }
    .wx-tab:hover { color:var(--ink); }
    .wx-tab-active { color:var(--blue); border-bottom-color:var(--blue); }
    .wx-panel[hidden] { display:none; }

    /* Tekstvarsel (kystvarsel) */
    .wx-textfc { margin-bottom: 20px; border:1px solid var(--line); background: var(--white); }
    .wx-textfc-loading, .wx-textfc-err { padding: 14px; font-size: 12px; color: var(--ink-light); }
    .wx-textfc-match { padding: 12px 14px; }
    .wx-textfc-area  { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:14px; letter-spacing:.05em; color:var(--blue); margin-bottom:2px; }
    .wx-textfc-title { font-size:10px; color:var(--ink-light); text-transform:uppercase; letter-spacing:.08em; margin-bottom:8px; }
    .wx-textfc-text  { font-size:13px; line-height:1.5; color:var(--ink); }
    .wx-textfc-more  { border-top:1px solid var(--line); }
    .wx-textfc-more summary {
      cursor:pointer; padding:10px 14px; font-family:'Barlow Condensed',sans-serif;
      font-weight:700; font-size:11px; letter-spacing:.1em; text-transform:uppercase;
      color:var(--ink-light); user-select:none;
    }
    .wx-textfc-more summary:hover { color:var(--ink); }
    .wx-textfc-others { padding: 0 14px 12px; display:flex; flex-direction:column; gap:10px; }
    .wx-textfc-other { border-top:1px dashed var(--line); padding-top:10px; }
    .wx-textfc-other-area { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:12px; color:var(--ink); margin-bottom:2px; }
    .wx-textfc-other-text { font-size:12px; line-height:1.45; color:var(--ink-light); }

    /* Tidevann */
    .wx-tide { margin-bottom: 20px; border:1px solid var(--line); background: var(--white); }
    .wx-tide-loading, .wx-tide-err { padding: 14px; font-size: 12px; color: var(--ink-light); }
    .wx-tide-grid { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--line); }
    .wx-tide-cell { background:var(--white); padding: 12px 14px; }
    .wx-tide-lbl { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-light); margin-bottom:4px; }
    .wx-tide-val { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:1.05rem; color:var(--ink); }
    .wx-tide-sub { font-size:11px; color:var(--ink-light); margin-top:2px; }
    .wx-tide-cell.hi .wx-tide-lbl { color:#1976d2; }
    .wx-tide-cell.lo .wx-tide-lbl { color:#ef6c00; }
    .wx-tide-src { padding:8px 14px; font-size:10px; color:var(--ink-light); border-top:1px solid var(--line); text-align:right; }
    .wx-sun-row { display:flex; gap:16px; flex-wrap:wrap; font-size:11px; color:rgba(255,255,255,.5); padding-bottom:16px; }
    .wx-sun-row span { white-space:nowrap; }
    .wx-hstrip { display:flex; overflow-x:auto; gap:0; scrollbar-width:none; margin-bottom:16px; border:1px solid var(--line); }
    .wx-hstrip::-webkit-scrollbar { display:none; }
    .wx-hcell { flex:1 0 88px; padding:12px 6px; text-align:center; border-right:1px solid var(--line); background:var(--white); }
    .wx-hcell:last-child { border-right:none; }
    .wx-hcell-now { background:var(--blue-tint); }
    .wx-ht { font-family:'Barlow Condensed',sans-serif; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-light); margin-bottom:6px; }
    .wx-hi { font-size:1.6rem; line-height:1; margin-bottom:6px; }
    .wx-hv { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:1.15rem; color:var(--ink); margin-bottom:6px; }
    .wx-hw { font-family:'DM Mono',monospace; font-size:10px; color:var(--ink-light); margin-bottom:2px; white-space:nowrap; display:flex; align-items:center; justify-content:center; gap:3px; }
    .wx-h-arrow { display:inline-block; color:var(--blue); font-size:12px; line-height:1; transform-origin:center; }
    .wx-hg { font-family:'DM Mono',monospace; font-size:9.5px; color:var(--warn); margin-bottom:2px; white-space:nowrap; font-weight:600; }
    .wx-hg-empty { color:transparent; }
    .wx-hp { font-family:'DM Mono',monospace; font-size:10px; color:var(--blue); font-weight:600; white-space:nowrap; }
    .wx-hp-prob { color:var(--ink-light); font-weight:500; }
    .wx-hp-empty { color:transparent; }
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

// ── Tåke-tab: henter /api/fog/forecast og rendrer nå-kort + 48h-bar + Windy-kart
const FOG_LABELS = ['Lav/ingen', 'Moderat', 'Høy', 'Svært høy'];
const FOG_COLORS = ['#4caf50', '#ffc107', '#ff9800', '#f44336'];
const FOG_ALCLS  = ['ok', 'wn', 'cr', 'cr'];

async function renderFogTab(container, lat, lon) {
  container.innerHTML = `<div class="wx-load"><div class="spin"></div>Henter tåke-prognose…</div>`;
  try {
    const BASE = localStorage.getItem('backend_url') || 'http://localhost:3001';
    const r = await fetch(`${BASE}/api/fog/forecast?lat=${lat}&lon=${lon}&hours=48`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    container.innerHTML = buildFogHtml(data, lat, lon);

    // Toggle overordnet forklaring
    const info = container.querySelector('.fog-now-info');
    const exp  = container.querySelector('#fog-explainer');
    if (info && exp) {
      info.addEventListener('click', () => {
        exp.hidden = !exp.hidden;
        info.classList.toggle('fog-now-info-open', !exp.hidden);
      });
    }

    // Klikk på en metrikk-boks → vis forklaring i delt hjelpeboks
    const grid    = container.querySelector('#fog-now-grid');
    const helpBox = container.querySelector('#fog-kv-help-box');
    if (grid && helpBox) {
      const titleEl = helpBox.querySelector('.fog-kv-help-title');
      const textEl  = helpBox.querySelector('.fog-kv-help-text');
      let selected  = null;

      grid.addEventListener('click', (e) => {
        const cell = e.target.closest('.fog-kv-clickable');
        if (!cell) return;
        if (cell === selected) {
          helpBox.hidden = true;
          cell.classList.remove('fog-kv-selected');
          selected = null;
          return;
        }
        if (selected) selected.classList.remove('fog-kv-selected');
        selected = cell;
        cell.classList.add('fog-kv-selected');
        titleEl.textContent = cell.dataset.label || '';
        textEl.textContent  = cell.dataset.help  || '';
        helpBox.hidden = false;
      });

      // Tastatur-støtte for fokus + Enter/Space
      grid.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const cell = e.target.closest('.fog-kv-clickable');
        if (!cell) return;
        e.preventDefault();
        cell.click();
      });
    }
  } catch (e) {
    container.innerHTML = `<div class="wx-load">⚠ Kan ikke hente tåke-data: ${e.message}</div>`;
  }
}

function buildFogHtml(data, lat, lon) {
  const now  = data.now;
  const peak = data.peak;
  const timeline = data.timeline || [];

  const nowCard = now ? `
    <div class="fog-now">
      <div class="fog-now-banner" style="background:${FOG_COLORS[now.level]}">
        <span class="fog-now-title">Tåke-risiko nå</span>
        <span class="fog-now-level">${FOG_LABELS[now.level]}</span>
        <button class="fog-now-info" type="button" aria-label="Forklaring" title="Vis forklaring">ⓘ</button>
      </div>
      <div class="fog-now-body">
        <div class="fog-now-reasons">${now.reasons?.length ? now.reasons.map(r => '• ' + r).join('<br>') : 'Ingen tåke-indikasjoner akkurat nå.'}</div>
        <div class="fog-now-grid" id="fog-now-grid">
          ${kv('Luft',      fmtNum(now.airTemp,  1, '°C'), '',                                       'Lufttemperatur — bestemmer hvor mye fukt luften kan holde. Kald luft mettes raskere.')}
          ${kv('Duggpunkt', fmtNum(now.dewPoint, 1, '°C'), '',                                       'Temperaturen der luften er mettet og vann kondenserer. Jo nærmere lufttemperaturen, jo større tåkefare.')}
          ${kv('Sjø',       fmtNum(now.sst,      1, '°C'), '',                                       'Sjøtemperatur. Hvis duggpunktet er HØYERE enn sjøen kan havtåke dannes når varm fuktig luft kjøles av havet.')}
          ${kv('Vind',      now.wind != null ? Math.round(now.wind) + ' m/s' : '—', now.bft != null ? 'Bf ' + now.bft : '', 'Lav vind (< 5 m/s) favoriserer tåkedannelse. Kraftig vind blåser tåka bort eller hindrer at den setter seg.')}
          ${kv('Fukt',      fmtNum(now.humidity, 0, '%'),  '',                                       'Relativ luftfuktighet. Over 95 % er tåke sannsynlig, over 97 % nesten garantert ved vindstille.')}
          ${kv('MET tåke',  fmtNum(now.fogAreaFraction, 0, '%'), '',                                 'MET Norway sin egen prognose for tåkedekning. Andel av himmelen dekket av tåke.')}
        </div>
        <div class="fog-kv-help-box" id="fog-kv-help-box" hidden>
          <div class="fog-kv-help-title"></div>
          <div class="fog-kv-help-text"></div>
        </div>
      </div>
      <div class="fog-explainer" id="fog-explainer" hidden>
        <h4>Slik fungerer tåke-oversikten</h4>
        <p>Havtåke oppstår når varm, fuktig luft beveger seg over kaldere sjøvann. Luften kjøles ned til duggpunktet og vanndampen kondenserer til tåkedråper. Dette er den vanligste formen for tåke på sommeren langs norskekysten.</p>
        <p><strong>Appen regner tåke-risiko som det høyeste av to signaler:</strong></p>
        <ol>
          <li><strong>MET Norway sin prognose</strong> for tåkedekning (<em>fog area fraction</em>) — vises som "MET tåke"-verdien.</li>
          <li><strong>Vår egen havtåke-modell</strong> som kombinerer duggpunkt, sjøtemperatur, vind og fuktighet.</li>
        </ol>
        <p><strong>Nøkkelformel:</strong> Hvis <em>duggpunkt &gt; sjøtemperatur</em> og vinden er svak (&lt; 10 m/s), er det fare for havtåke. Jo høyere luftfuktighet og jo mindre duggpunkt-spread, jo mer sikker er risikoen.</p>
        <p class="fog-explainer-note">Trykk på ⓘ igjen for å lukke.</p>
      </div>
    </div>` : '';

  const peakRow = peak
    ? `<div class="fog-peak">Høyeste risiko neste 48 t: <strong>${FOG_LABELS[peak.level]}</strong> ${fmtRel(peak.time)}</div>`
    : `<div class="fog-peak">Ingen tåke-risiko registrert de neste 48 timene.</div>`;

  const bars = timeline.map(r => {
    const hr = new Date(r.time).getHours();
    const lbl = hr % 6 === 0 ? `<span>${String(hr).padStart(2,'0')}</span>` : '';
    const tip = `${fmtTime(r.time)} · ${FOG_LABELS[r.level]}` + (r.reasons?.length ? `&#10;${r.reasons.join('&#10;')}` : '');
    return `<div class="fog-bar" style="background:${FOG_COLORS[r.level]}" title="${tip}">${lbl}</div>`;
  }).join('');

  // Windy.com embed — visibility-lag, zoom 9 ≈ 50 km synlig
  const windy = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&zoom=9&level=surface&overlay=visibility&product=ecmwf&menu=&message=&marker=true&type=map&location=coordinates&metricWind=m%2Fs&metricTemp=default`;

  return `
    <div class="sl">Nå</div>
    ${nowCard}
    ${peakRow}

    <div class="sl" style="margin-top:24px">Tåke-risiko neste 48 timer</div>
    <div class="fog-timeline">${bars}</div>
    <div class="fog-legend">
      <span style="--c:${FOG_COLORS[0]}">Lav</span>
      <span style="--c:${FOG_COLORS[1]}">Moderat</span>
      <span style="--c:${FOG_COLORS[2]}">Høy</span>
      <span style="--c:${FOG_COLORS[3]}">Svært høy</span>
    </div>

    <div class="sl" style="margin-top:28px">Sikt — interaktivt kart</div>
    <div class="fog-map">
      <iframe src="${windy}" width="100%" height="420" frameborder="0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </div>
    <div class="wx-source">Kart: Windy.com (visibility · ECMWF) · Prognose: MET Norway (locationforecast + oceanforecast)</div>

    <style>
      .fog-now { margin-bottom: 12px; border:1px solid var(--line); background:var(--white); }
      .fog-now-banner {
        display:flex; align-items:center; gap:12px; padding:10px 14px; color:#fff;
      }
      .fog-now-title {
        font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:11px;
        letter-spacing:.14em; text-transform:uppercase; opacity:.85;
      }
      .fog-now-level {
        font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:18px;
        letter-spacing:.03em; flex:1;
      }
      .fog-now-info {
        background:rgba(255,255,255,.25); border:none; color:#fff; cursor:pointer;
        width:26px; height:26px; font-size:14px; font-weight:700; line-height:1;
        display:flex; align-items:center; justify-content:center; transition:background .15s;
      }
      .fog-now-info:hover       { background:rgba(255,255,255,.4); }
      .fog-now-info-open        { background:rgba(0,0,0,.25); }
      .fog-now-body { padding:14px; }
      .fog-now-reasons { font-size:13px; color:var(--ink); line-height:1.55; margin-bottom:14px; }
      .fog-now-grid {
        display:grid; grid-template-columns:repeat(3,1fr); gap:10px 6px;
        padding-top:12px; border-top:1px solid var(--line);
      }
      @media (min-width:500px) { .fog-now-grid { grid-template-columns:repeat(6,1fr); } }
      .fog-kv {
        display:flex; flex-direction:column; align-items:center; gap:3px;
        padding:8px 4px; border-radius:4px; transition: background .15s;
      }
      .fog-kv-clickable { cursor:pointer; user-select:none; }
      .fog-kv-clickable:hover { background:#eef2f7; }
      .fog-kv-clickable:focus-visible { outline:2px solid var(--blue); outline-offset:1px; }
      .fog-kv-selected { background:#e3edf8; }
      .fog-kv strong { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:1.05rem; color:var(--ink); }
      .fog-kv-lbl { font-size:10px; color:var(--ink-light); text-align:center; letter-spacing:.02em; }
      .fog-kv-help {
        display:inline-block; width:13px; height:13px; line-height:12px; text-align:center;
        margin-left:4px; border:1px solid var(--ink-light); border-radius:50%;
        font-size:9px; color:var(--ink-light); font-weight:700; vertical-align:middle;
      }
      .fog-kv-clickable:hover .fog-kv-help,
      .fog-kv-selected       .fog-kv-help { border-color:var(--blue); color:var(--blue); }

      .fog-kv-help-box {
        margin-top:10px; padding:10px 12px; background:#eef2f7;
        border-left:3px solid var(--blue); font-size:12.5px; color:var(--ink); line-height:1.5;
      }
      .fog-kv-help-title {
        font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:12px;
        letter-spacing:.1em; text-transform:uppercase; color:var(--blue); margin-bottom:4px;
      }
      .fog-explainer {
        padding:14px; border-top:1px solid var(--line); background:#f8f9fb;
        font-size:12.5px; color:var(--ink); line-height:1.55;
      }
      .fog-explainer h4 {
        font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:13px;
        letter-spacing:.08em; text-transform:uppercase; color:var(--blue);
        margin:0 0 10px; padding:0;
      }
      .fog-explainer p  { margin:0 0 10px; }
      .fog-explainer ol { margin:0 0 10px 20px; padding:0; }
      .fog-explainer ol li { margin-bottom:4px; }
      .fog-explainer-note { font-size:11px; color:var(--ink-light); font-style:italic; margin-top:14px !important; }
      .fog-peak { font-size:12px; color:var(--ink-light); padding:10px 0 4px; }
      .fog-timeline { display:flex; height:44px; border:1px solid var(--line); margin-bottom:22px; }
      .fog-bar { flex:1; min-width:4px; position:relative; border-right:1px solid rgba(255,255,255,.25); cursor:help; }
      .fog-bar:last-child { border-right:none; }
      .fog-bar > span { position:absolute; bottom:-18px; left:50%; transform:translateX(-50%); font-size:9px; color:var(--ink-light); font-family:'Barlow Condensed',sans-serif; font-weight:700; letter-spacing:.05em; }
      .fog-legend { display:flex; gap:16px; padding:4px 0 8px; justify-content:center; flex-wrap:wrap; font-size:11px; color:var(--ink-light); }
      .fog-legend span::before { content:''; display:inline-block; width:10px; height:10px; background:var(--c); margin-right:5px; vertical-align:middle; }
      .fog-map iframe { display:block; border:1px solid var(--line); }
    </style>
  `;
}

function kv(label, value, sub, help) {
  const dataHelp  = help  ? ` data-help="${help.replace(/"/g, '&quot;')}"` : '';
  const dataLabel = ` data-label="${label}"`;
  const hint      = help  ? '<span class="fog-kv-help">?</span>' : '';
  const clickable = help  ? ' fog-kv-clickable' : '';
  const role      = help  ? ' role="button" tabindex="0"'        : '';
  return `
    <div class="fog-kv${clickable}"${dataHelp}${dataLabel}${role}>
      <strong>${value}</strong>
      <span class="fog-kv-lbl">${label}${sub ? ' · ' + sub : ''}${hint}</span>
    </div>`;
}

function fmtNum(v, digits, unit) {
  if (v == null) return '—';
  const n = digits ? Number(v).toFixed(digits) : Math.round(v);
  return `${n}${unit || ''}`;
}

function fmtRel(iso) {
  const h = Math.round((new Date(iso).getTime() - Date.now()) / 3600_000);
  if (h <= 0)  return '(nå)';
  if (h < 24)  return `om ${h} t`;
  return `om ${Math.round(h / 24)} d`;
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
