'use strict';

const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { logEntry } = require('./changelog');

const uploadsPath = path.resolve(process.env.UPLOADS_PATH || './uploads');

// Multer: lagre filer med UUID-navn
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, randomUUID() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp','application/pdf',
                     'image/heic','image/heif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// GET /api/docs
router.get('/', (req, res) => {
  const { category, subcategory, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT * FROM documents WHERE 1=1';
  const params = {};
  if (category)    { sql += ' AND category = @category';       params.category    = category; }
  if (subcategory) { sql += ' AND subcategory = @subcategory'; params.subcategory = subcategory; }
  sql += ' ORDER BY created_at DESC LIMIT @limit OFFSET @offset';
  params.limit = parseInt(limit); params.offset = parseInt(offset);
  const rows = db.prepare(sql).all(params);
  // Parse JSON fields
  rows.forEach(r => {
    if (r.tags)      try { r.tags      = JSON.parse(r.tags);      } catch {}
    if (r.extracted) try { r.extracted = JSON.parse(r.extracted); } catch {}
  });
  res.json({ data: rows });
});

// GET /api/docs/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.tags)      try { row.tags      = JSON.parse(row.tags);      } catch {}
  if (row.extracted) try { row.extracted = JSON.parse(row.extracted); } catch {}
  res.json(row);
});

// POST /api/docs — last opp dokument med fil
router.post('/', upload.single('file'), (req, res) => {
  const {
    category, subcategory, title, description,
    tags, doc_date, amount, currency, vendor,
  } = req.body;

  if (!category || !title) {
    return res.status(400).json({ error: 'category og title er påkrevd' });
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO documents
      (id, category, subcategory, title, description, filename, original_name,
       mime_type, file_size, tags, doc_date, amount, currency, vendor, created_at, updated_at)
    VALUES
      (@id, @category, @subcategory, @title, @description, @filename, @original_name,
       @mime_type, @file_size, @tags, @doc_date, @amount, @currency, @vendor, @now, @now)
  `).run({
    id, category, subcategory: subcategory || null,
    title, description: description || null,
    filename:      req.file ? req.file.filename : null,
    original_name: req.file ? req.file.originalname : null,
    mime_type:     req.file ? req.file.mimetype : null,
    file_size:     req.file ? req.file.size : null,
    tags:     tags     ? (typeof tags === 'string' ? tags : JSON.stringify(tags)) : null,
    doc_date: doc_date || null,
    amount:   amount   ? parseFloat(amount) : null,
    currency: currency || 'NOK',
    vendor:   vendor   || null,
    now,
  });

  res.status(201).json({ id });

  // Auto-changelog: logg nye utstyrsdokumenter og kvitteringer automatisk
  try {
    const autoTypes = { equipment:'hardware', receipt:'hardware', engine:'hardware', electrical:'hardware', safety:'hardware' };
    const clType = autoTypes[category] || 'feat';
    if (autoTypes[category]) {
      logEntry({
        type:        clType,
        title:       vendor ? `${vendor}: ${title}` : title,
        description: description || (amount ? `Kost: ${Math.round(amount).toLocaleString('no')} kr` : null),
        source:      'scanner',
        auto:        1,
      });
    }
  } catch {}
});

// PATCH /api/docs/:id — oppdater metadata (ikke fil)
router.patch('/:id', (req, res) => {
  const { title, description, category, subcategory, tags, doc_date, amount, vendor, extracted } = req.body;
  const now = new Date().toISOString();

  const result = db.prepare(`
    UPDATE documents SET
      title       = COALESCE(@title,       title),
      description = COALESCE(@description, description),
      category    = COALESCE(@category,    category),
      subcategory = COALESCE(@subcategory, subcategory),
      tags        = COALESCE(@tags,        tags),
      doc_date    = COALESCE(@doc_date,    doc_date),
      amount      = COALESCE(@amount,      amount),
      vendor      = COALESCE(@vendor,      vendor),
      extracted   = COALESCE(@extracted,   extracted),
      updated_at  = @now
    WHERE id = @id
  `).run({
    id: req.params.id, title, description, category, subcategory,
    tags: tags ? JSON.stringify(tags) : null,
    doc_date, amount: amount ? parseFloat(amount) : null,
    vendor,
    extracted: extracted ? JSON.stringify(extracted) : null,
    now,
  });

  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// DELETE /api/docs/:id — slett dokument og fil
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT filename FROM documents WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  // Slett fil fra disk
  if (row.filename) {
    const filePath = path.join(uploadsPath, row.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
