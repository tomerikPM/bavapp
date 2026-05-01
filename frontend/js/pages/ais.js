// pages/ais.js — Live AIS-kart med fartøy i nærheten (BarentsWatch).

import { ais } from '../api.js';
import * as SK from '../signalk.js?v=4';
import { toast } from '../app.js';

let _leafletReady = false;
let _map        = null;
let _ownMarker  = null;
let _vesselLayer = null;
let _markers    = new Map();   // mmsi -> { marker, data }
let _eventSource = null;
let _radiusNm   = 10;
let _bboxKey    = '';
let _refetchTimer = null;
let _lastOwnPos = null;
let _follow     = true;

const KRISTIANSAND = { lat: 58.146, lon: 7.995 };

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

// Klassifiser shipType-kategori → farge
function shipColor(type) {
  if (type == null) return '#666';
  if (type >= 60 && type <= 69) return '#b86000';     // passenger
  if (type >= 70 && type <= 79) return '#003b7e';     // cargo
  if (type >= 80 && type <= 89) return '#5a1a7a';     // tanker
  if (type === 30)              return '#1a7040';     // fishing
  if (type === 36 || type === 37) return '#0c8aa8';   // sailing/pleasure
  if (type >= 50 && type <= 55) return '#b01020';     // service (pilot/SAR/tug)
  return '#444';
}

function shipTypeLabel(type) {
  if (type == null) return 'Ukjent';
  if (type === 30)  return 'Fiskefartøy';
  if (type === 31 || type === 32) return 'Tauing';
  if (type === 33)  return 'Mudring';
  if (type === 34)  return 'Dykking';
  if (type === 35)  return 'Militært';
  if (type === 36)  return 'Seilbåt';
  if (type === 37)  return 'Fritidsbåt';
  if (type >= 40 && type <= 49) return 'Hurtigbåt';
  if (type === 50)  return 'Los';
  if (type === 51)  return 'SAR';
  if (type === 52)  return 'Slepebåt';
  if (type === 53)  return 'Havnetender';
  if (type === 54)  return 'Anti-forurensning';
  if (type === 55)  return 'Kystvakt/politi';
  if (type >= 60 && type <= 69) return 'Passasjer';
  if (type >= 70 && type <= 79) return 'Lasteskip';
  if (type >= 80 && type <= 89) return 'Tankskip';
  return `Type ${type}`;
}

function navStatusLabel(s) {
  const map = {
    0: 'Underveis (motor)',
    1: 'For anker',
    2: 'Ikke under kommando',
    3: 'Begrenset manøvrerbar',
    4: 'Begrenset av dypgående',
    5: 'Fortøyd',
    6: 'På grunn',
    7: 'Fisker',
    8: 'Underveis (seil)',
    14: 'AIS-SART (nød)',
    15: 'Udefinert',
  };
  return map[s] ?? null;
}

// ETA fra AIS er format "MMDDHHMM" (UTC), måned/dag/time/min. Returnerer "DD/MM HH:MM" eller null.
function formatEta(eta) {
  if (!eta || typeof eta !== 'string' || eta.length !== 8) return null;
  const mm = eta.slice(0,2), dd = eta.slice(2,4), hh = eta.slice(4,6), mi = eta.slice(6,8);
  if (mm === '00' || dd === '00' || hh === '24' || mi === '60') return null;
  return `${dd}/${mm} ${hh}:${mi}`;
}

function vesselIcon(v) {
  const color = shipColor(v.shipType);
  const heading = (v.trueHeading != null && v.trueHeading !== 511) ? v.trueHeading
               : (v.courseOverGround != null ? v.courseOverGround : null);
  const moving = (v.speedOverGround ?? 0) > 0.5;
  if (heading != null && moving) {
    // Piltrekant som peker i kursretning
    return window.L.divIcon({
      className: '',
      html: `<div style="transform:rotate(${heading}deg);width:18px;height:18px;display:flex;align-items:center;justify-content:center">
        <svg width="14" height="18" viewBox="0 0 14 18">
          <polygon points="7,0 14,18 7,14 0,18" fill="${color}" stroke="#fff" stroke-width="1.2"/>
        </svg>
      </div>`,
      iconSize: [18, 18], iconAnchor: [9, 9],
    });
  }
  // Stasjonær: rund prikk
  return window.L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [10, 10], iconAnchor: [5, 5],
  });
}

