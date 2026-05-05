'use strict';
// routes/kystvaer.js — Live målt vind fra Kystverkets vindmålingsstasjoner
//
// Kilde: H2API (Volue Industrial IoT) på mobvaer.kystverket.no
// Åpent endepunkt, ingen auth. Kystverkets stasjoner oppdateres hvert 5. min,
// MET-stasjonene hver time.
//
// Sensor-mapping (standard på alle stasjonene som leverer åpne data):
//   1 = WINDDIR     vindretning, grader (hvor vinden kommer fra)
//   2 = WINDSPD     10-min snitt vindhastighet, m/s
//   3 = WINDGUS     vindkast, m/s
//   4 = WINDGUSDIR  kastretning, grader
//
// Hardkodet stasjonsliste rundt Kristiansand. Avstand beregnes fra båtens
// posisjon hvis den er gyldig, ellers fra Kristiansand sentrum.

const express = require('express');
const https   = require('https');
const router  = express.Router();

const HOST       = 'mobvaer.kystverket.no';
const CACHE_TTL  = 2 * 60_000;     // 2 min — kilden oppdateres hvert 5. min
const REQ_TIMEOUT = 8_000;
const HIST_KEEP  = 90 * 60_000;    // 90 min historikk per stasjon
const _cache    = new Map();        // "lat,lon" → { ts, data }
const _history  = new Map();        // stationId → [{ ts(ms), wind }]

// Lagre nytt sample i ringbuffer (én rad per stasjon-måletid).
function recordSample(id, wind, tsIso) {
  if (wind == null || !tsIso) return;
  const tsMs = new Date(tsIso).getTime();
  if (!Number.isFinite(tsMs)) return;
  const arr = _history.get(id) || [];
  // Dedupe: skip hvis nyeste oppføring har samme måletid
  if (arr.length && arr[arr.length-1].ts === tsMs) return;
  arr.push({ ts: tsMs, wind });
  // Prune
  const cutoff = Date.now() - HIST_KEEP;
  while (arr.length && arr[0].ts < cutoff) arr.shift();
  _history.set(id, arr);
}

// Finn trend: sammenlign nyeste sample med ett mellom 15 og 60 min gammelt
// (helst nær 30). Returnerer null hvis vi ikke har nok historikk.
function getTrend(id, currentWind) {
  if (currentWind == null) return null;
  const arr = _history.get(id);
  if (!arr || arr.length < 2) return null;
  const now = Date.now();
  const target = now - 30 * 60_000;
  let best = null;
  for (const s of arr) {
    const age = now - s.ts;
    if (age < 15*60_000 || age > 60*60_000) continue;
    if (!best || Math.abs(s.ts - target) < Math.abs(best.ts - target)) best = s;
  }
  if (!best) return null;
  const delta = currentWind - best.wind;
  const ago_min = Math.round((now - best.ts) / 60_000);
  // Stable hvis < 1 m/s endring på 30 min
  const dir = delta > 1 ? 'up' : delta < -1 ? 'down' : 'flat';
  return { delta: Number(delta.toFixed(1)), ago_min, dir };
}

// Stasjoner i Sørlandsregionen. Sortert grovt fra nær til langt.
// Lagt på `source` for UI-fargekoding (Kystverket = 5-min, MET = 60-min).
const STATIONS = [
  { id: 1115059,  name: 'Kristiansand Havn',  lat: 58.140, lon: 7.989,  source: 'Kystverket' },
  { id: 5685049,  name: 'Oksøy fyr',          lat: 58.073, lon: 8.054,  source: 'Kystverket' },
  { id: 7245049,  name: 'Søndre Katland',     lat: 58.057, lon: 6.840,  source: 'Kystverket' },
  { id: 23925059, name: 'Lille Skottholmen',  lat: 58.450, lon: 8.779,  source: 'Kystverket' },
  { id: 5905049,  name: 'Store Torungen',     lat: 58.399, lon: 8.790,  source: 'Kystverket' },
  { id: 5725049,  name: 'Lille Presteskjær',  lat: 58.323, lon: 6.258,  source: 'Kystverket' },
  { id: 20041770, name: 'Lindesnes fyr',      lat: 57.981, lon: 7.048,  source: 'MET' },
  { id: 20042160, name: 'Lista fyr',          lat: 58.109, lon: 6.567,  source: 'MET' },
  { id: 20043350, name: 'Eigerøya',           lat: 58.435, lon: 5.872,  source: 'MET' },
  { id: 20035860, name: 'Lyngør fyr',         lat: 58.636, lon: 9.148,  source: 'MET' },
];

