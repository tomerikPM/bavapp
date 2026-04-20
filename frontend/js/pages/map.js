// pages/map.js — kart med live posisjon + historiske GPS-spor fra turer
import * as SK from '../signalk.js';
import { trips } from '../api.js';

// ── State ─────────────────────────────────────────────────────────────────────
let _map           = null;
let _liveMarker    = null;
let _liveTrack     = [];
let _liveLine      = null;
let _leafletLoaded = false;
let _tripLayers    = {};    // { tripId: { line, marker } }
let _activeTrip    = null;  // tripId som er valgt

// Fargepalett for historiske turer (går rundt)
const TRIP_COLORS = [
  '#e65c00', '#1a7040', '#7b1fa2', '#b01020',
  '#0288d1', '#e91e8c', '#388e3c', '#f57f17',
];

// ── Render ────────────────────────────────────────────────────────────────────
export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Kart</div>
      <div class="ph-s" id="map-status">Sist kjente posisjon · Kristiansand havn</div>
    </div>

    <!-- Kart -->
    <div id="map-container" style="height:52vh;min-height:280px;background:var(--surface);position:relative;border:1px solid var(--line)">
      <div class="wx-load" style="position:absolute;inset:0;display:flex"><div class="spin"></div>Laster kart…</div>
    </div>

    <!-- Live-info -->
    <div style="margin:8px 0 16px">
      <div class="sgrid">
        <div class="sc">
          <div class="sc-lbl">Breddegrad</div>
          <div class="sc-v" id="map-lat">—</div>
        </div>
        <div class="sc">
          <div class="sc-lbl">Lengdegrad</div>
          <div class="sc-v" id="map-lon">—</div>
        </div>
        <div class="sc">
          <div class="sc-lbl">Fart</div>
          <div class="sc-v" id="map-sog">—</div>
        </div>
        <div class="sc">
          <div class="sc-lbl">Kurs</div>
          <div class="sc-v" id="map-cog">—</div>
        </div>
      </div>
    </div>

    <!-- Turspor-seksjon -->
    <div class="sl">Turspor — vis på kart</div>
    <div id="trip-tracks-list">
      <div class="wx-load"><div class="spin"></div>Laster turer…</div>
    </div>

    <!-- Aktiv tur-info -->
    <div id="trip-track-info" style="display:none;margin-top:8px;padding:14px 16px;background:var(--white);border:1px solid var(--line);border-left:4px solid var(--blue)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="trip-ti-name" id="tti-name" style="font-size:13px;font-weight:600;color:var(--ink)"></div>
        <button class="btn-secondary" style="font-size:.6rem;padding:3px 8px" id="tti-close">✕ Skjul</button>
      </div>
      <div class="sgrid" style="margin:0">
        <div class="sc"><div class="sc-lbl">Dato</div><div class="sc-v" id="tti-date">—</div></div>
        <div class="sc"><div class="sc-lbl">Distanse</div><div class="sc-v" id="tti-dist">—</div></div>
        <div class="sc"><div class="sc-lbl">Maks fart</div><div class="sc-v" id="tti-spd">—</div></div>
        <div class="sc"><div class="sc-lbl">Varighet</div><div class="sc-v" id="tti-dur">—</div></div>
      </div>
    </div>

  <style>
    .map-trip-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px; border-bottom: 1px solid var(--line);
      cursor: pointer; background: var(--white);
      transition: background .12s;
    }
    .map-trip-row:hover { background: var(--surface); }
    .map-trip-row.active { background: var(--blue-tint); }
    .map-trip-dot {
      width: 10px; height: 10px; border-radius: 50%;
      flex-shrink: 0; border: 2px solid rgba(255,255,255,.7);
      box-shadow: 0 0 0 1px rgba(0,0,0,.15);
    }
    .map-trip-name { font-size: 13px; font-weight: 500; color: var(--ink); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .map-trip-meta { font-size: 11px; color: var(--ink-light); flex-shrink: 0; text-align: right; }
    .map-trip-no-track { font-size: 11px; color: #bbb; font-style: italic; flex-shrink: 0; }
  </style>`;

  await loadLeaflet();
  initMap();

  const state = SK.getState();
  if (SK.get.lat(state)) updatePosition(state);

  await loadTripList();

  document.getElementById('tti-close')?.addEventListener('click', () => {
    clearActiveTrip();
  });
}

export function onShow() {
  if (_map) setTimeout(() => _map.invalidateSize(), 100);
}

export function onSkUpdate(state) {
  updatePosition(state);
}

// ── Kart-init ─────────────────────────────────────────────────────────────────
function initMap() {
  const mapEl = document.getElementById('map-container');
  if (!mapEl || !window.L) return;

  const defaultLat = parseFloat(localStorage.getItem('wx_lat') || '58.1467');
  const defaultLon = parseFloat(localStorage.getItem('wx_lon') || '7.9956');

  _map = window.L.map('map-container', { zoomControl: true }).setView([defaultLat, defaultLon], 11);

  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19,
  }).addTo(_map);

  // Hjemmehavn-markør
  window.L.marker([58.1467, 7.9956], {
    icon: window.L.divIcon({
      className: '',
      html: `<div style="width:10px;height:10px;background:var(--red,#c00);border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
      iconSize: [10, 10], iconAnchor: [5, 5],
    }),
  }).addTo(_map).bindPopup('<b>Hjemmehavn</b><br>Kristiansand');

  mapEl.querySelector('.wx-load')?.remove();
}

