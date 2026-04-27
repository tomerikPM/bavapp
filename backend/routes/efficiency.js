'use strict';
// routes/efficiency.js — korrelerer drivstoffrate, RPM og fart fra sensor_history
// og beregner effektivitetskurver for å finne optimalt kjøreområde

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const PATHS = {
  fuel: 'propulsion.port.fuel.rate',
  rpm:  'propulsion.port.revolutions',
  spd:  'navigation.speedOverGround',
};

const RPM_STEP    = 100;    // RPM per bucket
const SPD_STEP    = 0.5;    // knop per bucket
const MATCH_WIN   = 45000;  // ms: maks tidsdiff for å matche readings (45 sek)
const MIN_SAMPLES = 3;      // minimum målinger per bucket

// Binærsøk etter nærmeste element innen tidsvindaet
function findNearest(sorted, targetMs, field) {
  let lo = 0, hi = sorted.length - 1;
  let bestIdx = -1, bestDist = Infinity;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const dist = Math.abs(sorted[mid].ms - targetMs);
    if (dist < bestDist) { bestDist = dist; bestIdx = mid; }
    if (sorted[mid].ms < targetMs) lo = mid + 1;
    else if (sorted[mid].ms > targetMs) hi = mid - 1;
    else break;
  }

  // Sjekk naboene også (binærsøk er ikke garantert å treffe absolutt nærmeste)
  for (const idx of [bestIdx - 1, bestIdx, bestIdx + 1]) {
    if (idx < 0 || idx >= sorted.length) continue;
    const d = Math.abs(sorted[idx].ms - targetMs);
    if (d < bestDist) { bestDist = d; bestIdx = idx; }
  }

  return bestDist <= MATCH_WIN ? sorted[bestIdx][field] : null;
}

// GET /api/efficiency?days=90  eller  ?from=ISO&to=ISO
router.get('/', (req, res) => {
  try {
    const days = parseInt(req.query.days || '90');
    const to   = req.query.to   || new Date().toISOString();
    const from = req.query.from || new Date(Date.now() - days * 86400000).toISOString();

    const rows = db.prepare(`
      SELECT ts, path, value FROM sensor_history
      WHERE path IN (?, ?, ?)
        AND ts >= ? AND ts <= ?
      ORDER BY ts ASC
    `).all(PATHS.fuel, PATHS.rpm, PATHS.spd, from, to);

    const fuelRows = rows.filter(r => r.path === PATHS.fuel && r.value > 0);
    const rpmRows  = rows.filter(r => r.path === PATHS.rpm);
    const spdRows  = rows.filter(r => r.path === PATHS.spd);

    const toMs = ts => new Date(ts).getTime();
    const rpmMs = rpmRows.map(r => ({ ms: toMs(r.ts), rpm: r.value * 60 }));
    const spdMs = spdRows.map(r => ({ ms: toMs(r.ts), kn: r.value * 1.94384 }));

    // Bygg korrelerte datapunkter
    const points = [];
    for (const row of fuelRows) {
      const ms  = toMs(row.ts);
      const lph = row.value * 3600000;
      const rpm = rpmMs.length ? findNearest(rpmMs, ms, 'rpm') : null;
      const kn  = spdMs.length ? findNearest(spdMs, ms, 'kn')  : null;

      if (rpm === null || kn === null) continue;
      if (rpm < 500)   continue; // motor ikke i gang
      if (lph <= 0 || lph > 85) continue;
      if (kn < 0 || kn > 45)   continue;

      points.push({ lph, rpm, kn, ms });
    }

    if (!points.length) {
      return res.json({ from, to, sample_count: 0, rpm_buckets: [], speed_buckets: [], optimal_rpm: null, optimal_speed: null });
    }

    // RPM-buckets
    const rpmMap = {};
    for (const p of points) {
      const key = Math.floor(p.rpm / RPM_STEP) * RPM_STEP;
      if (!rpmMap[key]) rpmMap[key] = { lph_sum: 0, kn_sum: 0, n: 0 };
      rpmMap[key].lph_sum += p.lph;
      rpmMap[key].kn_sum  += p.kn;
      rpmMap[key].n++;
    }
    const rpm_buckets = Object.entries(rpmMap)
      .filter(([, v]) => v.n >= MIN_SAMPLES)
      .map(([key, v]) => {
        const avg_lph = v.lph_sum / v.n;
        const avg_kn  = v.kn_sum  / v.n;
        const avg_lnm = avg_kn >= 0.5 ? avg_lph / avg_kn : null;
        return {
          rpm_min: +key,
          rpm_max: +key + RPM_STEP,
          rpm_mid: +key + RPM_STEP / 2,
          avg_lph: Math.round(avg_lph * 10) / 10,
          avg_kn:  Math.round(avg_kn  * 10) / 10,
          avg_lnm: avg_lnm != null ? Math.round(avg_lnm * 100) / 100 : null,
          samples: v.n,
        };
      })
      .sort((a, b) => a.rpm_min - b.rpm_min);

    // Fartsbuckets
    const spdMap = {};
    for (const p of points) {
      if (p.kn < 1) continue;
      const key = (Math.floor(p.kn / SPD_STEP) * SPD_STEP).toFixed(1);
      if (!spdMap[key]) spdMap[key] = { lph_sum: 0, n: 0 };
      spdMap[key].lph_sum += p.lph;
      spdMap[key].n++;
    }
    const speed_buckets = Object.entries(spdMap)
      .filter(([, v]) => v.n >= MIN_SAMPLES)
      .map(([key, v]) => {
        const kn_mid  = +key + SPD_STEP / 2;
        const avg_lph = v.lph_sum / v.n;
        const avg_lnm = avg_lph / kn_mid;
        return {
          speed_min: +key,
          speed_max: +key + SPD_STEP,
          speed_mid: kn_mid,
          avg_lph:   Math.round(avg_lph * 10) / 10,
          avg_lnm:   Math.round(avg_lnm * 100) / 100,
          samples:   v.n,
        };
      })
      .sort((a, b) => a.speed_min - b.speed_min);

    // Optimalt RPM: lavest L/nm ved fart ≥ 3 kn og ≥ 5 målinger
    const validRpm = rpm_buckets.filter(b => b.avg_lnm != null && b.avg_kn >= 3 && b.samples >= 5);
    const optimal_rpm = validRpm.length
      ? validRpm.reduce((best, b) => b.avg_lnm < best.avg_lnm ? b : best)
      : null;

    const validSpd = speed_buckets.filter(b => b.samples >= 5);
    const optimal_speed = validSpd.length
      ? validSpd.reduce((best, b) => b.avg_lnm < best.avg_lnm ? b : best)
      : null;

    res.json({ from, to, sample_count: points.length, rpm_buckets, speed_buckets, optimal_rpm, optimal_speed });
  } catch (err) {
    console.error('[efficiency]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