// Haversine — avstand i km
function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://${HOST}${path}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Bavaria32App/1.0' },
      timeout: REQ_TIMEOUT,
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`);
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) { reject(e); }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Hent siste sample for én stasjon. Returnerer null hvis stasjonen er stum
// eller endepunktet feiler — én død stasjon skal ikke ta ned hele svaret.
async function fetchStation(s) {
  try {
    const samples = await fetchJson(`/v4/stations/${s.id}/free/lastSamples`);
    const dir   = samples['1']?.Value;
    const wind  = samples['2']?.Value;
    const gust  = samples['3']?.Value;
    const gdir  = samples['4']?.Value;
    const ts    = samples['2']?.Timestamp || samples['1']?.Timestamp || null;
    if (wind == null && dir == null) return null;

    const ageS = ts ? Math.round((Date.now() - new Date(ts).getTime()) / 1000) : null;
    const windRounded = wind != null ? Number(wind.toFixed(1)) : null;
    recordSample(s.id, windRounded, ts);
    return {
      id: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      source: s.source,
      wind: windRounded,
      gust: gust != null ? Number(gust.toFixed(1)) : null,
      dir:  dir  != null ? Math.round(dir)  : null,
      gust_dir: gdir != null ? Math.round(gdir) : null,
      ts,
      age_s: ageS,
      trend: getTrend(s.id, windRounded),
      // "stale" hvis Kystverket-stasjon > 30 min, MET > 90 min
      stale: ageS != null && ageS > (s.source === 'MET' ? 90*60 : 30*60),
    };
  } catch {
    return null;
  }
}

// GET /api/kystvaer?lat=58.15&lon=7.99
router.get('/', async (req, res) => {
  const lat = parseFloat(req.query.lat) || 58.15;
  const lon = parseFloat(req.query.lon) || 7.99;
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    res.set('X-Cache', 'HIT');
    return res.json(hit.data);
  }

  try {
    const results = await Promise.all(STATIONS.map(fetchStation));
    const stations = results
      .filter(Boolean)
      .map(s => ({ ...s, dist_km: Number(distKm(lat, lon, s.lat, s.lon).toFixed(1)) }))
      .sort((a, b) => a.dist_km - b.dist_km);

    const data = {
      ts: new Date().toISOString(),
      origin: { lat, lon },
      stations,
      source: 'Kystverket / MET / Statens vegvesen via mobvaer.kystverket.no/v4',
    };
    _cache.set(key, { ts: Date.now(), data });
    res.set('X-Cache', 'MISS');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'kystvaer_unavailable', message: e.message });
  }
});

// Bakgrunnspoller — fyller historikk hvert 5. min så trend er klar når
// brukeren åpner siden. Hopper over stasjoner som svarer med null.
let _pollTimer = null;
function startPoller() {
  if (_pollTimer) return;
  const tick = async () => {
    try { await Promise.all(STATIONS.map(fetchStation)); }
    catch (_) { /* enkeltfeil ignoreres — historikk er best-effort */ }
  };
  // Kjør én gang umiddelbart, deretter hvert 5. min
  tick();
  _pollTimer = setInterval(tick, 5 * 60_000);
  _pollTimer.unref?.();   // ikke blokker prosess-shutdown
}
startPoller();

module.exports = router;
