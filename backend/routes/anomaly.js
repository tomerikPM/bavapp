'use strict';
// routes/anomaly.js — statistisk anomalideteksjon på sensorhistorikk

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// Konfig: paths som overvåkes med normalområder og beskrivelser
const MONITORED = [
  {
    path:    'propulsion.0.coolantTemperature',
    label:   'Kjølevannstemperatur',
    unit:    '°C',
    scale:   v => Math.round((v - 273.15) * 10) / 10,
    normal:  [70, 95],
    warn:    [95, 102],
    crit:    [102, 999],
    engineOnly: true,
  },
  {
    path:    'propulsion.0.oilPressure',
    label:   'Oljetrykk',
    unit:    'bar',
    scale:   v => Math.round((v / 100000) * 100) / 100,
    normal:  [2.0, 5.5],
    warn:    [1.5, 2.0],
    crit:    [0, 1.5],
    engineOnly: true,
  },
  {
    path:    'propulsion.0.fuelRate',
    label:   'Drivstofforbruk',
    unit:    'L/h',
    scale:   v => Math.round(v * 3600000 * 10) / 10,
    normal:  [0, 70],
    engineOnly: true,
  },
  {
    path:    'electrical.batteries.0.capacity.stateOfCharge',
    label:   'Husbatteri SOC',
    unit:    '%',
    scale:   v => Math.round(v * 100),
    normal:  [20, 100],
    warn:    [10, 20],
    crit:    [0, 10],
    engineOnly: false,
  },
  {
    path:    'electrical.batteries.0.voltage',
    label:   'Husbatteri spenning',
    unit:    'V',
    scale:   v => Math.round(v * 100) / 100,
    normal:  [12.2, 14.8],
    warn:    [11.8, 12.2],
    crit:    [0, 11.8],
    engineOnly: false,
  },
];

// GET /api/anomaly/analyze
// Sammenligner siste 24t mot 30-dagers baseline per path
router.get('/analyze', (req, res) => {
  const results = [];
  const now     = new Date();
  const ago24h  = new Date(now - 24 * 3600_000).toISOString();
  const ago30d  = new Date(now - 30 * 24 * 3600_000).toISOString();
  const ago7d   = new Date(now -  7 * 24 * 3600_000).toISOString();

  for (const cfg of MONITORED) {
    try {
      // 30-dagers baseline
      const base = db.prepare(`
        SELECT AVG(value) as avg, COUNT(*) as n,
               MIN(value) as min_v, MAX(value) as max_v
        FROM sensor_history
        WHERE path = ? AND ts >= ? AND ts <= ?
      `).get(cfg.path, ago30d, ago24h);

      // Siste 24 timer
      const recent = db.prepare(`
        SELECT AVG(value) as avg, MIN(value) as min_v, MAX(value) as max_v, COUNT(*) as n
        FROM sensor_history
        WHERE path = ? AND ts >= ?
      `).get(cfg.path, ago24h);

      if (!base || !base.n || base.n < 10) continue;  // For lite data
      if (!recent || !recent.n || recent.n < 3) continue;

      const baseAvg   = cfg.scale(base.avg);
      const recentAvg = cfg.scale(recent.avg);
      const recentMin = cfg.scale(recent.min_v);
      const recentMax = cfg.scale(recent.max_v);

      // Beregn stddev over baseline
      const vals = db.prepare(`
        SELECT value FROM sensor_history
        WHERE path = ? AND ts >= ? AND ts <= ? LIMIT 2000
      `).all(cfg.path, ago30d, ago24h).map(r => cfg.scale(r.value));

      if (vals.length < 5) continue;

      const mean   = vals.reduce((a,b) => a+b, 0) / vals.length;
      const stddev = Math.sqrt(vals.reduce((s,v) => s + (v-mean)**2, 0) / vals.length);

      if (stddev < 0.01) continue;  // Konstant verdi

      const zScore = (recentAvg - mean) / stddev;
      const deviationPct = Math.abs((recentAvg - baseAvg) / Math.max(Math.abs(baseAvg), 0.001) * 100);

      // Kun flagg dersom z-score er vesentlig
      if (Math.abs(zScore) < 1.2 && deviationPct < 8) continue;

      // Bestem alvorlighet
      let severity = 'info';
      let message  = '';

      if (cfg.crit && (recentMin < cfg.crit[1] || recentMax > (cfg.crit[0] > 0 ? cfg.crit[0] : Infinity))) {
        severity = 'critical';
      } else if (cfg.warn && (recentAvg < cfg.warn[0] || recentAvg > cfg.warn[1])) {
        severity = 'warning';
      } else if (Math.abs(zScore) >= 2.5) {
        severity = 'warning';
      } else {
        severity = 'info';
      }

      const direction = recentAvg > baseAvg ? 'høyere' : 'lavere';
      message = `Siste 24t: ${recentAvg.toFixed(1)} ${cfg.unit} — ${deviationPct.toFixed(0)}% ${direction} enn 30-dagers snitt (${baseAvg.toFixed(1)} ${cfg.unit})`;

      results.push({
        path:          cfg.path,
        label:         cfg.label,
        unit:          cfg.unit,
        severity,
        zScore:        Math.round(zScore * 10) / 10,
        baselineAvg:   baseAvg,
        recentAvg,
        recentMin,
        recentMax,
        deviationPct:  Math.round(deviationPct),
        direction,
        message,
        sampleCount:   { baseline: base.n, recent: recent.n },
      });
    } catch {}
  }

  // Sorter: critical → warning → info
  const order = { critical: 0, warning: 1, info: 2 };
  results.sort((a, b) => order[a.severity] - order[b.severity]);

  // Siste 7 dagers tidsserie for frontend-charts
  const trends = {};
  for (const cfg of MONITORED) {
    try {
      const rows = db.prepare(`
        SELECT
          strftime('%Y-%m-%dT%H:00:00Z', ts) as hour,
          AVG(value) as avg_val
        FROM sensor_history
        WHERE path = ? AND ts >= ?
        GROUP BY hour
        ORDER BY hour ASC
        LIMIT 200
      `).all(cfg.path, ago7d);

      if (rows.length >= 2) {
        trends[cfg.path] = rows.map(r => ({
          t: r.hour,
          v: Math.round(cfg.scale(r.avg_val) * 10) / 10,
        }));
      }
    } catch {}
  }

  res.json({ anomalies: results, trends, analyzed_at: now.toISOString() });
});