// ── Live posisjon ─────────────────────────────────────────────────────────────
function updatePosition(state) {
  const lat = SK.get.lat(state);
  const lon = SK.get.lon(state);
  if (!lat || !lon || !_map) return;

  const sog    = SK.get.sogKnots(state);
  const cogRad = state['navigation.courseOverGroundTrue'];
  const cogDeg = cogRad ? Math.round(cogRad * 180 / Math.PI) : null;

  setText('map-lat', lat.toFixed(5) + '°N');
  setText('map-lon', lon.toFixed(5) + '°Ø');
  setText('map-sog', sog != null ? sog.toFixed(1) + ' kn' : '—');
  setText('map-cog', cogDeg != null ? cogDeg + '°' : '—');
  setText('map-status', `Live posisjon · ${new Date().toLocaleTimeString('no', { hour:'2-digit', minute:'2-digit' })}`);

  if (_liveMarker) {
    _liveMarker.setLatLng([lat, lon]);
  } else {
    _liveMarker = window.L.marker([lat, lon], {
      icon: window.L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:#003b7e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      }),
      zIndexOffset: 1000,
    }).addTo(_map).bindPopup('<b>Bavaria Sport 32</b><br>FAR999 · Live');
  }

  if (_liveTrack.length === 0 || distM(_liveTrack[_liveTrack.length-1], [lat, lon]) > 15) {
    _liveTrack.push([lat, lon]);
    if (_liveTrack.length > 2000) _liveTrack.shift();
    if (_liveLine) {
      _liveLine.setLatLngs(_liveTrack);
    } else {
      _liveLine = window.L.polyline(_liveTrack, { color:'#003b7e', weight:2.5, opacity:.7, dashArray: null }).addTo(_map);
    }
  }

  const center = _map.getCenter();
  if (distM([center.lat, center.lng], [lat, lon]) > 600 && !_activeTrip) {
    _map.panTo([lat, lon]);
  }
}

// ── Turliste ──────────────────────────────────────────────────────────────────
async function loadTripList() {
  const box = document.getElementById('trip-tracks-list');
  if (!box) return;

  try {
    const { data } = await trips.list({ limit: 20 });
    if (!data.length) {
      box.innerHTML = '<div class="empty" style="font-size:12px">Ingen turer ennå — kjør seed-trips.sh</div>';
      return;
    }

    box.innerHTML = `<div style="border-top:1px solid var(--line)">` +
      data.map((t, i) => {
        const color  = TRIP_COLORS[i % TRIP_COLORS.length];
        const d      = new Date(t.start_ts);
        const dateStr= d.toLocaleDateString('no', { day:'2-digit', month:'short', year:'2-digit' });
        const dist   = t.distance_nm ? parseFloat(t.distance_nm).toFixed(1) + ' nm' : '';
        return `
          <div class="map-trip-row" data-trip-id="${t.id}" data-color="${color}" data-idx="${i}">
            <div class="map-trip-dot" style="background:${color}"></div>
            <div class="map-trip-name">${t.name || 'Tur ' + dateStr}</div>
            <div class="map-trip-meta">${dist ? dist + ' · ' : ''}${dateStr}</div>
          </div>`;
      }).join('') + `</div>`;

    box.querySelectorAll('.map-trip-row').forEach(row => {
      row.addEventListener('click', () => {
        const id    = row.dataset.tripId;
        const color = row.dataset.color;
        if (_activeTrip === id) {
          clearActiveTrip();
        } else {
          showTripTrack(id, color, row, data.find(t => t.id === id));
        }
      });
    });
  } catch (e) {
    box.innerHTML = `<div class="empty" style="font-size:12px">Feil: ${e.message}</div>`;
  }
}

