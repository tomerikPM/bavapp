'use strict';

const express = require('express');
const router  = express.Router();
const { randomUUID } = require('crypto');
const db = require('../db');
const push = require('../pushSender');

// ── VAPID public key — frontend trenger denne for å abonnere ─────────────────
router.get('/vapid-public-key', (req, res) => {
  const key = push.getVapidPublicKey();
  if (!key) return res.status(503).json({ error: 'VAPID ikke konfigurert' });
  res.json({ publicKey: key });
});

// ── Abonner på push-varsler ───────────────────────────────────────────────────
router.post('/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.auth || !keys?.p256dh) {
    return res.status(400).json({ error: 'Ugyldig subscription-objekt' });
  }

  // Upsert — oppdater hvis endpoint allerede finnes
  const existing = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
  if (existing) {
    db.prepare('UPDATE push_subscriptions SET auth = @auth, p256dh = @p256dh WHERE id = @id')
      .run({ id: existing.id, auth: keys.auth, p256dh: keys.p256dh });
    return res.json({ ok: true, updated: true });
  }

  db.prepare(
    `INSERT INTO push_subscriptions (id, endpoint, auth, p256dh, user_agent)
     VALUES (@id, @endpoint, @auth, @p256dh, @ua)`
  ).run({
    id:       randomUUID(),
    endpoint,
    auth:     keys.auth,
    p256dh:   keys.p256dh,
    ua:       req.headers['user-agent']?.slice(0, 200) || null,
  });

  console.log('[push] Ny subscriber registrert');
  res.status(201).json({ ok: true });
});

// ── Avslutt abonnement ────────────────────────────────────────────────────────
router.delete('/subscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint mangler' });
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  res.json({ ok: true });
});

// ── Test-push (kun i utvikling) ───────────────────────────────────────────────
router.post('/test', async (req, res) => {
  try {
    await push.pushCritical(
      'Bavaria Sport 32 — Test',
      'Push-varsler fungerer! ⛵',
      '/#events'
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Liste over abonnenter (debug) ─────────────────────────────────────────────
router.get('/subscribers', (req, res) => {
  const subs = db.prepare('SELECT id, endpoint, created_at FROM push_subscriptions').all();
  res.json({ count: subs.length, subscribers: subs.map(s => ({
    id: s.id,
    endpoint: s.endpoint.slice(0, 60) + '…',
    created_at: s.created_at,
  }))});
});

module.exports = router;
