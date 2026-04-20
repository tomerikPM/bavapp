'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { v4: uuid } = require('uuid');

// ── GET /api/costs ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { category, year, limit = 200 } = req.query;
  let sql = `
    SELECT c.*, t.name as trip_name
    FROM costs c
    LEFT JOIN trips t ON c.trip_id = t.id
    WHERE 1=1
  `;
  const params = [];
  if (category) { sql += ' AND c.category = ?'; params.push(category); }
  if (year)     { sql += " AND strftime('%Y', c.date) = ?"; params.push(String(year)); }
  sql += ' ORDER BY c.date DESC LIMIT ?';
  params.push(parseInt(limit));
  res.json({ data: db.prepare(sql).all(...params) });
});

// ── GET /api/costs/summary ────────────────────────────────────────────────
router.get('/summary', (req, res) => {
  const { year } = req.query;
  const yearFilter = year
    ? "AND strftime('%Y', date) = ?"
    : "AND strftime('%Y', date) = strftime('%Y', 'now')";
  const params = year ? [year] : [];

  const totals = db.prepare(`
    SELECT
      category,
      SUM(amount)  as total,
      COUNT(*)     as count,
      SUM(liters)  as total_liters
    FROM costs
    WHERE 1=1 ${yearFilter}
    GROUP BY category
    ORDER BY total DESC
  `).all(...params);

  const grandTotal = totals.reduce((s, r) => s + (r.total || 0), 0);

  // Kostnad per nm — henter total distanse for valgt sesong
  const nmRow = db.prepare(`
    SELECT SUM(distance_nm) as nm
    FROM trips
    WHERE end_ts IS NOT NULL
    ${year ? "AND strftime('%Y', start_ts) = ?" : "AND strftime('%Y', start_ts) = strftime('%Y', 'now')"}
  `).get(...params);

  const totalNm = nmRow?.nm || 0;

  // Siste 6 måneder gruppert per måned
  const monthly = db.prepare(`
    SELECT
      strftime('%Y-%m', date) as month,
      SUM(amount) as total,
      category
    FROM costs
    WHERE date >= date('now', '-6 months')
    GROUP BY month, category
    ORDER BY month ASC
  `).all();

  res.json({ totals, grandTotal, totalNm, costPerNm: totalNm > 0 ? grandTotal / totalNm : null, monthly });
});

// ── GET /api/costs/:id ────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM costs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Ikke funnet' });
  res.json(row);
});

// ── POST /api/costs ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const {
    date, category, description, amount, currency = 'NOK',
    liters, price_per_liter, location, trip_id, notes,
  } = req.body;

  if (!date || !category || !description || amount == null)
    return res.status(400).json({ error: 'date, category, description og amount er påkrevd' });

  const id = uuid();
  db.prepare(`
    INSERT INTO costs
      (id, date, category, description, amount, currency,
       liters, price_per_liter, location, trip_id, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, date, category, description, parseFloat(amount), currency,
    liters ? parseFloat(liters) : null,
    price_per_liter ? parseFloat(price_per_liter) : null,
    location || null, trip_id || null, notes || null);

  res.status(201).json({ id });
});

// ── PUT /api/costs/:id ────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM costs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Ikke funnet' });

  const {
    date, category, description, amount, currency,
    liters, price_per_liter, location, trip_id, notes,
  } = req.body;

  db.prepare(`
    UPDATE costs SET
      date = ?, category = ?, description = ?, amount = ?, currency = ?,
      liters = ?, price_per_liter = ?, location = ?, trip_id = ?, notes = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
    WHERE id = ?
  `).run(date, category, description, parseFloat(amount), currency || 'NOK',
    liters ? parseFloat(liters) : null,
    price_per_liter ? parseFloat(price_per_liter) : null,
    location || null, trip_id || null, notes || null,
    req.params.id);

  res.json({ ok: true });
});

// ── DELETE /api/costs/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM costs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