function popupHtml(v) {
  const name = (v.name && v.name.trim()) || `MMSI ${v.mmsi}`;
  const sog  = v.speedOverGround != null ? `${Number(v.speedOverGround).toFixed(1)} kn` : '—';
  const cog  = v.courseOverGround != null ? `${Math.round(v.courseOverGround)}°` : '—';
  const hdg  = (v.trueHeading != null && v.trueHeading !== 511) ? `${v.trueHeading}°` : '—';
  const ts   = v.msgtime ? new Date(v.msgtime).toLocaleTimeString('nb-NO', { hour:'2-digit', minute:'2-digit' }) : '—';
  const ageMin = v.msgtime ? Math.round((Date.now() - new Date(v.msgtime).getTime()) / 60000) : null;
  const ageStr = ageMin == null ? '' : ageMin < 1 ? ' (nå)' : ageMin < 60 ? ` (${ageMin} min siden)` : ` (${Math.round(ageMin/60)}t siden)`;
  const status = navStatusLabel(v.navigationalStatus);
  const dim    = (v.shipLength && v.shipWidth) ? `${v.shipLength} × ${v.shipWidth} m`
               : v.shipLength ? `${v.shipLength} m` : null;
  const draught = v.draught ? `${(v.draught/10).toFixed(1)} m` : null;
  const eta    = formatEta(v.eta);
  const dest   = v.destination?.trim();
  const callSign = v.callSign?.trim();
  const imo    = v.imoNumber || null;
  const aisCls = v.aisClass || v.reportClass;

  // Bygg en "rad" hvis verdien finnes
  const row = (label, val) => val ? `<span style="color:#888">${label}</span><span>${val}</span>` : '';

  return `
    <div style="font-family:'Barlow Condensed',sans-serif;min-width:220px;max-width:280px">
      <div style="font-weight:800;font-size:1.1rem;letter-spacing:.02em;line-height:1.1">${name}</div>
      <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">
        ${shipTypeLabel(v.shipType)}${aisCls ? ` · Klasse ${aisCls}` : ''} · MMSI ${v.mmsi}
      </div>
      ${status ? `<div style="font-size:11px;background:#f4f4f4;padding:4px 8px;margin-bottom:8px;border-left:3px solid #003b7e;text-transform:uppercase;letter-spacing:.04em">${status}</div>` : ''}
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-family:'DM Mono',monospace;font-size:.78rem;line-height:1.35">
        <span style="color:#888">Fart</span><span>${sog}</span>
        <span style="color:#888">Kurs</span><span>${cog}</span>
        <span style="color:#888">Heading</span><span>${hdg}</span>
        ${row('Mål', dest)}
        ${row('ETA', eta)}
        ${row('Størrelse', dim)}
        ${row('Dypgang', draught)}
        ${row('Kallesignal', callSign)}
        ${row('IMO', imo)}
        <span style="color:#888">Sett</span><span style="font-size:.72rem">${ts}${ageStr}</span>
      </div>
    </div>
  `;
}

