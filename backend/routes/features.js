'use strict';
// routes/features.js — CRUD for features, auto-changelog og versjonsbump når en
// feature markeres som "done".

const express = require('express');
const db      = require('../db');
const router  = express.Router();

const { randomUUID } = require('crypto');

// ── Versjonslogikk ──────────────────────────────────────────────────────────
// Finner høyeste "vX.Y" i changelog-tabellen og bumper Y med 1.
// NB: SQL ORDER BY på TEXT sorterer lexicographically (v0.9 > v0.10), så vi
// henter alle versjoner og sammenligner numerisk i JS.
function bumpVersion() {
  const rows = db.prepare(`
    SELECT DISTINCT version FROM changelog
    WHERE version IS NOT NULL AND version != ''
  `).all();

  let maxMajor = 0, maxMinor = 0;
  for (const { version } of rows) {
    const m = /^v?(\d+)\.(\d+)$/.exec(version);
    if (!m) continue;
    const major = parseInt(m[1], 10);
    const minor = parseInt(m[2], 10);
    if (major > maxMajor || (major === maxMajor && minor > maxMinor)) {
      maxMajor = major;
      maxMinor = minor;
    }
  }
  return `v${maxMajor}.${maxMinor + 1}`;
}

function nowIso() { return new Date().toISOString(); }

function touch(id) {
  db.prepare(`UPDATE features SET updated_at = ? WHERE id = ?`).run(nowIso(), id);
}

// ── CRUD-endepunkter ────────────────────────────────────────────────────────

// GET /api/features — alle features, sortert etter status + prioritet + sort_order
router.get('/', (req, res) => {
  const status = req.query.status;  // optional filter
  const where  = status ? `WHERE status = ?` : '';
  const args   = status ? [status] : [];
  const rows   = db.prepare(`
    SELECT * FROM features
    ${where}
    ORDER BY
      CASE status WHEN 'in_progress' THEN 0 WHEN 'planned' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
      priority DESC,
      sort_order ASC,
      id ASC
  `).all(...args);
  res.json({ data: rows, count: rows.length });
});

// POST /api/features — opprett ny
router.post('/', (req, res) => {
  const { title, description, priority, status, sort_order } = req.body || {};
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title er påkrevd' });
  }
  const pri = clampPriority(priority);
  const st  = validStatus(status) ? status : 'planned';
  const so  = Number.isFinite(+sort_order) ? +sort_order : 0;

  const info = db.prepare(`
    INSERT INTO features (title, description, priority, status, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(title.trim(), (description || '').trim(), pri, st, so);

  const row = db.prepare(`SELECT * FROM features WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(row);
});

// PUT /api/features/:id — oppdater generelle felt (ikke status → bruk /complete)
router.put('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = db.prepare(`SELECT * FROM features WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Finnes ikke' });
  if (existing.status === 'done') return res.status(400).json({ error: 'Implementerte features er read-only' });

  const patch = {};
  for (const k of ['title', 'description', 'sort_order']) {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  }
  if (req.body.priority !== undefined) patch.priority = clampPriority(req.body.priority);
  if (req.body.status   !== undefined && validStatus(req.body.status) && req.body.status !== 'done') {
    patch.status = req.body.status;
  }

  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Ingen gyldige felter å oppdatere' });

  const sets  = Object.keys(patch).map(k => `${k} = @${k}`).join(', ');
  const stmt  = db.prepare(`UPDATE features SET ${sets}, updated_at = @updated_at WHERE id = @id`);
  stmt.run({ ...patch, id, updated_at: nowIso() });

  const row = db.prepare(`SELECT * FROM features WHERE id = ?`).get(id);
  res.json(row);
});

// PATCH /api/features/:id/priority — hurtigendring av prioritet
router.patch('/:id/priority', (req, res) => {
  const id = +req.params.id;
  const existing = db.prepare(`SELECT * FROM features WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Finnes ikke' });
  if (existing.status === 'done') return res.status(400).json({ error: 'Implementerte features er read-only' });

  const pri = clampPriority(req.body?.priority);
  db.prepare(`UPDATE features SET priority = ?, updated_at = ? WHERE id = ?`).run(pri, nowIso(), id);
  res.json(db.prepare(`SELECT * FROM features WHERE id = ?`).get(id));
});

// DELETE /api/features/:id
router.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = db.prepare(`SELECT * FROM features WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Finnes ikke' });
  if (existing.status === 'done') return res.status(400).json({ error: 'Implementerte features kan ikke slettes' });

  db.prepare(`DELETE FROM features WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// POST /api/features/:id/complete — marker som implementert:
//   1. status = 'done', completed_at = now
//   2. bump versjon
//   3. opprett changelog-entry (source='feature', auto=1)
router.post('/:id/complete', (req, res) => {
  const id  = +req.params.id;
  const f   = db.prepare(`SELECT * FROM features WHERE id = ?`).get(id);
  if (!f) return res.status(404).json({ error: 'Finnes ikke' });
  if (f.status === 'done') return res.status(400).json({ error: 'Allerede implementert' });

  const version = bumpVersion();
  const ts      = nowIso();
  const date    = ts.slice(0, 10);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE features
      SET status = 'done', completed_at = ?, completed_version = ?, updated_at = ?
      WHERE id = ?
    `).run(ts, version, ts, id);

    db.prepare(`
      INSERT INTO changelog (id, date, version, type, title, description, source, auto)
      VALUES (?, ?, ?, 'feat', ?, ?, 'feature', 1)
    `).run(randomUUID(), date, version, f.title, f.description || '');
  });
  tx();

  const updated = db.prepare(`SELECT * FROM features WHERE id = ?`).get(id);
  res.json({ feature: updated, version });
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function clampPriority(p) {
  const n = Math.round(+p);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(3, n));
}
function validStatus(s) {
  return ['planned', 'in_progress', 'done', 'dropped'].includes(s);
}

module.exports = router;
