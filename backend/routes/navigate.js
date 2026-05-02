'use strict';
// routes/navigate.js — Send navigasjonspunkt/-rute til Garmin via Signal K → NMEA 2000
//
// Kjeden:
//   BavApp → POST /api/navigate
//          → Signal K v2: PUT /resources/routes/<bavapp-uuid>   (LineString)
//          → Signal K v2: PUT /navigation/course/activeRoute    (aktiver)
//          → signalk-nmea2000-emitter-cannon plugin
//          → Cerbo VE.Can → N2K PGN 129285 + 130074 + 129284 + 129283
//          → Garmin 1223xsv: waypoint på kart + bearing/distanse til neste pkt
//
// Forutsetter på Cerbo Signal K:
//   - signalk-nmea2000-emitter-cannon installert + enabled
//   - signalk-n2k-out-trigger installert + enabled (Venus OS workaround:
//     fyrer 'nmea2000OutAvailable' som canbus-canboatjs-provideren ikke gjør)

const express = require('express');
const http    = require('http');
const https   = require('https');
const router  = express.Router();

const SK_URL = () => process.env.SIGNALK_URL || 'http://localhost:3000';

// Deterministisk UUID — samme hver gang så hver send overskriver forrige BavApp-rute.
const BAVAPP_ROUTE_ID = 'babababa-1234-4abc-8def-bababababaaa';

function httpReq(url, method, bodyObj) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib    = url.startsWith('https') ? https : http;
    const body   = bodyObj === undefined ? null : JSON.stringify(bodyObj);
    const req    = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (url.startsWith('https') ? 443 : 80),
      path:     parsed.pathname + (parsed.search || ''),
      method,
      headers:  body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
    }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('SK timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function getVesselPosition(base) {
  const r = await httpReq(`${base}/signalk/v1/api/vessels/self/navigation/position`, 'GET');
  if (r.status >= 300) throw new Error(`vessel position: HTTP ${r.status}`);
  const d = JSON.parse(r.body);
  const v = d.value || d;
  if (typeof v.latitude !== 'number' || typeof v.longitude !== 'number') {
    throw new Error('ingen gyldig båtposisjon');
  }
  return { latitude: v.latitude, longitude: v.longitude };
}

function normalizePoints(body) {
  // Multi-point:  { points: [{lat,lon,name?}, ...], routeName? }
  // Single-point: { lat, lon, name }   (backwards-compat for #tanks)
  if (Array.isArray(body.points) && body.points.length > 0) {
    return body.points.map((p, i) => {
      const lat = parseFloat(p.lat); const lon = parseFloat(p.lon);
      if (isNaN(lat) || isNaN(lon)) throw new Error(`punkt ${i}: ugyldig koordinat`);
      return { latitude: lat, longitude: lon, name: p.name || `WP${i+1}` };
    });
  }
  if (body.lat != null && body.lon != null) {
    const lat = parseFloat(body.lat); const lon = parseFloat(body.lon);
    if (isNaN(lat) || isNaN(lon)) throw new Error('ugyldig koordinat');
    return [{ latitude: lat, longitude: lon, name: body.name || 'Mål' }];
  }
  throw new Error('mangler {lat,lon} eller {points:[]}');
}

router.post('/', async (req, res) => {
  const base = SK_URL().replace(/\/$/, '');

  let dests;
  try { dests = normalizePoints(req.body); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  const routeName = req.body.routeName
    || (dests.length === 1 ? `BavApp · ${dests[0].name}` : 'BavApp · Rute');

  // GeoJSON LineString krever min 2 koordinater. Single-point: prepend båt-posisjon.
  let coords;
  try {
    if (dests.length === 1) {
      const pos = await getVesselPosition(base);
      coords = [[pos.longitude, pos.latitude], [dests[0].longitude, dests[0].latitude]];
    } else {
      coords = dests.map(p => [p.longitude, p.latitude]);
    }
  } catch (e) {
    return res.status(502).json({ error: 'Kunne ikke hente båtposisjon: ' + e.message });
  }

  // Idempotent: cancel + slett evt. forrige BavApp-rute før vi lager ny
  await httpReq(`${base}/signalk/v2/api/vessels/self/navigation/course`, 'DELETE').catch(() => {});
  await httpReq(`${base}/signalk/v2/api/resources/routes/${BAVAPP_ROUTE_ID}`, 'DELETE').catch(() => {});

  const routeBody = {
    name:        routeName,
    description: `Sendt fra BavApp ${new Date().toISOString()}`,
    feature: {
      type:     'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { name: routeName },
    },
  };

  const create = await httpReq(`${base}/signalk/v2/api/resources/routes/${BAVAPP_ROUTE_ID}`, 'PUT', routeBody);
  if (create.status >= 300) {
    return res.status(502).json({ error: `Lag rute feilet: HTTP ${create.status}`, body: create.body });
  }

  // For single-point: pointIndex=1 hopper forbi den prependede båt-posisjonen
  // og navigerer mot selve destinasjonen. For multi-point: start på pointIndex=0.
  const startIndex = coords.length - dests.length;
  const activate = await httpReq(
    `${base}/signalk/v2/api/vessels/self/navigation/course/activeRoute`,
    'PUT',
    { href: `/resources/routes/${BAVAPP_ROUTE_ID}`, pointIndex: startIndex },
  );
  if (activate.status >= 300) {
    return res.status(502).json({ error: `Aktiver rute feilet: HTTP ${activate.status}`, body: activate.body });
  }

  console.log(`[navigate] ${dests.length === 1 ? 'punkt' : 'rute (' + dests.length + 'pkt)'} → "${routeName}"`);
  res.json({ ok: true, routeId: BAVAPP_ROUTE_ID, routeName, points: dests.length });
});

// DELETE /api/navigate — avbryt aktiv navigasjon + slett BavApp-rute
router.delete('/', async (req, res) => {
  const base = SK_URL().replace(/\/$/, '');
  await httpReq(`${base}/signalk/v2/api/vessels/self/navigation/course`, 'DELETE').catch(() => {});
  await httpReq(`${base}/signalk/v2/api/resources/routes/${BAVAPP_ROUTE_ID}`, 'DELETE').catch(() => {});
  res.json({ ok: true });
});

module.exports = router;
