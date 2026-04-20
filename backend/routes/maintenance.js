'use strict';
const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const db = require('../db');

router.get('/', (req, res) => {
  const { status, priority, category } = req.query;
  let sql = 'SELECT * FROM maintenance WHERE 1=1';
  const params = {};
  if (status)   { sql += ' AND status = @status';     params.status   = status; }
  if (priority) { sql += ' AND priority = @priority'; params.priority = priority; }
  if (category) { sql += ' AND category = @category'; params.category = category; }
  // SQLite krever enkle anførselstegn i CASE-uttrykk
  sql += " ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, due_date ASC";
  res.json({ data: db.prepare(sql).all(params) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM maintenance WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { title, description, category, priority = 'medium',
          status = 'open', due_date, cost, currency, vendor, notes, part_id } = req.body;
  if (!title || !category) return res.status(400).json({ error: 'title og category er påkrevd' });
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO maintenance (id,title,description,category,priority,status,due_date,cost,currency,vendor,notes,part_id,created_at,updated_at) VALUES (@id,@title,@description,@category,@priority,@status,@due_date,@cost,@currency,@vendor,@notes,@part_id,@now,@now)')
    .run({ id, title, description: description||null, category, priority, status,
           due_date: due_date||null, cost: cost?parseFloat(cost):null,
           currency: currency||'NOK', vendor: vendor||null,
           notes: notes||null, part_id: part_id||null, now });
  db.prepare("INSERT INTO events (id,ts,type,category,title,source,severity) VALUES (@id,@ts,'manual','maintenance',@title,'user','info')")
    .run({ id: randomUUID(), ts: now, title: 'Ny oppgave: ' + title });
  res.status(201).json({ id });
});

router.put('/:id', (req, res) => {
  const { title, description, category, priority, status,
          due_date, done_date, cost, vendor, notes } = req.body;
  const now = new Date().toISOString();
  const result = db.prepare(`UPDATE maintenance SET
      title       = COALESCE(@title,       title),
      description = COALESCE(@description, description),
      category    = COALESCE(@category,    category),
      priority    = COALESCE(@priority,    priority),
      status      = COALESCE(@status,      status),
      due_date    = @due_date,
      done_date   = @done_date,
      cost        = @cost,
      vendor      = @vendor,
      notes       = @notes,
      updated_at  = @now
    WHERE id = @id`)
    .run({ id: req.params.id, title, description, category, priority, status,
           due_date: due_date||null, done_date: done_date||null,
           cost: cost ? parseFloat(cost) : null,
           vendor: vendor||null, notes: notes||null, now });
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM maintenance WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
