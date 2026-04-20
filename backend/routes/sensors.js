'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/batch', (req, res) => {
  const { readings } = req.body;
  if (!Array.isArray(readings) || readings.length === 0)
    return res.status(400).json({ error: 'readings array er påkrevd' });
  const insert = db.prepare('INSERT INTO sensor_history (ts, path, value, unit) VALUES (@ts, @path, @value, @unit)');
  const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(r); });
  const ts = new Date().toISOString();
  insertMany(readings.map(r => ({ ts: r.ts||ts, path: r.path, value: Number(r.value), unit: r.unit||null })));
  res.status(201).json({ ok: true, count: readings.length });
});
router.get('/latest', (req, res) => {
  const rows = db.prepare('SELECT path, value, unit, ts FROM sensor_history WHERE id IN (SELECT MAX(id) FROM sensor_history GROUP BY path) ORDER BY path').all();
  const result = {};
  for (const r of rows) result[r.path] = { value: r.value, unit: r.unit, ts: r.ts };
  res.json(result);
});
router.get('/:encodedPath/history', (req, res) => {
  const path = decodeURIComponent(req.params.encodedPath);
  const { from, to, limit = 500 } = req.query;
  let sql = 'SELECT ts, value FROM sensor_history WHERE path = @path';
  const params = { path };
  if (from) { sql += ' AND ts >= @from'; params.from = from; }
  if (to)   { sql += ' AND ts <= @to';   params.to   = to; }
  sql += ' ORDER BY ts DESC LIMIT @limit';
  params.limit = parseInt(limit);
  res.json({ path, data: db.prepare(sql).all(params) });
});
module.exports = router;
