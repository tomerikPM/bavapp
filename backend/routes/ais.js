'use strict';

// AIS-proxy som merger BarentsWatch (kommersiell, Class A) og Signal K aisstream-plugin
// (alle klasser inkl. Class B / fritidsbåter).
// BarentsWatch: https://live.ais.barentswatch.no/index.html
// Signal K vessels: http://<sk>:3000/signalk/v1/api/vessels

const express = require('express');
const https   = require('https');
const http    = require('http');

const router = express.Router();

const TOKEN_URL = 'https://id.barentswatch.no/connect/token';
const BW_HOST   = 'live.ais.barentswatch.no';
const BW_BASE   = `https://${BW_HOST}/live`;
const SK_URL    = (process.env.SIGNALK_URL || 'http://localhost:3000').replace(/\/$/, '');

const SK_POLL_INTERVAL_MS = 20_000; // SK-polling-frekvens i SSE

let _token    = null;
let _tokenExp = 0;

async function getToken() {
  const now = Date.now();
  if (_token && now < _tokenExp - 60_000) return _token;

  const id     = process.env.BARENTSWATCH_CLIENT_ID;
  const secret = process.env.BARENTSWATCH_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('BARENTSWATCH_CLIENT_ID/SECRET mangler i .env');
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     id,
    client_secret: secret,
    scope:         'ais',
  });

  const r = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Token-feil ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  _token    = data.access_token;
  _tokenExp = now + (data.expires_in ?? 3600) * 1000;
  return _token;
}

function parseBbox(bbox) {
  const parts = String(bbox).split(',').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new Error('Ugyldig bbox — forventet "lat1,lon1,lat2,lon2"');
  }
  const [lat1, lon1, lat2, lon2] = parts;
  return {
    latMin: Math.min(lat1, lat2),
    latMax: Math.max(lat1, lat2),
    lonMin: Math.min(lon1, lon2),
    lonMax: Math.max(lon1, lon2),
  };
}

function bboxToPolygon({ latMin, latMax, lonMin, lonMax }) {
  return {
    type: 'Polygon',
    coordinates: [[
      [lonMin, latMin], [lonMax, latMin], [lonMax, latMax], [lonMin, latMax], [lonMin, latMin],
    ]],
  };
}

// ── Signal K → BarentsWatch-lignende flatformat ───────────────────────────────
// SK leverer SI-enheter (m/s, radianer); frontend forventer knop/grader.
const SK_STATE_TO_AIS = {
  'moored':                          5,
  'anchored':                        1,
  'motoring':                        0,
  'under way using engine':          0,
  'sailing':                         8,
  'under way sailing':               8,
  'fishing':                         7,
  'aground':                         6,
  'restricted manoeuverability':     3,
  'not under command':               2,
  'constrained by draft':            4,
};

function skToFlat(v, mmsi) {
  const nav    = v.navigation || {};
  const design = v.design || {};
  const pos    = nav.position?.value;
  if (!pos || pos.latitude == null || pos.longitude == null) return null;

  const sogMps  = nav.speedOverGround?.value;
  const cogRad  = nav.courseOverGroundTrue?.value;
  const hdgRad  = nav.headingTrue?.value;
  const draftM  = design.draft?.value?.current ?? design.draft?.value?.maximum;
  const stateRaw = nav.state?.value?.toLowerCase?.();

  // Ferskeste timestamp på tvers av kjente felter
  const tsCandidates = [
    nav.position?.timestamp,
    nav.speedOverGround?.timestamp,
    nav.courseOverGroundTrue?.timestamp,
    nav.headingTrue?.timestamp,
  ].filter(Boolean);
  const msgtime = tsCandidates.sort().pop() || new Date().toISOString();

  return {
    mmsi:               Number(mmsi) || mmsi,
    name:               v.name || null,
    latitude:           pos.latitude,
    longitude:          pos.longitude,
    speedOverGround:    sogMps  != null ? sogMps  * 1.94384449 : null,           // m/s → kn
    courseOverGround:   cogRad  != null ? (cogRad * 180 / Math.PI + 360) % 360 : null,
    trueHeading:        hdgRad  != null ? Math.round((hdgRad * 180 / Math.PI + 360) % 360) : null,
    navigationalStatus: stateRaw ? (SK_STATE_TO_AIS[stateRaw] ?? null) : null,
    shipType:           design.aisShipType?.value?.id ?? null,
    shipLength:         design.length?.value?.overall ?? null,
    shipWidth:          design.beam?.value ?? null,
    draught:            draftM  != null ? Math.round(draftM * 10) : null,         // m → tideler
    callSign:           v.communication?.callsignVhf || null,
    destination:        nav.destination?.commonName?.value || null,
    aisClass:           'B', // aisstream-plugin sin verdi her er Class B; stort sett dekkes A av BW
    msgtime,
    _source:            'sk',
  };
}

async function fetchSkVessels(bbox) {
  const url = `${SK_URL}/signalk/v1/api/vessels`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const data = await r.json();
    const out = [];
    for (const [key, v] of Object.entries(data)) {
      if (!v || typeof v !== 'object') continue;
      if (key === 'undefined' || key === 'self') continue;
      const mmsiFromKey = key.match(/mmsi[:.](\d+)/i)?.[1];
      const mmsi = v.mmsi || mmsiFromKey;
      if (!mmsi) continue;
      const flat = skToFlat(v, mmsi);
      if (!flat) continue;
      if (flat.latitude  < bbox.latMin || flat.latitude  > bbox.latMax) continue;
      if (flat.longitude < bbox.lonMin || flat.longitude > bbox.lonMax) continue;
      out.push(flat);
    }
    return out;
  } catch (e) {
    console.warn('[ais] SK vessels fetch feilet:', e.message);
    return [];
  }
}