function bboxFromPos(lat, lon, radiusNm) {
  const dLat = radiusNm / 60;
  const dLon = radiusNm / (60 * Math.cos(lat * Math.PI / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}

function bboxStr(b) { return b.map(n => n.toFixed(4)).join(','); }

// Merger ny melding (Position eller Staticdata) inn i eksisterende fartøy.
// Beholder tidligere felt som ikke kommer i denne meldingen.
function upsertVessel(v) {
  if (!_map || !v || !v.mmsi) return;
  const existing = _markers.get(v.mmsi);
  const merged = existing ? { ...existing.data, ...v } : v;

  // Krever posisjon for å tegne markør. Hvis vi ikke har lat/lon ennå (kun Staticdata
  // for ukjent fartøy), lagrer vi data uten markør og venter på Position.
  if (merged.latitude == null || merged.longitude == null) {
    if (existing) existing.data = merged;
    return;
  }

  const latlng = [merged.latitude, merged.longitude];
  if (existing && existing.marker) {
    existing.marker.setLatLng(latlng);
    existing.marker.setIcon(vesselIcon(merged));
    existing.marker.setPopupContent(popupHtml(merged));
    existing.data = merged;
  } else {
    const m = window.L.marker(latlng, { icon: vesselIcon(merged) }).addTo(_vesselLayer);
    m.bindPopup(popupHtml(merged));
    _markers.set(v.mmsi, { marker: m, data: merged });
  }
  updateCount();
}

function updateCount() {
  const el = document.getElementById('ais-count');
  if (el) el.textContent = String(_markers.size);
}

function clearVessels() {
  if (_vesselLayer) _vesselLayer.clearLayers();
  _markers.clear();
  updateCount();
}

async function loadSnapshot(bbox) {
  try {
    const data = await ais.snapshot(bboxStr(bbox));
    if (!Array.isArray(data)) {
      toast('Uventet AIS-respons', 'warn');
      return;
    }
    clearVessels();
    for (const v of data) upsertVessel(v);
  } catch (e) {
    toast('AIS-snapshot feilet: ' + e.message, 'error');
  }
}

function startStream(bbox) {
  if (_eventSource) { try { _eventSource.close(); } catch {} _eventSource = null; }
  const url = ais.streamUrl(bboxStr(bbox));
  try {
    _eventSource = new EventSource(url, { withCredentials: true });
    _eventSource.onmessage = (e) => {
      try {
        const v = JSON.parse(e.data);
        // BarentsWatch sender separate Position- og Staticdata-meldinger på /v1/sse/ais.
        // upsertVessel merger begge per MMSI.
        if (v && v.mmsi) upsertVessel(v);
      } catch {}
    };
    _eventSource.onerror = () => {
      const dot = document.getElementById('ais-stream-dot');
      if (dot) { dot.style.background = '#b01020'; dot.title = 'Stream-feil — gjenoppkobler'; }
    };
    _eventSource.addEventListener('open', () => {
      const dot = document.getElementById('ais-stream-dot');
      if (dot) { dot.style.background = '#1a7040'; dot.title = 'Live'; }
    });
  } catch (e) {
    toast('Kunne ikke åpne AIS-stream: ' + e.message, 'error');
  }
}

function stopStream() {
  if (_eventSource) { try { _eventSource.close(); } catch {} _eventSource = null; }
}

function rebindBbox(lat, lon) {
  const bbox = bboxFromPos(lat, lon, _radiusNm);
  const key  = bboxStr(bbox);
  if (key === _bboxKey) return;
  _bboxKey = key;

  // Debounce — unngå å ramme APIet hvert sekund når GPS rugger
  clearTimeout(_refetchTimer);
  _refetchTimer = setTimeout(async () => {
    await loadSnapshot(bbox);
    startStream(bbox);
  }, 400);
}

function ownPos() {
  const lat = SK.get.lat();
  const lon = SK.get.lon();
  if (lat != null && lon != null) return { lat, lon, source: 'signalk' };
  return { ...KRISTIANSAND, source: 'fallback' };
}

function updateOwnMarker(pos) {
  if (!_map) return;
  const heading = SK.get.cog?.() ?? null; // grader hvis tilgjengelig
  const html = `
    <div style="position:relative;width:22px;height:22px">
      <div style="position:absolute;inset:0;border-radius:50%;background:#b01020;border:3px solid #fff;box-shadow:0 0 0 2px #b01020,0 2px 6px rgba(0,0,0,.4)"></div>
      <div style="position:absolute;inset:-8px;border:2px solid rgba(176,16,32,.25);border-radius:50%;animation:ais-pulse 2s infinite"></div>
    </div>`;
  const icon = window.L.divIcon({ className:'', html, iconSize:[22,22], iconAnchor:[11,11] });
  if (_ownMarker) {
    _ownMarker.setLatLng([pos.lat, pos.lon]);
    _ownMarker.setIcon(icon);
  } else {
    _ownMarker = window.L.marker([pos.lat, pos.lon], { icon, zIndexOffset: 1000 }).addTo(_map);
    _ownMarker.bindPopup(`<div style="font-family:'Barlow Condensed',sans-serif"><b>Summer</b><br><span style="color:#888;font-size:11px">FAR999 · oss</span></div>`);
  }
}

function distanceNm(a, b) {
  const R = 3440.065;
  const φ1 = a.lat * Math.PI/180;
  const φ2 = b.lat * Math.PI/180;
  const dφ = (b.lat - a.lat) * Math.PI/180;
  const dλ = (b.lon - a.lon) * Math.PI/180;
  const x = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export async function render(container) {
  container.innerHTML = `
    <style>
      @keyframes ais-pulse { 0%{transform:scale(1);opacity:.8} 100%{transform:scale(2);opacity:0} }
      .ais-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
      .ais-toolbar label{font-family:'Barlow Condensed',sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-light)}
      .ais-toolbar select,.ais-toolbar button{font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--line);background:var(--white);padding:6px 12px;cursor:pointer}
      .ais-toolbar button.on{background:var(--blue);color:#fff;border-color:var(--blue)}
      .ais-status{display:flex;gap:14px;align-items:center;font-family:'DM Mono',monospace;font-size:.78rem;color:var(--ink-light);margin-left:auto}
      .ais-status .dot{width:8px;height:8px;border-radius:50%;background:#888;display:inline-block;margin-right:6px;vertical-align:middle}
      #ais-map{height:calc(100vh - 220px);min-height:480px;border:1px solid var(--line);background:#eef3f7}
      .ais-legend{display:flex;gap:14px;flex-wrap:wrap;font-family:'Barlow Condensed',sans-serif;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-light);margin-top:8px}
      .ais-legend span{display:inline-flex;align-items:center;gap:5px}
      .ais-legend i{width:10px;height:10px;border-radius:50%;display:inline-block;border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)}
    </style>

    <div class="ph">
      <div class="ph-t">AIS — Trafikk i nærheten</div>
      <div class="ph-s">Sanntidsdata fra Kystverket via BarentsWatch · ${_radiusNm} nm radius</div>
    </div>

    <div class="ais-toolbar">
      <label>Radius</label>
      <select id="ais-radius">
        <option value="5">5 nm</option>
        <option value="10" selected>10 nm</option>
        <option value="20">20 nm</option>
        <option value="40">40 nm</option>
      </select>
      <button id="ais-follow" class="on">⌖ Følg båten</button>
      <button id="ais-recenter">↻ Sentrér</button>
      <div class="ais-status">
        <span><span class="dot" id="ais-stream-dot"></span>Live</span>
        <span><span id="ais-count">0</span> fartøy</span>
      </div>
    </div>

    <div id="ais-map"></div>

    <div class="ais-legend">
      <span><i style="background:#b01020"></i>Summer</span>
      <span><i style="background:#003b7e"></i>Last</span>
      <span><i style="background:#5a1a7a"></i>Tank</span>
      <span><i style="background:#b86000"></i>Passasjer</span>
      <span><i style="background:#1a7040"></i>Fiske</span>
      <span><i style="background:#0c8aa8"></i>Seilbåt/fritid</span>
      <span><i style="background:#b01020"></i>Service (los/SAR/tug)</span>
      <span><i style="background:#444"></i>Annet</span>
    </div>
  `;

  await ensureLeaflet();

  const pos = ownPos();
  _lastOwnPos = pos;

  _map = window.L.map('ais-map', { zoomControl: true, scrollWheelZoom: true })
    .setView([pos.lat, pos.lon], 14);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19,
  }).addTo(_map);
  _vesselLayer = window.L.layerGroup().addTo(_map);

  // Standard visning: ~2 nm radius (4 nm bredde) rundt vår posisjon
  const viewBox = bboxFromPos(pos.lat, pos.lon, 2);
  _map.fitBounds([[viewBox[0], viewBox[1]], [viewBox[2], viewBox[3]]], { animate: false });

  updateOwnMarker(pos);
  rebindBbox(pos.lat, pos.lon);

  // Toolbar-handlers
  document.getElementById('ais-radius').addEventListener('change', (e) => {
    _radiusNm = parseInt(e.target.value, 10) || 10;
    document.querySelector('.ph-s').textContent = `Sanntidsdata fra Kystverket via BarentsWatch · ${_radiusNm} nm radius`;
    const p = ownPos();
    rebindBbox(p.lat, p.lon);
  });
  document.getElementById('ais-follow').addEventListener('click', (e) => {
    _follow = !_follow;
    e.currentTarget.classList.toggle('on', _follow);
    if (_follow) {
      const p = ownPos();
      _map.setView([p.lat, p.lon], _map.getZoom());
    }
  });
  document.getElementById('ais-recenter').addEventListener('click', () => {
    const p = ownPos();
    const v = bboxFromPos(p.lat, p.lon, 2);
    _map.fitBounds([[v[0], v[1]], [v[2], v[3]]]);
  });
}

export function onSkUpdate() {
  if (!_map) return;
  const lat = SK.get.lat();
  const lon = SK.get.lon();
  if (lat == null || lon == null) return;
  const pos = { lat, lon, source: 'signalk' };
  updateOwnMarker(pos);
  if (_follow) _map.panTo([pos.lat, pos.lon], { animate: true });

  // Beveg båten >20% av radius → refetch
  if (!_lastOwnPos || _lastOwnPos.source === 'fallback' ||
      distanceNm(_lastOwnPos, pos) > _radiusNm * 0.2) {
    _lastOwnPos = pos;
    rebindBbox(pos.lat, pos.lon);
  }
}

// Cleanup hvis siden bytter
export function destroy() {
  stopStream();
  clearTimeout(_refetchTimer);
  if (_map) { _map.remove(); _map = null; }
  _markers.clear();
  _ownMarker = null;
  _vesselLayer = null;
  _bboxKey = '';
}
