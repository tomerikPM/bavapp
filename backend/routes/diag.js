'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const os      = require('os');
const http    = require('http');

const VALID_TAGS = new Set(['alarm', 'clear', 'dip', 'trim', 'note']);

router.post('/event', (req, res) => {
  const { ts, tag, message, context } = req.body || {};
  if (!tag || !VALID_TAGS.has(tag)) return res.status(400).json({ error: 'tag må være alarm|clear|dip|trim|note' });
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message er påkrevd' });
  const row = {
    ts: ts || new Date().toISOString(),
    tag,
    message: message.slice(0, 500),
    context: context ? JSON.stringify(context).slice(0, 2000) : null,
  };
  const r = db.prepare('INSERT INTO diag_events (ts, tag, message, context) VALUES (@ts, @tag, @message, @context)').run(row);
  res.status(201).json({ ok: true, id: r.lastInsertRowid });
});

router.get('/events', (req, res) => {
  const { from, to, tag, limit = 200 } = req.query;
  let sql = 'SELECT id, ts, tag, message, context FROM diag_events WHERE 1=1';
  const params = {};
  if (from) { sql += ' AND ts >= @from'; params.from = from; }
  if (to)   { sql += ' AND ts <= @to';   params.to = to; }
  if (tag)  { sql += ' AND tag = @tag';  params.tag = tag; }
  sql += ' ORDER BY ts DESC LIMIT @limit';
  params.limit = Math.min(parseInt(limit) || 200, 1000);
  const rows = db.prepare(sql).all(params).map(r => ({
    ...r,
    context: r.context ? safeParse(r.context) : null,
  }));
  res.json({ events: rows });
});

router.delete('/events', (req, res) => {
  const { before } = req.query;
  if (before) {
    const r = db.prepare('DELETE FROM diag_events WHERE ts < @before').run({ before });
    return res.json({ ok: true, deleted: r.changes });
  }
  const r = db.prepare('DELETE FROM diag_events').run();
  res.json({ ok: true, deleted: r.changes });
});

router.get('/sysinfo', async (req, res) => {
  const skStart = Date.now();
  let skOk = false;
  let skMs = null;
  try {
    await new Promise((resolve, reject) => {
      const r = http.get('http://localhost:3000/signalk/v1/api/', { timeout: 2000 }, resp => {
        skOk = resp.statusCode < 400;
        skMs = Date.now() - skStart;
        resp.resume();
        resolve();
      });
      r.on('error', reject);
      r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    });
  } catch {}

  res.json({
    ts:       new Date().toISOString(),
    system:   {
      uptime:   os.uptime(),
      loadavg:  os.loadavg(),
      mem:      { free: os.freemem(), total: os.totalmem() },
      hostname: os.hostname(),
    },
    bavapp:   { uptime: process.uptime(), nodeVersion: process.version },
    signalK:  { ok: skOk, latencyMs: skMs },
  });
});

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

module.exports = router;
