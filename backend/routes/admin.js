'use strict';
// routes/admin.js — backup/restore av SQLite + uploads for Railway-migrering.
//
// Beskyttet av siteAuth (Basic Auth) i tillegg til disse sikringene:
//   • Restore krever ENABLE_ADMIN_RESTORE=1 i env (destruktiv operasjon)
//   • Backup bruker better-sqlite3 sin native backup() så WAL-innhold fanges trygt
//
// Flyt for Railway-migrering:
//   Lokalt:    curl -u bavapp:pass http://localhost:3001/api/admin/backup > backup.tar.gz
//   Railway:   curl -u bavapp:railway-pass -F "archive=@backup.tar.gz" \
//                   https://.../api/admin/restore

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const tar     = require('tar');
const multer  = require('multer');
const db      = require('../db');

const DB_PATH = path.resolve(process.env.DB_PATH || './data/bavaria32.db');
const UPLOADS = path.resolve(process.env.UPLOADS_PATH || './uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 500 * 1024 * 1024 },  // 500 MB
});

function rmSafe(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }

// GET /api/admin/backup — streamer tar.gz av DB + uploads
router.get('/backup', async (req, res) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bav-backup-'));
  try {
    // 1. SQLite-backup via native API (fanger pending WAL-skrivinger)
    const dbBackupPath = path.join(tmp, 'bavaria32.db');
    await db.backup(dbBackupPath);

    // 2. Kopier uploads hvis den finnes
    const uploadsStage = path.join(tmp, 'uploads');
    if (fs.existsSync(UPLOADS)) {
      fs.cpSync(UPLOADS, uploadsStage, { recursive: true });
    } else {
      fs.mkdirSync(uploadsStage, { recursive: true });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="bavapp-backup-${stamp}.tar.gz"`);

    const stream = tar.c({ gzip: true, cwd: tmp }, ['bavaria32.db', 'uploads']);
    stream.on('error', e => {
      console.error('[admin/backup] tar-feil:', e.message);
      if (!res.headersSent) res.status(500).json({ error: e.message });
    });
    stream.pipe(res);
    res.on('close',  () => rmSafe(tmp));
    res.on('finish', () => rmSafe(tmp));
  } catch (e) {
    rmSafe(tmp);
    console.error('[admin/backup] feilet:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/restore — tar imot tar.gz (field: "archive")
// Ekstraher til DB_PATH + UPLOADS. Process.exit etter 2 sek → Railway auto-restarter.
router.post('/restore', upload.single('archive'), async (req, res) => {
  if (process.env.ENABLE_ADMIN_RESTORE !== '1') {
    return res.status(403).json({
      error: 'Restore er deaktivert. Sett ENABLE_ADMIN_RESTORE=1 i Railway-variabler for å aktivere.',
    });
  }
  if (!req.file) return res.status(400).json({ error: 'Ingen fil mottatt (felt: "archive")' });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bav-restore-'));
  const archivePath = path.join(tmp, 'archive.tar.gz');
  fs.writeFileSync(archivePath, req.file.buffer);

  try {
    await tar.x({ file: archivePath, cwd: tmp });

    const newDb      = path.join(tmp, 'bavaria32.db');
    const newUploads = path.join(tmp, 'uploads');

    if (!fs.existsSync(newDb)) {
      throw new Error('bavaria32.db ikke funnet i arkivet');
    }

    // Sørg for at mål-mapper finnes
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.mkdirSync(UPLOADS, { recursive: true });

    // Kopier DB på plass (overskriver eksisterende)
    fs.copyFileSync(newDb, DB_PATH);

    // Kopier uploads (merge — overskriver duplikater, beholder eksisterende som ikke er i arkivet)
    let photoCount = 0;
    if (fs.existsSync(newUploads)) {
      fs.cpSync(newUploads, UPLOADS, { recursive: true, force: true });
      photoCount = countFiles(newUploads);
    }

    rmSafe(tmp);

    const dbSize = fs.statSync(DB_PATH).size;
    res.json({
      ok: true,
      message: 'Gjenoppretting fullført. Server restarter om 2 sekunder — last appen på nytt deretter.',
      db_size_bytes: dbSize,
      photo_count:   photoCount,
    });

    // Avslutter prosessen etter at responsen har rukket ut.
    // Railway (restartPolicyType ON_FAILURE) starter containeren på nytt, som reconnecter til den nye DB-fila.
    setTimeout(() => {
      console.log('[admin/restore] Restarter for å koble til ny DB…');
      process.exit(0);
    }, 2000);
  } catch (e) {
    rmSafe(tmp);
    console.error('[admin/restore] feilet:', e);
    res.status(500).json({ error: e.message });
  }
});

function countFiles(dir) {
  let n = 0;
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) n += countFiles(p);
      else n++;
    }
  } catch {}
  return n;
}

// GET /api/admin/status — for å verifisere config fra CLI
router.get('/status', (req, res) => {
  let dbSize = null, uploadsCount = null;
  try { dbSize = fs.statSync(DB_PATH).size; } catch {}
  try { uploadsCount = countFiles(UPLOADS); } catch {}
  res.json({
    db_path:            DB_PATH,
    db_exists:          fs.existsSync(DB_PATH),
    db_size_bytes:      dbSize,
    uploads_path:       UPLOADS,
    uploads_exists:     fs.existsSync(UPLOADS),
    uploads_file_count: uploadsCount,
    restore_enabled:    process.env.ENABLE_ADMIN_RESTORE === '1',
  });
});

module.exports = router;
