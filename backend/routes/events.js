'use strict';

const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const db = require('../db');

// GET /api/events — hent hendelseslogg med filtrering og paginering
router.get('/', (req, res) => {
  const {
    limit = 50,
    offset = 0,
    category,
    type,
    severity,
    from,
    to,
    trip_id,
  } = req.query;

  let sql = 'SELECT * FROM events WHERE 1=1';
  const params = {};

  if (category) { sql += ' AND category = @category'; params.category = category; }
  if (type)     { sql += ' AND type = @type';         params.type = type; }
  if (severity) { sql += ' AND severity = @severity'; params.severity = severity; }
  if (from)     { sql += ' AND ts >= @from';          params.from = from; }
  if (to)       { sql += ' AND ts <= @to';            params.to = to; }
  if (trip_id)  { sql += ' AND trip_id = @trip_id';   params.trip_id = trip_id; }

  sql += ' ORDER BY ts DESC LIMIT @limit OFFSET @offset';
  params.limit  = parseInt(limit);
  params.offset = parseInt(offset);

  const rows = db.prepare(sql).all(params);
  const total = db.prepare('SELECT COUNT(*) as n FROM events WHERE 1=1').get().n;

  res.json({ data: rows, total, limit: params.limit, offset: params.offset });
});

// GET /api/events/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/events — ny hendelse (manuell eller fra Signal K poller)
router.post('/', (req, res) => {
  const { type = 'manual', category, title, body, source = 'user',
          value, unit, severity = 'info', trip_id, ts } = req.body;

  if (!category || !title) {
    return res.status(400).json({ error: 'category og title er påkrevd' });
  }

  const id = randomUUID();
  const timestamp = ts || new Date().toISOString();

  db.prepare(`
    INSERT INTO events (id, ts, type, category, title, body, source, value, unit, severity, trip_id)
    VALUES (@id, @ts, @type, @category, @title, @body, @source, @value, @unit, @severity, @trip_id)
  `).run({ id, ts: timestamp, type, category, title, body, source, value, unit, severity, trip_id });

  res.status(201).json({ id, ts: timestamp });
});

// PATCH /api/events/:id/ack — kvitter alarm
router.patch('/:id/ack', (req, res) => {
  const result = db.prepare(`
    UPDATE events SET ack = 1, ack_ts = @ts WHERE id = @id
  `).run({ id: req.params.id, ts: new Date().toISOString() });

  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// DELETE /api/events/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
