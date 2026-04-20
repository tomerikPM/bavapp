'use strict';

const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const db = require('../db');
const { logEntry } = require('./changelog');

// GET /api/parts
router.get('/', (req, res) => {
  const { category, system, overdue } = req.query;
  let sql = 'SELECT * FROM parts WHERE 1=1';
  const params = {};
  if (category) { sql += ' AND category = @category'; params.category = category; }
  if (system)   { sql += ' AND system = @system';     params.system   = system; }
  if (overdue === '1') {
    // Forfalt: neste bytte er passert
    sql += ' AND (next_due_date IS NOT NULL AND next_due_date <= @today)';
    params.today = new Date().toISOString().slice(0, 10);
  }
  sql += ' ORDER BY category, name';
  res.json({ data: db.prepare(sql).all(params) });
});

// GET /api/parts/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/parts
router.post('/', (req, res) => {
  const {
    category, system, name, part_number, vendor, vendor_url, notes,
    last_replaced, last_replaced_hours, interval_months, interval_hours,
    quantity_stock = 0, quantity_min = 0,
  } = req.body;

  if (!category || !name) return res.status(400).json({ error: 'category og name er påkrevd' });

  const id = randomUUID();
  const now = new Date().toISOString();

  // Beregn neste bytte automatisk
  const next_due_date = calcNextDueDate(last_replaced, interval_months);
  const next_due_hours = calcNextDueHours(last_replaced_hours, interval_hours);

  db.prepare(`
    INSERT INTO parts
      (id, category, system, name, part_number, vendor, vendor_url, notes,
       last_replaced, last_replaced_hours, interval_months, interval_hours,
       next_due_date, next_due_hours, quantity_stock, quantity_min, created_at, updated_at)
    VALUES
      (@id, @category, @system, @name, @part_number, @vendor, @vendor_url, @notes,
       @last_replaced, @last_replaced_hours, @interval_months, @interval_hours,
       @next_due_date, @next_due_hours, @quantity_stock, @quantity_min, @now, @now)
  `).run({
    id, category, system: system || null, name, part_number: part_number || null,
    vendor: vendor || null, vendor_url: vendor_url || null, notes: notes || null,
    last_replaced: last_replaced || null, last_replaced_hours: last_replaced_hours || null,
    interval_months: interval_months || null, interval_hours: interval_hours || null,
    next_due_date, next_due_hours, quantity_stock, quantity_min, now,
  });

  res.status(201).json({ id });

  // Auto-changelog: logg ny del
  try {
    logEntry({
      type:   'hardware',
      title:  `Del registrert: ${name}`,
      description: [system, part_number, vendor].filter(Boolean).join(' · '),
      source: 'parts',
      auto:   1,
    });
  } catch {}
});

// PUT /api/parts/:id — full oppdatering
router.put('/:id', (req, res) => {
  const {
    category, system, name, part_number, vendor, vendor_url, notes,
    last_replaced, last_replaced_hours, interval_months, interval_hours,
    quantity_stock, quantity_min,
  } = req.body;

  const now = new Date().toISOString();
  const next_due_date  = calcNextDueDate(last_replaced, interval_months);
  const next_due_hours = calcNextDueHours(last_replaced_hours, interval_hours);

  const result = db.prepare(`
    UPDATE parts SET
      category = @category, system = @system, name = @name,
      part_number = @part_number, vendor = @vendor, vendor_url = @vendor_url,
      notes = @notes, last_replaced = @last_replaced,
      last_replaced_hours = @last_replaced_hours,
      interval_months = @interval_months, interval_hours = @interval_hours,
      next_due_date = @next_due_date, next_due_hours = @next_due_hours,
      quantity_stock = @quantity_stock, quantity_min = @quantity_min,
      updated_at = @now
    WHERE id = @id
  `).run({
    id: req.params.id, category, system: system || null, name,
    part_number: part_number || null, vendor: vendor || null,
    vendor_url: vendor_url || null, notes: notes || null,
    last_replaced: last_replaced || null,
    last_replaced_hours: last_replaced_hours || null,
    interval_months: interval_months || null,
    interval_hours: interval_hours || null,
    next_due_date, next_due_hours,
    quantity_stock: quantity_stock ?? 0,
    quantity_min: quantity_min ?? 0,
    now,
  });

  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// POST /api/parts/:id/replace — registrer bytte
router.post('/:id/replace', (req, res) => {
  const { date, hours, notes } = req.body;
  const row = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const replaced_date  = date  || new Date().toISOString().slice(0, 10);
  const replaced_hours = hours || null;
  const next_due_date  = calcNextDueDate(replaced_date, row.interval_months);
  const next_due_hours = calcNextDueHours(replaced_hours, row.interval_hours);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE parts SET
      last_replaced = @replaced_date,
      last_replaced_hours = @replaced_hours,
      next_due_date = @next_due_date,
      next_due_hours = @next_due_hours,
      updated_at = @now
    WHERE id = @id
  `).run({ id: req.params.id, replaced_date, replaced_hours, next_due_date, next_due_hours, now });

  // Logg hendelse
  const { randomUUID } = require('crypto');
  db.prepare(`
    INSERT INTO events (id, ts, type, category, title, body, source, severity)
    VALUES (@id, @ts, 'manual', 'maintenance', @title, @body, 'user', 'info')
  `).run({
    id: randomUUID(),
    ts: now,
    title: `Del byttet: ${row.name}`,
    body: notes || null,
  });

  res.json({ ok: true, next_due_date, next_due_hours });
});

// DELETE /api/parts/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM parts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────
function calcNextDueDate(lastDate, intervalMonths) {
  if (!lastDate || !intervalMonths) return null;
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + parseInt(intervalMonths));
  return d.toISOString().slice(0, 10);
}

function calcNextDueHours(lastHours, intervalHours) {
  if (lastHours == null || !intervalHours) return null;
  return parseFloat(lastHours) + parseFloat(intervalHours);
}

module.exports = router;