// Merge BW + SK på MMSI. Ferskeste msgtime vinner; eldre fyller manglende felter.
function mergeByMmsi(...arrays) {
  const map = new Map();
  for (const arr of arrays) {
    for (const v of arr) {
      if (!v?.mmsi) continue;
      const key = String(v.mmsi);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, v);
      } else {
        const newerIsV = (Date.parse(v.msgtime) || 0) > (Date.parse(existing.msgtime) || 0);
        const newer = newerIsV ? v : existing;
        const older = newerIsV ? existing : v;
        map.set(key, { ...older, ...newer });
      }
    }
  }
  return Array.from(map.values());
}

// ── /snapshot ─────────────────────────────────────────────────────────────────
router.get('/snapshot', async (req, res) => {
  try {
    const bbox    = parseBbox(req.query.bbox);
    const polygon = bboxToPolygon(bbox);

    const [bwVessels, skVessels] = await Promise.all([
      fetchBwSnapshot(polygon).catch(e => { console.warn('[ais] BW snapshot feilet:', e.message); return []; }),
      fetchSkVessels(bbox),
    ]);

    const merged = mergeByMmsi(bwVessels, skVessels);
    res.set('Cache-Control', 'no-cache');
    res.json(merged);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function fetchBwSnapshot(polygon) {
  const token  = await getToken();
  const filter = { geometry: polygon, includePosition: true, includeStatic: true };
  const r = await fetch(`${BW_BASE}/v1/latest/ais`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
    body: JSON.stringify(filter),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`BarentsWatch ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();

  // Merge Position + Staticdata per MMSI fra BW
  const byMmsi = new Map();
  for (const m of (Array.isArray(data) ? data : [])) {
    if (!m?.mmsi) continue;
    const existing = byMmsi.get(m.mmsi) || { mmsi: m.mmsi };
    byMmsi.set(m.mmsi, { ...existing, ...m, _source: 'bw' });
  }
  return Array.from(byMmsi.values());
}

// ── /stream ───────────────────────────────────────────────────────────────────
// SSE som proxy-er BW upstream + poll-er SK hvert SK_POLL_INTERVAL_MS og emitter
// vessels som SSE-meldinger i samme format som BW.
router.get('/stream', async (req, res) => {
  let bbox, polygon;
  try {
    bbox    = parseBbox(req.query.bbox);
    polygon = bboxToPolygon(bbox);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  res.set({
    'Content-Type':       'text/event-stream',
    'Cache-Control':      'no-cache',
    'Connection':         'keep-alive',
    'X-Accel-Buffering':  'no',
  });
  res.flushHeaders();

  let upstream = null;
  let alive    = true;
  // Spor sist sendte SK-vessels for å kun emitte når noe har endret seg
  const skLastTs = new Map(); // mmsi → msgtime

  const sendErr = (msg) => {
    if (!alive) return;
    try { res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`); } catch {}
  };
  const sendVessel = (v) => {
    if (!alive) return;
    try { res.write(`data: ${JSON.stringify(v)}\n\n`); } catch {}
  };

  const cleanup = () => {
    alive = false;
    try { upstream?.destroy(); } catch {}
    clearInterval(heartbeat);
    clearInterval(skPoll);
  };
  req.on('close', cleanup);
  req.on('error', cleanup);

  const heartbeat = setInterval(() => {
    if (!alive) return;
    try { res.write(': hb\n\n'); } catch { cleanup(); }
  }, 25_000);

  // SK-polling-løkke. Første tikk umiddelbart.
  const tickSk = async () => {
    if (!alive) return;
    const vs = await fetchSkVessels(bbox);
    for (const v of vs) {
      const prev = skLastTs.get(String(v.mmsi));
      if (prev !== v.msgtime) {
        skLastTs.set(String(v.mmsi), v.msgtime);
        sendVessel(v);
      }
    }
  };
  const skPoll = setInterval(tickSk, SK_POLL_INTERVAL_MS);
  tickSk();

  // BW upstream
  try {
    const token   = await getToken();
    const filter  = { geometry: polygon, includePosition: true, includeStatic: true, downsample: true };
    const bodyStr = JSON.stringify(filter);

    upstream = https.request({
      method:   'POST',
      hostname: BW_HOST,
      path:     '/live/v1/sse/ais',
      headers: {
        'Authorization':  `Bearer ${token}`,
        'Content-Type':   'application/json',
        'Accept':         'text/event-stream',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (uRes) => {
      if (uRes.statusCode !== 200) {
        let buf = '';
        uRes.on('data', c => buf += c);
        uRes.on('end',  () => {
          sendErr(`BW upstream ${uRes.statusCode}: ${buf.slice(0, 200)}`);
        });
        return;
      }
      uRes.on('data', chunk => { if (alive) res.write(chunk); });
      uRes.on('end',  () => { /* la SK-poll fortsette selv om BW lukker */ });
      uRes.on('error', err => { sendErr('BW: ' + err.message); });
    });

    upstream.on('error', err => { sendErr('BW: ' + err.message); });
    upstream.write(bodyStr);
    upstream.end();
  } catch (e) {
    sendErr('BW init: ' + e.message);
  }
});

module.exports = router;
