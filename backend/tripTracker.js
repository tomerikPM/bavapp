'use strict';

/**
 * tripTracker.js — automatisk turdeteksjon fra Signal K
 *
 * Tilstandsmaskin:
 *   idle → maybe_start → active → maybe_stop → idle
 *
 * Turstart: fart > 0.5 kn i 2 min, ELLER motor starter
 * Turslutt: fart < 0.3 kn + motor av i 5 min
 *
 * Akkumulerer GPS-spor (Haversine-distanse) og lagrer ferdig tur i SQLite.
 */

const db = require('./db');
const { randomUUID } = require('crypto');

// ── Konfig ────────────────────────────────────────────────────────────────────
const POLL_MS          = 10_000;   // poll-intervall
const START_SPEED_KN   = 0.5;     // knop — over dette er vi i bevegelse
const STOP_SPEED_KN    = 0.3;     // knop — under dette er vi i ro
const START_CONFIRM_MS = 120_000; // 2 min i bevegelse → start tur
const STOP_CONFIRM_MS  = 300_000; // 5 min i ro → slutt tur
const GPS_INTERVAL_MS  = 30_000;  // GPS-punkt-intervall
const MIN_NM           = 0.1;     // minimum distanse for å lagre tur

// ── State ─────────────────────────────────────────────────────────────────────
let _url    = process.env.SIGNALK_URL || 'http://localhost:3000';
let _timer  = null;
let _state  = 'idle';   // idle | maybe_start | active | maybe_stop
let _stateTs = null;
let _trip   = null;
let _lastGpsMs = 0;
let _errCount  = 0;

// ── Public API ────────────────────────────────────────────────────────────────
function start(signalkUrl) {
  if (signalkUrl) _url = signalkUrl;
  if (_timer) return;
  console.log('[tripTracker] Starter · Signal K:', _url);
  _timer = setInterval(poll, POLL_MS);
  poll();
}

function stop() {
  clearInterval(_timer); _timer = null;
  console.log('[tripTracker] Stoppet');
}

function getActiveTripInfo() {
  if (_state !== 'active' && _state !== 'maybe_stop') return null;
  if (!_trip) return null;
  return {
    active:       true,
    id:           _trip.id,
    start_ts:     _trip.start_ts,
    distance_nm:  +_trip.distance_nm.toFixed(2),
    max_speed_kn: +_trip.max_speed_kn.toFixed(1),
    points:       _trip.track.length,
    duration_min: Math.round((Date.now() - new Date(_trip.start_ts).getTime()) / 60000),
    state:        _state,
  };
}

function manualStart(opts = {}) {
  if (_state === 'active') return;
  _state   = 'active';
  _stateTs = Date.now();
  _trip = makeTripObj(
    opts.lat ?? null, opts.lon ?? null,
    opts.engineOn ?? false, opts.runTime ?? null
  );
  logEvent('navigation', 'Tur startet (manuelt)', null, 'info');
  console.log('[tripTracker] Manuell turstart:', _trip.id);
}

function manualStop() {
  if (_state !== 'active' && _state !== 'maybe_stop') return;
  _state = 'maybe_stop';
  _stateTs = Date.now() - STOP_CONFIRM_MS; // trigger umiddelbar stopp
  console.log('[tripTracker] Manuell turstopp initiert');
}