// GET /api/anomaly/engine-health
// Per-sesjon motorhelsedata for trendvisning
router.get('/engine-health', (req, res) => {
  try {
    const trips = db.prepare(`
      SELECT id, name, start_ts, end_ts, distance_nm, engine_hours
      FROM trips
      WHERE end_ts IS NOT NULL
      ORDER BY start_ts DESC
      LIMIT 30
    `).all();

    const enginePaths = [
      { path: 'propulsion.0.coolantTemperature', label: 'Kjølevann', unit: '°C', scale: v => Math.round((v-273.15)*10)/10 },
      { path: 'propulsion.0.oilPressure',        label: 'Oljetrykk', unit: 'bar', scale: v => Math.round((v/100000)*100)/100 },
      { path: 'propulsion.0.fuelRate',           label: 'Forbruk',   unit: 'L/h', scale: v => Math.round(v*3600000*10)/10 },
      { path: 'propulsion.0.revolutions',        label: 'RPM',       unit: 'rpm', scale: v => Math.round(v*60) },
    ];

    const sessions = trips.map(t => {
      const stats = {};
      for (const p of enginePaths) {
        const row = db.prepare(`
          SELECT AVG(value) as avg, MAX(value) as max_v, MIN(value) as min_v
          FROM sensor_history
          WHERE path = ? AND ts >= ? AND ts <= ? AND value > 0
        `).get(p.path, t.start_ts, t.end_ts || new Date().toISOString());

        if (row && row.avg != null) {
          stats[p.path] = {
            label: p.label,
            unit:  p.unit,
            avg:   p.scale(row.avg),
            max:   p.scale(row.max_v),
            min:   p.scale(row.min_v),
          };
        }
      }
      return {
        id:           t.id,
        name:         t.name,
        date:         t.start_ts.slice(0, 10),
        distance_nm:  t.distance_nm,
        engine_hours: t.engine_hours,
        stats,
      };
    }).filter(s => Object.keys(s.stats).length > 0);

    res.json({ sessions, paths: enginePaths.map(p => ({ path: p.path, label: p.label, unit: p.unit })) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
