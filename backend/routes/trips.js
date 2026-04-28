'use strict';
const express = require('express');
const router  = express.Router();
const { randomUUID } = require('crypto');
const db = require('../db');

// Trapesintegrasjon av propulsion.port.fuel.rate (m³/s) over et intervall → liter
function computeFuelLiters(from, to) {
  const rows = db.prepare(
    `SELECT ts, value FROM sensor_history
     WHERE path = 'propulsion.port.fuel.rate' AND ts >= @from AND ts <= @to
     ORDER BY ts`
  ).all({ from, to });
  let total = 0;
  for (let i = 1; i < rows.length; i++) {
    const dtH   = (new Date(rows[i].ts) - new Date(rows[i - 1].ts)) / 3600000;
    const avgMS = (rows[i].value + rows[i - 1].value) / 2;
    total += avgMS * 3600000 * dtH;
  }
  return total > 0 ? +total.toFixed(1) : null;
}

// ── Liste over turer ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { limit = 20, offset = 0, compute_fuel } = req.query;
  const rows = db.prepare(
    `SELECT id,name,start_ts,end_ts,start_lat,start_lon,
            distance_nm,max_speed_kn,avg_speed_kn,
            engine_hours,fuel_used_l,persons,notes
     FROM trips ORDER BY start_ts DESC LIMIT @limit OFFSET @offset`
  ).all({ limit: parseInt(limit), offset: parseInt(offset) });

  // Fyll inn beregnet drivstoff fra sensor-historikk når feltet ikke er logget manuelt
  if (compute_fuel === '1') {
    for (const row of rows) {
      if (row.fuel_used_l != null || !row.start_ts) continue;
      row.fuel_used_l_calc = computeFuelLiters(row.start_ts, row.end_ts || new Date().toISOString());
    }
  }
  res.json({ data: rows });
});

// ── Aggregerte stats for én tur (fra sensor_history) ─────────────────────────
router.get('/:id/stats', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Not found' });
  if (!trip.start_ts) return res.json({ stats: {}, total_fuel_l: null });

  const end = trip.end_ts || new Date().toISOString();

  // Aggreger maks/snitt per path
  const AGG_PATHS = [
    'propulsion.port.revolutions',
    'propulsion.port.temperature',
    'propulsion.port.oilPressure',
    'propulsion.port.oilTemperature',
    'propulsion.port.engineLoad',
    'propulsion.port.fuel.rate',
    'propulsion.port.boostPressure',
    'electrical.batteries.279.capacity.stateOfCharge',
    'navigation.speedOverGround',
  ];

  const aggStmt = db.prepare(
    `SELECT MIN(value) as min, MAX(value) as max, AVG(value) as avg, COUNT(*) as n
     FROM sensor_history WHERE path = @path AND ts >= @from AND ts <= @to`
  );

  const stats = {};
  for (const path of AGG_PATHS) {
    const row = aggStmt.get({ path, from: trip.start_ts, to: end });
    if (row && row.n > 0) stats[path] = row;
  }

  // Beregn totalt dieselforbruk ved trapesintegrasjon av fuelRate (m³/s → L)
  const fuelRows = db.prepare(
    `SELECT ts, value FROM sensor_history
     WHERE path = 'propulsion.port.fuel.rate' AND ts >= @from AND ts <= @to
     ORDER BY ts`
  ).all({ from: trip.start_ts, to: end });

  let totalFuelL = 0;
  for (let i = 1; i < fuelRows.length; i++) {
    const dtH  = (new Date(fuelRows[i].ts) - new Date(fuelRows[i - 1].ts)) / 3600000;
    const avgMS = (fuelRows[i].value + fuelRows[i - 1].value) / 2;  // m³/s
    totalFuelL += avgMS * 3600000 * dtH;                             // → liter
  }

  res.json({
    trip_id:      req.params.id,
    from:         trip.start_ts,
    to:           end,
    stats,
    total_fuel_l: totalFuelL > 0 ? +(totalFuelL.toFixed(1)) : null,
  });
});

// ── Tidsseriedata for én tur ──────────────────────────────────────────────────
router.get('/:id/sensors/:encodedPath', (req, res) => {
  const trip = db.prepare('SELECT start_ts, end_ts FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Not found' });
  const path = decodeURIComponent(req.params.encodedPath);
  const end  = trip.end_ts || new Date().toISOString();
  const rows = db.prepare(
    `SELECT ts, value FROM sensor_history
     WHERE path = @path AND ts >= @from AND ts <= @to
     ORDER BY ts ASC LIMIT 500`
  ).all({ path, from: trip.start_ts, to: end });
  res.json({ path, data: rows });
});

// ── Enkelt tur ────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.track) try { row.track = JSON.parse(row.track); } catch {}
  res.json(row);
});

// ── Opprett tur manuelt ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, start_ts, end_ts, start_lat, start_lon, end_lat, end_lon,
          distance_nm, max_speed_kn, avg_speed_kn, engine_hours, fuel_used_l,
          persons, notes, track } = req.body;
  if (!start_ts) return res.status(400).json({ error: 'start_ts er påkrevd' });
  const id = randomUUID();
  db.prepare(
    `INSERT INTO trips (id,name,start_ts,end_ts,start_lat,start_lon,end_lat,end_lon,
                        distance_nm,max_speed_kn,avg_speed_kn,engine_hours,fuel_used_l,
                        persons,notes,track)
     VALUES (@id,@name,@start_ts,@end_ts,@slat,@slon,@elat,@elon,
             @dist,@maxspd,@avgspd,@engh,@fuel,@persons,@notes,@track)`
  ).run({
    id, name: name||null, start_ts, end_ts: end_ts||null,
    slat: start_lat||null, slon: start_lon||null,
    elat: end_lat||null,   elon: end_lon||null,
    dist: distance_nm||null, maxspd: max_speed_kn||null, avgspd: avg_speed_kn||null,
    engh: engine_hours||null, fuel: fuel_used_l||null,
    persons: persons||null, notes: notes||null,
    track: track ? JSON.stringify(track) : null,
  });
  res.status(201).json({ id });
});

// ── Oppdater tur ──────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const { name, end_ts, distance_nm, max_speed_kn, avg_speed_kn,
          engine_hours, fuel_used_l, persons, notes } = req.body;
  const result = db.prepare(
    `UPDATE trips SET
       name=COALESCE(@name,name), end_ts=COALESCE(@end_ts,end_ts),
       distance_nm=COALESCE(@dist,distance_nm), max_speed_kn=COALESCE(@maxspd,max_speed_kn),
       avg_speed_kn=COALESCE(@avgspd,avg_speed_kn), engine_hours=COALESCE(@engh,engine_hours),
       fuel_used_l=COALESCE(@fuel,fuel_used_l), persons=COALESCE(@persons,persons),
       notes=COALESCE(@notes,notes)
     WHERE id = @id`
  ).run({ id: req.params.id, name, end_ts, dist: distance_nm, maxspd: max_speed_kn,
          avgspd: avg_speed_kn, engh: engine_hours, fuel: fuel_used_l, persons, notes });
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Slett tur ─────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM trips WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