// ── Polling ───────────────────────────────────────────────────────────────────
async function poll() {
  let sk;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${_url}/signalk/v1/api/vessels/self`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    sk = flatten(await res.json());
    _errCount = 0;
  } catch (e) {
    if (++_errCount === 3) console.warn('[tripTracker] Signal K ikke nådd:', e.message);
    return;
  }

  const now     = Date.now();
  const lat     = sk['navigation.position']?.latitude  ?? null;
  const lon     = sk['navigation.position']?.longitude ?? null;
  const sogMs   = sk['navigation.speedOverGround'] ?? 0;
  const sogKn   = sogMs * 1.94384;
  const rpm     = (sk['propulsion.port.revolutions'] ?? 0) * 60;
  const engOn   = rpm > 100 || sk['propulsion.port.state'] === 'started';
  const heading = (sk['navigation.headingTrue'] ?? 0) * 180 / Math.PI;
  const runTime = sk['propulsion.port.runTime'] ?? null;

  switch (_state) {

    case 'idle':
      if (sogKn > START_SPEED_KN || engOn) {
        _state = 'maybe_start'; _stateTs = now;
        console.log('[tripTracker] Mulig turstart…');
      }
      break;

    case 'maybe_start':
      if (sogKn < START_SPEED_KN && !engOn) {
        _state = 'idle';
        console.log('[tripTracker] Falsk alarm, tilbake til idle');
        break;
      }
      if (now - _stateTs >= START_CONFIRM_MS) {
        _state = 'active'; _stateTs = now;
        _trip  = makeTripObj(lat, lon, engOn, runTime);
        addGps(lat, lon, sogKn, heading, now);
        _lastGpsMs = now;
        logEvent('navigation', 'Tur startet automatisk',
          `Posisjon ${lat?.toFixed(4)}°N ${lon?.toFixed(4)}°Ø`, 'info');
        console.log('[tripTracker] Tur startet:', _trip.id);
      }
      break;

    case 'active':
      // Akkumuler GPS
      if (lat && lon && now - _lastGpsMs >= GPS_INTERVAL_MS) {
        addGps(lat, lon, sogKn, heading, now);
        _lastGpsMs = now;
      }
      if (sogKn > _trip.max_speed_kn) _trip.max_speed_kn = sogKn;

      if (sogKn < STOP_SPEED_KN && !engOn) {
        _state = 'maybe_stop'; _stateTs = now;
        console.log('[tripTracker] Mulig turstopp…');
      }
      break;

    case 'maybe_stop':
      if (lat && lon && now - _lastGpsMs >= GPS_INTERVAL_MS) {
        addGps(lat, lon, sogKn, heading, now);
        _lastGpsMs = now;
      }
      if (sogKn > START_SPEED_KN || engOn) {
        _state = 'active';
        console.log('[tripTracker] Gjenopptok bevegelse');
        break;
      }
      if (now - _stateTs >= STOP_CONFIRM_MS) {
        await saveTrip(lat, lon, runTime, now);
        _state = 'idle'; _trip = null;
      }
      break;
  }
}

// ── Opprett tur-objekt ────────────────────────────────────────────────────────
function makeTripObj(lat, lon, engOn, runTime) {
  return {
    id:              randomUUID(),
    start_ts:        new Date().toISOString(),
    start_lat:       lat,
    start_lon:       lon,
    start_run_time:  runTime,
    engine_on:       engOn,
    max_speed_kn:    0,
    distance_nm:     0,
    track:           [],
    _prevLat:        lat,
    _prevLon:        lon,
  };
}

// ── Legg til GPS-punkt ────────────────────────────────────────────────────────
function addGps(lat, lon, sogKn, hdg, ts) {
  if (!_trip || lat == null || lon == null) return;
  if (_trip._prevLat != null) {
    const d = haversineNm(_trip._prevLat, _trip._prevLon, lat, lon);
    if (d < 2) _trip.distance_nm += d;  // sanity-sjekk
  }
  _trip._prevLat = lat;
  _trip._prevLon = lon;
  _trip.track.push({
    lat: +lat.toFixed(5), lon: +lon.toFixed(5),
    ts:  new Date(ts).toISOString(),
    sog: +sogKn.toFixed(1),
    hdg: Math.round(hdg),
  });
}

// ── Lagre tur i database ──────────────────────────────────────────────────────
async function saveTrip(lat, lon, runTime, now) {
  if (!_trip) return;

  if (_trip.distance_nm < MIN_NM) {
    console.log(`[tripTracker] Forkastet kort tur (${_trip.distance_nm.toFixed(3)} nm)`);
    return;
  }

  const end_ts   = new Date(now).toISOString();
  const durH     = (now - new Date(_trip.start_ts).getTime()) / 3600000;
  const avgSpKn  = durH > 0 ? _trip.distance_nm / durH : 0;
  let engHrs     = null;
  if (_trip.start_run_time != null && runTime != null) {
    engHrs = (runTime - _trip.start_run_time) / 3600;
  }
  if (lat && lon) addGps(lat, lon, 0, 0, now);

  try {
    db.prepare(`
      INSERT INTO trips
        (id, name, start_ts, end_ts, start_lat, start_lon, end_lat, end_lon,
         distance_nm, max_speed_kn, avg_speed_kn, engine_hours, track, created_at)
      VALUES
        (@id,@name,@start_ts,@end_ts,@slat,@slon,@elat,@elon,
         @dist,@maxspd,@avgspd,@engh,@track,@now)
    `).run({
      id:     _trip.id,
      name:   autoName(_trip.start_ts),
      start_ts: _trip.start_ts,
      end_ts,
      slat:   _trip.start_lat, slon: _trip.start_lon,
      elat:   lat ?? _trip.start_lat, elon: lon ?? _trip.start_lon,
      dist:   +_trip.distance_nm.toFixed(1),
      maxspd: +_trip.max_speed_kn.toFixed(1),
      avgspd: +avgSpKn.toFixed(1),
      engh:   engHrs ? +engHrs.toFixed(2) : null,
      track:  JSON.stringify(_trip.track),
      now:    new Date().toISOString(),
    });

    logEvent('navigation', 'Tur avsluttet',
      `${_trip.distance_nm.toFixed(1)} nm · maks ${_trip.max_speed_kn.toFixed(1)} kn · ${Math.round(durH*60)} min`,
      'info');
    console.log(`[tripTracker] Tur lagret: ${_trip.distance_nm.toFixed(1)} nm, maks ${_trip.max_speed_kn.toFixed(1)} kn`);
  } catch (e) {
    console.error('[tripTracker] Lagringsfeil:', e.message);
  }
}

// ── Hjelpefunksjoner ──────────────────────────────────────────────────────────
function haversineNm(lat1, lon1, lat2, lon2) {
  const R  = 3440.065;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2-lat1) * Math.PI / 180;
  const Δλ = (lon2-lon1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && 'value' in v) out[key] = v.value;
    else if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

function autoName(isoTs) {
  const d   = new Date(isoTs);
  const day = d.toLocaleDateString('no', { weekday:'long', day:'numeric', month:'long' });
  const hr  = d.getHours();
  const tod = hr<6?'nattetur':hr<11?'morgentur':hr<14?'formiddagstur':hr<18?'ettermiddagstur':'kveldscruise';
  return day.charAt(0).toUpperCase() + day.slice(1) + ' — ' + tod;
}

function logEvent(cat, title, body, severity) {
  try {
    db.prepare(`INSERT INTO events (id,ts,type,category,title,body,source,severity)
                VALUES (@id,@ts,'auto',@cat,@title,@body,'tripTracker',@sev)`)
      .run({ id: randomUUID(), ts: new Date().toISOString(), cat, title, body, sev: severity });
  } catch {}
}

module.exports = { start, stop, getActiveTripInfo, manualStart, manualStop };
