'use strict';
// routes/textforecast.js — MET Norway tekstvarsel (kystvarsel / norske havområder)
//
// Kilde: https://api.met.no/weatherapi/textforecast/3.0/
// Produkter: coast_no (kystvarsel norsk), coast_en, land, norwegian_waters
//
// Responsen er GeoJSON med ett feature per område (f.eks. "Skagerrak",
// "Svenskegrensa - Lyngør"). Hvert feature har polygon-geometri, slik at vi
// kan slå opp riktig varsel for båtens GPS-posisjon via point-in-polygon.

const express = require('express');
const https   = require('https');
const router  = express.Router();

const MET_UA       = 'Bavaria32App/1.0 tom.erik.thorsen@gmail.com';
const CACHE_TTL_MS = 60 * 60_000;  // 1 time
const _cache       = new Map();  // product → { ts, data }

function fetchMet(path) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://api.met.no${path}`, {
      headers: { 'User-Agent': MET_UA, 'Accept': 'application/json' },
      timeout: 15_000,
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end',  () => {
        try {
          if (res.statusCode !== 200) throw new Error(`MET HTTP ${res.statusCode}`);
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) { reject(e); }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Standard ray-casting point-in-polygon. `ring` er array av [lon, lat].
function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];  // [lon, lat]
    const [xj, yj] = ring[j];
    const intersect = ((yi > lat) !== (yj > lat))
      && (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInFeature(lat, lon, feature) {
  const g = feature?.geometry;
  if (!g) return false;
  if (g.type === 'Polygon') {
    return pointInRing(lat, lon, g.coordinates[0]);
  }
  if (g.type === 'MultiPolygon') {
    return g.coordinates.some(poly => pointInRing(lat, lon, poly[0]));
  }
  return false;
}

async function getTextForecast(product = 'coast_no') {
  const cached = _cache.get(product);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) return cached.data;

  const data = await fetchMet(`/weatherapi/textforecast/3.0/?forecast=${encodeURIComponent(product)}`);
  _cache.set(product, { ts: Date.now(), data });
  return data;
}

// GET /api/textforecast?lat=X&lon=Y&product=coast_no
//
// Uten lat/lon: returnerer alle områder.
// Med lat/lon:  finner området som inneholder punktet, pluss "nearby"-liste.
router.get('/', async (req, res) => {
  const lat     = req.query.lat != null ? parseFloat(req.query.lat) : null;
  const lon     = req.query.lon != null ? parseFloat(req.query.lon) : null;
  const product = String(req.query.product || 'coast_no');

  if (!/^[a-z_]+$/.test(product)) {
    return res.status(400).json({ error: 'Ugyldig product-parameter' });
  }

  try {
    const raw      = await getTextForecast(product);
    const features = Array.isArray(raw?.features) ? raw.features : [];
    const areas    = features.map(f => ({
      area:     f?.properties?.area  || 'Ukjent område',
      title:    f?.properties?.title || '',
      text:     f?.properties?.text  || '',
      interval: f?.when?.interval    || null,
    }));

    let match = null;
    if (isFinite(lat) && isFinite(lon)) {
      const hit = features.find(f => pointInFeature(lat, lon, f));
      if (hit) {
        match = {
          area:     hit.properties?.area,
          title:    hit.properties?.title,
          text:     hit.properties?.text,
          interval: hit.when?.interval || null,
        };
      }
    }

    res.json({
      product,
      lastChange: raw?.lastChange || null,
      match,        // området som inneholder båten (kan være null hvis offshore)
      areas,        // alle områder
      count:        areas.length,
      position:     isFinite(lat) && isFinite(lon) ? { lat, lon } : null,
    });
  } catch (e) {
    console.error('[textforecast] Feilet:', e.message);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
