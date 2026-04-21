'use strict';
// routes/image.js — bilde-konvertering, primært HEIC → JPEG.
//
// Brukes av skanner-flyten som sender bildet videre til Claude Vision.
// Claude godtar kun JPEG/PNG/GIF/WebP — ikke HEIC. iPhone-bilder er HEIC.
// Endepunktet aksepterer hvilken som helst støttet bildefil og returnerer
// JPEG-base64 klar til Claude.

const express     = require('express');
const multer      = require('multer');
const heicConvert = require('heic-convert');
const router      = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 },  // 25 MB
});

// POST /api/image/convert  — multipart med "file"
// Returnerer { mime, base64, size, converted: bool }
router.post('/convert', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Ingen fil mottatt' });

  let buffer = req.file.buffer;
  let mime   = req.file.mimetype;
  let converted = false;

  const looksLikeHeic = /^image\/(heic|heif)$/.test(mime)
                     || /\.(heic|heif)$/i.test(req.file.originalname);

  try {
    if (looksLikeHeic) {
      buffer = Buffer.from(await heicConvert({ buffer, format: 'JPEG', quality: 0.85 }));
      mime   = 'image/jpeg';
      converted = true;
    }

    res.json({
      mime,
      base64:    buffer.toString('base64'),
      size:      buffer.length,
      converted,
      original_mime: req.file.mimetype,
      original_name: req.file.originalname,
    });
  } catch (e) {
    console.error('[image/convert] feilet:', e.message);
    res.status(500).json({ error: 'Konvertering feilet: ' + e.message });
  }
});

module.exports = router;
