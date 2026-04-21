'use strict';
// routes/vessel.js — CRUD for vessel_items + vessel_connections
// og diagram-eksport i React Flow-format.

const express = require('express');
const db      = require('../db');
const router  = express.Router();

function nowIso() { return new Date().toISOString(); }

function serializeItem(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.diagram_data) {
    try { out.diagram_data = JSON.parse(out.diagram_data); } catch {}
  }
  return out;
}
function serializeConn(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.edge_data) {
    try { out.edge_data = JSON.parse(out.edge_data); } catch {}
  }
  return out;
}

// ── vessel_items ─────────────────────────────────────────────────────────────

// GET /api/vessel/items — alle eller filtrert på ?category=...
router.get('/items', (req, res) => {
  const { category, inDiagram } = req.query;
  let sql = 'SELECT * FROM vessel_items';
  const args = {};
  const where = [];
  if (category)  { where.push('category = @category'); args.category = category; }
  if (inDiagram) { where.push("diagram_data LIKE '%\"" + String(inDiagram).replace(/'/g,"") + "\"%'"); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY category, sort_order, id';
  const rows = db.prepare(sql).all(args);
  res.json({ data: rows.map(serializeItem), count: rows.length });
});

// GET /api/vessel/items/:id
router.get('/items/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM vessel_items WHERE id = ?').get(+req.params.id);
  if (!row) return res.status(404).json({ error: 'Finnes ikke' });
  res.json(serializeItem(row));
});

// POST /api/vessel/items
router.post('/items', (req, res) => {
  const b = req.body || {};
  if (!b.category || !b.label) return res.status(400).json({ error: 'category + label påkrevd' });

  // Auto-slug hvis man vil ha diagram-kobling men ikke har spesifisert slug
  let slug = b.slug ? String(b.slug).trim() : null;
  if (slug === '') slug = null;

  // Neste sort_order innen kategorien
  const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM vessel_items WHERE category = ?').get(b.category)?.m ?? 0;

  const info = db.prepare(`
    INSERT INTO vessel_items
      (slug, category, label, value, notes, model, vendor, serial_number, install_date,
       status, mono, sort_order, diagram_data)
    VALUES
      (@slug, @category, @label, @value, @notes, @model, @vendor, @serial_number, @install_date,
       @status, @mono, @sort_order, @diagram_data)
  `).run({
    slug,
    category:      b.category,
    label:         b.label,
    value:         b.value || null,
    notes:         b.notes || null,
    model:         b.model || null,
    vendor:        b.vendor || null,
    serial_number: b.serial_number || null,
    install_date:  b.install_date || null,
    status:        b.status || 'installed',
    mono:          b.mono ? 1 : 0,
    sort_order:    maxSort + 10,
    diagram_data:  b.diagram_data ? JSON.stringify(b.diagram_data) : null,
  });
  res.status(201).json(serializeItem(db.prepare('SELECT * FROM vessel_items WHERE id = ?').get(info.lastInsertRowid)));
});

// PUT /api/vessel/items/:id
router.put('/items/:id', (req, res) => {
  const id = +req.params.id;
  const existing = db.prepare('SELECT * FROM vessel_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Finnes ikke' });

  const patch = {};
  for (const k of ['slug', 'category', 'label', 'value', 'notes', 'model', 'vendor',
                   'serial_number', 'install_date', 'status', 'sort_order']) {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  }
  if (req.body.mono !== undefined) patch.mono = req.body.mono ? 1 : 0;
  if (req.body.diagram_data !== undefined) {
    patch.diagram_data = req.body.diagram_data ? JSON.stringify(req.body.diagram_data) : null;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Ingen felter å oppdatere' });

  const sets = Object.keys(patch).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE vessel_items SET ${sets}, updated_at = @updated_at WHERE id = @id`).run({
    ...patch, id, updated_at: nowIso(),
  });
  res.json(serializeItem(db.prepare('SELECT * FROM vessel_items WHERE id = ?').get(id)));
});

// DELETE /api/vessel/items/:id
router.delete('/items/:id', (req, res) => {
  const id = +req.params.id;
  const existing = db.prepare('SELECT * FROM vessel_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Finnes ikke' });

  // Rydd bort koblinger som refererer til slug-en
  if (existing.slug) {
    db.prepare('DELETE FROM vessel_connections WHERE from_slug = ? OR to_slug = ?').run(existing.slug, existing.slug);
  }
  db.prepare('DELETE FROM vessel_items WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ── vessel_connections ───────────────────────────────────────────────────────

router.get('/connections', (req, res) => {
  const { diagram } = req.query;
  let sql = 'SELECT * FROM vessel_connections';
  const args = {};
  if (diagram) { sql += ' WHERE diagram = @diagram'; args.diagram = diagram; }
  sql += ' ORDER BY sort_order, id';
  const rows = db.prepare(sql).all(args);
  res.json({ data: rows.map(serializeConn), count: rows.length });
});

router.post('/connections', (req, res) => {
  const b = req.body || {};
  if (!b.diagram || !b.from_slug || !b.to_slug) {
    return res.status(400).json({ error: 'diagram + from_slug + to_slug påkrevd' });
  }
  const info = db.prepare(`
    INSERT INTO vessel_connections (slug, diagram, from_slug, to_slug, edge_data, sort_order)
    VALUES (@slug, @diagram, @from_slug, @to_slug, @edge_data, @sort_order)
  `).run({
    slug:       b.slug || null,
    diagram:    b.diagram,
    from_slug:  b.from_slug,
    to_slug:    b.to_slug,
    edge_data:  b.edge_data ? JSON.stringify(b.edge_data) : null,
    sort_order: b.sort_order ?? 999,
  });
  res.status(201).json(serializeConn(db.prepare('SELECT * FROM vessel_connections WHERE id = ?').get(info.lastInsertRowid)));
});

router.delete('/connections/:id', (req, res) => {
  const id = +req.params.id;
  const existing = db.prepare('SELECT * FROM vessel_connections WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Finnes ikke' });
  db.prepare('DELETE FROM vessel_connections WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ── Diagram-eksport i React Flow-format ─────────────────────────────────────
//
// GET /api/vessel/diagram/:type   (type = 'electrical' | 'nmea')
// Returnerer { nodes, edges } klart for <ReactFlow/>.
router.get('/diagram/:type', (req, res) => {
  const type = req.params.type;
  if (!['electrical', 'nmea'].includes(type)) return res.status(400).json({ error: 'Ugyldig diagram-type' });

  // Hent alle items med diagram_data som inkluderer denne typen
  const itemRows = db.prepare('SELECT * FROM vessel_items WHERE diagram_data IS NOT NULL').all();
  const nodes = [];
  for (const row of itemRows) {
    if (!row.slug) continue;
    let diag;
    try { diag = JSON.parse(row.diagram_data); } catch { continue; }
    if (!Array.isArray(diag.diagrams) || !diag.diagrams.includes(type)) continue;
    nodes.push({
      id:       row.slug,
      type:     'bavNode',
      position: { x: diag.x ?? 0, y: diag.y ?? 0 },
      data: {
        nodeType: diag.nodeType || 'consumer',
        label:    row.label,
        sub:      diag.sub || row.value || '',
        badge:    diag.badge || (row.status === 'planned' ? 'planned' : 'installed'),
      },
    });
  }

  // Edges
  const edgeRows = db.prepare('SELECT * FROM vessel_connections WHERE diagram = ? ORDER BY sort_order, id').all(type);
  const edges = edgeRows.map(row => {
    let data = {};
    try { data = row.edge_data ? JSON.parse(row.edge_data) : {}; } catch {}
    return {
      id:       row.slug || `c${row.id}`,
      source:   row.from_slug,
      target:   row.to_slug,
      ...(data.label     !== undefined ? { label:    data.label }     : {}),
      ...(data.animated  !== undefined ? { animated: data.animated }  : {}),
      ...(data.style     !== undefined ? { style:    data.style }     : {}),
    };
  });

  res.json({ nodes, edges });
});

module.exports = router;