// ── Vis GPS-spor for én tur ────────────────────────────────────────────────────
async function showTripTrack(tripId, color, rowEl, tripMeta) {
  if (!_map) return;

  // Fjern gammel aktiv tur
  clearActiveTrip();

  // Merk rad som aktiv
  rowEl.classList.add('active');
  _activeTrip = tripId;

  // Last inn full tur med track
  const base = localStorage.getItem('backend_url') || 'http://localhost:3001';
  const res  = await fetch(`${base}/api/trips/${tripId}`);
  const trip = await res.json();

  const track = Array.isArray(trip.track) ? trip.track : [];

  if (track.length < 2) {
    // Ingen GPS-data
    rowEl.querySelector('.map-trip-meta').textContent += ' · ingen GPS';
    return;
  }

  // Tegn polyline
  const latlngs = track.map(p => [p.lat, p.lon]);
  const line    = window.L.polyline(latlngs, {
    color,
    weight:    3,
    opacity:   0.85,
    lineJoin:  'round',
    lineCap:   'round',
  }).addTo(_map);

  // Start-markør
  const startMarker = window.L.marker(latlngs[0], {
    icon: window.L.divIcon({
      className: '',
      html: `<div style="width:12px;height:12px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
      iconSize: [12, 12], iconAnchor: [6, 6],
    }),
  }).addTo(_map).bindPopup(`<b>Start</b><br>${trip.name || 'Tur'}`);

  // Slutt-markør (kun om start ≠ slutt)
  const endPt = latlngs[latlngs.length - 1];
  let endMarker = null;
  if (distM(latlngs[0], endPt) > 100) {
    endMarker = window.L.marker(endPt, {
      icon: window.L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;background:#fff;border:3px solid ${color};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6],
      }),
    }).addTo(_map).bindPopup(`<b>Slutt</b>`);
  }

  _tripLayers[tripId] = { line, startMarker, endMarker };

  // Zoom til sporets bounding box
  _map.fitBounds(line.getBounds(), { padding: [30, 30], maxZoom: 13 });

  // Fyll inn info-panel
  if (tripMeta) {
    const d   = new Date(tripMeta.start_ts);
    const dur = tripMeta.end_ts ? Math.round((new Date(tripMeta.end_ts) - d) / 60000) : null;
    setText('tti-name', trip.name || 'Tur ' + d.toLocaleDateString('no'));
    setText('tti-date', d.toLocaleDateString('no', { weekday:'short', day:'numeric', month:'long', year:'numeric' }));
    setText('tti-dist', tripMeta.distance_nm ? parseFloat(tripMeta.distance_nm).toFixed(1) + ' nm' : '—');
    setText('tti-spd',  tripMeta.max_speed_kn ? parseFloat(tripMeta.max_speed_kn).toFixed(1) + ' kn' : '—');
    setText('tti-dur',  dur ? (dur >= 60 ? Math.floor(dur/60) + 't ' + (dur%60) + 'min' : dur + ' min') : '—');
    const infoEl = document.getElementById('trip-track-info');
    if (infoEl) {
      infoEl.style.display = '';
      infoEl.style.borderLeftColor = color;
    }
  }
}

// ── Fjern aktivt spor ─────────────────────────────────────────────────────────
function clearActiveTrip() {
  if (!_activeTrip) return;

  // Fjern Leaflet-lag
  const layers = _tripLayers[_activeTrip];
  if (layers) {
    if (layers.line)        _map?.removeLayer(layers.line);
    if (layers.startMarker) _map?.removeLayer(layers.startMarker);
    if (layers.endMarker)   _map?.removeLayer(layers.endMarker);
    delete _tripLayers[_activeTrip];
  }

  // Fjern aktiv-markering i liste
  document.querySelectorAll('.map-trip-row.active').forEach(r => r.classList.remove('active'));

  // Skjul info-panel
  const infoEl = document.getElementById('trip-track-info');
  if (infoEl) infoEl.style.display = 'none';

  _activeTrip = null;
}

// ── Leaflet-loader ────────────────────────────────────────────────────────────
async function loadLeaflet() {
  if (_leafletLoaded || window.L) { _leafletLoaded = true; return; }
  return new Promise((resolve) => {
    const link    = document.createElement('link');
    link.rel      = 'stylesheet';
    link.href     = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script  = document.createElement('script');
    script.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => { _leafletLoaded = true; resolve(); };
    script.onerror = resolve;
    document.head.appendChild(script);
  });
}

// ── Hjelpere ──────────────────────────────────────────────────────────────────
function distM([lat1, lon1], [lat2, lon2]) {
  const R    = 6371000;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a    = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
