'use strict';
// routes/photos.js — Bilder av tekniske installasjoner
//
// Lagrer filer under uploads/photos/, metadata i photos-tabellen.
// AI-analyse gjøres klient-side (Claude Vision) med API-nøkkel fra localStorage,
// og backend mottar bare resultatet. Samme mønster som scanner/docs.

const express = require('express');
const router  = express.Router();
const { randomUUID } = require('crypto');
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const db     = require('../db');
const heicConvert = require('heic-convert');

const uploadsPath = path.resolve(process.env.UPLOADS_PATH || './uploads');
const photosDir   = path.join(uploadsPath, 'photos');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

// Memory storage så vi kan konvertere HEIC før skriving til disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 },  // 25 MB
  fileFilter: (req, file, cb) => {
    const mimeOk = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.mimetype);
    const extOk  = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.originalname);
    // På non-iOS nettlesere kan HEIC ha tom mimetype ("application/octet-stream")
    // men riktig filnavn-suffiks. Godta begge veier.
    cb(null, mimeOk || extOk);
  },
});

// Konverter HEIC/HEIF til JPEG — nettlesere utenom Safari kan ikke vise HEIC,
// og Claude Vision godtar bare JPEG/PNG/GIF/WebP.
async function convertHeicIfNeeded(buffer, originalName, mime) {
  const looksLikeHeic = /^(image\/heic|image\/heif)$/.test(mime)
                     || /\.(heic|heif)$/i.test(originalName);
  if (!looksLikeHeic) return { buffer, mime, ext: path.extname(originalName).toLowerCase() || '.jpg' };

  const converted = await heicConvert({
    buffer,
    format:  'JPEG',
    quality: 0.85,
  });
  return { buffer: Buffer.from(converted), mime: 'image/jpeg', ext: '.jpg' };
}

function nowIso() { return new Date().toISOString(); }

// GET /api/photos — liste med valgfritt filter
router.get('/', (req, res) => {
  const { linkedTo, linkedLabel, limit = 200, offset = 0 } = req.query;
  let sql = 'SELECT * FROM photos WHERE 1=1';
  const args = {};
  if (linkedTo)    { sql += ' AND linked_to_type = @linkedTo';       args.linkedTo = linkedTo; }
  if (linkedLabel) { sql += ' AND linked_to_label = @linkedLabel';   args.linkedLabel = linkedLabel; }
  sql += ' ORDER BY created_at DESC LIMIT @limit OFFSET @offset';
  args.limit  = parseInt(limit, 10);
  args.offset = parseInt(offset, 10);

  const rows = db.prepare(sql).all(args);
  res.json({ data: rows, count: rows.length });
});

// GET /api/photos/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Finnes ikke' });
  res.json(row);
});

// POST /api/photos — last opp bilde (konverterer HEIC → JPEG automatisk)
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Ingen fil lastet opp' });

  const { title, description, linked_to_type, linked_to_id, linked_to_label } = req.body;

  try {
    // Konverter HEIC hvis nødvendig
    const { buffer, mime, ext } = await convertHeicIfNeeded(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // Skriv ut til disk med UUID-navn
    const filename = randomUUID() + ext;
    const filepath = path.join(photosDir, filename);
    fs.writeFileSync(filepath, buffer);

    const id = randomUUID();
    db.prepare(`
      INSERT INTO photos
        (id, filename, original_name, mime_type, file_size,
         title, description, linked_to_type, linked_to_id, linked_to_label, created_at, updated_at)
      VALUES
        (@id, @filename, @original_name, @mime_type, @file_size,
         @title, @description, @linked_to_type, @linked_to_id, @linked_to_label, @now, @now)
    `).run({
      id,
      filename,
      original_name:   req.file.originalname,
      mime_type:       mime,
      file_size:       buffer.length,
      title:           (title || '').trim() || null,
      description:     (description || '').trim() || null,
      linked_to_type:  linked_to_type  || null,
      linked_to_id:    linked_to_id    || null,
      linked_to_label: linked_to_label || null,
      now:             nowIso(),
    });

    const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
    res.status(201).json(row);
  } catch (e) {
    console.error('[photos] Opplasting feilet:', e);
    res.status(500).json({ error: 'Opplasting feilet: ' + e.message });
  }
});

// PUT /api/photos/:id — oppdater metadata (ikke selve filen)
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Finnes ikke' });

  const patch = {};
  for (const k of ['title', 'description', 'linked_to_type', 'linked_to_id', 'linked_to_label']) {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  }
  if (req.body.ai_analyzed_at !== undefined) patch.ai_analyzed_at = req.body.ai_analyzed_at;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Ingen felter å oppdatere' });

  const sets = Object.keys(patch).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE photos SET ${sets}, updated_at = @updated_at WHERE id = @id`).run({
    ...patch,
    id: req.params.id,
    updated_at: nowIso(),
  });

  res.json(db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id));
});

// DELETE /api/photos/:id — sletter både DB-rad og fil
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Finnes ikke' });

  try {
    const filePath = path.join(photosDir, row.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn('[photos] Kunne ikke slette fil:', e.message);
  }
  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
