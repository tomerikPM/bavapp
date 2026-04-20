'use strict';
// routes/changelog.js — Persistent changelog med auto-logging fra skanner/deler/kostnader

const express = require('express');
const router  = express.Router();
const { randomUUID } = require('crypto');
const db = require('../db');

// ── Hjelper: logg en entry (brukes av andre routes) ──────────────────────────
function logEntry({ date, version = null, type = 'feat', title, description = null, source = 'manual', auto = 0 }) {
  const id  = randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO changelog (id, date, version, type, title, description, source, auto, created_at)
      VALUES (@id, @date, @version, @type, @title, @description, @source, @auto, @now)
    `).run({ id, date: date || now.slice(0, 10), version, type, title, description, source, auto, now });
    return id;
  } catch (e) {
    console.warn('[changelog] Feil ved logging:', e.message);
    return null;
  }
}
module.exports.logEntry = logEntry;

// ── GET /api/changelog — hent alle entries ───────────────────────────────────
router.get('/', (req, res) => {
  const { limit = 200, type } = req.query;
  let sql = 'SELECT * FROM changelog WHERE 1=1';
  const params = { limit: parseInt(limit) };
  if (type) { sql += ' AND type = @type'; params.type = type; }
  sql += ' ORDER BY date DESC, created_at DESC LIMIT @limit';
  res.json({ data: db.prepare(sql).all(params) });
});

// ── POST /api/changelog — legg til manuell entry ─────────────────────────────
router.post('/', (req, res) => {
  const { date, version, type, title, description, source } = req.body;
  if (!title) return res.status(400).json({ error: 'title er påkrevd' });
  const id = logEntry({ date, version, type: type || 'feat', title, description, source: source || 'manual', auto: 0 });
  res.status(201).json({ id });
});

// ── DELETE /api/changelog/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM changelog WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
module.exports.logEntry = logEntry;
