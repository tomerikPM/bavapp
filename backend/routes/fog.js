'use strict';
// routes/fog.js — Tåke- og sikt-prognose basert på MET Norway
//
// Datakilder:
//   locationforecast/2.0/complete   — fog_area_fraction, dew_point_temperature,
//                                     air_temperature, relative_humidity, wind_speed
//   oceanforecast/2.0/complete      — sea_water_temperature
//
// Modell: høyeste score av (a) MET sin egen tåke-prognose og (b) vår havtåke-regel
// basert på duggpunkt > sjøtemperatur + vind + luftfuktighet.

const express = require('express');
const https   = require('https');
const router  = express.Router();

const MET_UA       = 'Bavaria32App/1.0 tom.erik.thorsen@gmail.com';
const CACHE_TTL_MS = 30 * 60_000;
const _cache       = new Map();  // "lat.toFixed(3),lon.toFixed(3)" → { ts, data }

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

// Beaufort-nummer for vind (m/s) — gjenbrukes i frontend også
function beaufort(mps) {
  const BF = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  for (let i = 0; i < BF.length; i++) if (mps < BF[i]) return i;
  return 12;
}

// Tåke-score 0-3 per time. Kombinerer MET sin fog_area_fraction med en
// duggpunkt-basert havtåke-regel. Returnerer MAX av de to.
//
// level 0 grønn:   ingen signal
// level 1 gul:     moderat risiko
// level 2 oransje: høy risiko
// level 3 rød:     svært høy risiko
function scoreFog(row) {
  let level = 0;
  const reasons = [];

  // (a) MET sin direkte tåke-prognose
  const f = row.fogAreaFraction;
  if (f != null) {
    if      (f >= 60) { level = Math.max(level, 3); reasons.push(`MET ${Math.round(f)}% tåke`); }
    else if (f >= 30) { level = Math.max(level, 2); reasons.push(`MET ${Math.round(f)}% tåke`); }
    else if (f >= 10) { level = Math.max(level, 1); reasons.push(`MET ${Math.round(f)}% tåke`); }
  }

  // (b) Havtåke-regel: duggpunkt vs sjøtemperatur
  //     Varm/fuktig luft over kaldere hav → kondens → tåke
  const dp  = row.dewPoint;
  const sst = row.sst;
  const w   = row.wind;
  const rh  = row.humidity;

  if (dp != null && sst != null) {
    const diff = dp - sst;  // + betyr at luften er mettet ved temperaturer OVER sjøen
    if (diff > 1 && w != null && w < 5 && rh != null && rh > 97) {
      level = Math.max(level, 3);
      reasons.push(`Havtåke: duggpunkt ${dp.toFixed(0)}°C > sjø ${sst.toFixed(0)}°C · vind ${w.toFixed(0)} m/s · fukt ${Math.round(rh)}%`);
    } else if (diff > 0 && w != null && w < 10) {
      level = Math.max(level, 2);
      reasons.push(`Havtåke mulig: duggpunkt ${dp.toFixed(0)}°C > sjø ${sst.toFixed(0)}°C · vind ${w.toFixed(0)} m/s`);
    } else if (Math.abs(diff) <= 2 && rh != null && rh > 90) {
      level = Math.max(level, 1);
      reasons.push(`Nær metning: spread duggpunkt/sjø ${diff.toFixed(1)}°C · fukt ${Math.round(rh)}%`);
    }
  }

  return { level, reasons };
}

// GET /api/fog/forecast?lat=X&lon=Y&hours=48
router.get('/forecast', async (req, res) => {
  const lat   = parseFloat(req.query.lat || '58.1467');
  const lon   = parseFloat(req.query.lon || '7.9956');
  const hours = Math.min(parseInt(req.query.hours || '48', 10), 72);

  if (!isFinite(lat) || !isFinite(lon)) {
    return res.status(400).json({ error: 'Ugyldig lat/lon' });
  }

  const key    = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = _cache.get(key);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
    return res.json({ ...cached.data, fromCache: true, cacheAgeMin: Math.round((Date.now() - cached.ts) / 60_000) });
  }

  try {
    const [land, ocean] = await Promise.all([
      fetchMet(`/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`),
      fetchMet(`/weatherapi/oceanforecast/2.0/complete?lat=${lat}&lon=${lon}`).catch(() => null),
    ]);

    const landTs  = land?.properties?.timeseries || [];
    const oceanTs = ocean?.properties?.timeseries || [];
    // Oceanforecast har egen tidssekvens — map til raskt oppslag
    const sstByTime = new Map(
      oceanTs.map(e => [e.time, e?.data?.instant?.details?.sea_water_temperature])
    );

    const timeline = landTs.slice(0, hours).map(e => {
      const d     = e?.data?.instant?.details || {};
      const n1    = e?.data?.next_1_hours || e?.data?.next_6_hours || {};
      const sst   = sstByTime.get(e.time) ?? nearestSst(e.time, sstByTime);
      const row = {
        time:            e.time,
        airTemp:         numOrNull(d.air_temperature),
        dewPoint:        numOrNull(d.dew_point_temperature),
        humidity:        numOrNull(d.relative_humidity),
        wind:            numOrNull(d.wind_speed),
        windDir:         numOrNull(d.wind_from_direction),
        fogAreaFraction: numOrNull(d.fog_area_fraction),
        sst:             numOrNull(sst),
        symbolCode:      n1?.summary?.symbol_code || null,
      };
      row.dewPointSpread = (row.airTemp != null && row.dewPoint != null)
        ? +(row.airTemp - row.dewPoint).toFixed(1)
        : null;
      const s = scoreFog(row);
      row.level   = s.level;
      row.reasons = s.reasons;
      row.bft     = row.wind != null ? beaufort(row.wind) : null;
      return row;
    });

    const data = {
      position: { lat, lon },
      hours:    timeline.length,
      timeline,
      now:      timeline[0] || null,
      peak:     timeline.reduce((a, r) => r.level > (a?.level || 0) ? r : a, null),
    };

    _cache.set(key, { ts: Date.now(), data });
    res.json({ ...data, fromCache: false });
  } catch (e) {
    console.error('[fog] Feilet:', e.message);
    res.status(502).json({ error: e.message });
  }
});

function numOrNull(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

// Oceanforecast har mer spredt tid-oppløsning enn locationforecast. Finn nærmeste tid.
function nearestSst(iso, sstByTime) {
  if (sstByTime.has(iso)) return sstByTime.get(iso);
  const target = new Date(iso).getTime();
  let best = null, bestDiff = Infinity;
  for (const [t, v] of sstByTime) {
    const diff = Math.abs(new Date(t).getTime() - target);
    if (diff < bestDiff) { bestDiff = diff; best = v; }
  }
  // Godta kun hvis innen 6 timer — ellers anta null
  return bestDiff <= 6 * 3600_000 ? best : null;
}

module.exports = router;
