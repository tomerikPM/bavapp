'use strict';

/**
 * pushSender.js — sender Web Push-varsler til alle abonnenter
 *
 * Brukes av eventWatcher.js for kritiske hendelser.
 * Krever web-push og VAPID-nøkler i .env.
 */

let _webpush = null;
let _ready   = false;

function init() {
  if (_ready) return true;
  try {
    _webpush = require('web-push');
    const pub  = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subj = process.env.VAPID_SUBJECT || 'mailto:tom.erik.thorsen@gmail.com';
    if (!pub || !priv) {
      console.warn('[pushSender] VAPID-nøkler mangler i .env — push deaktivert');
      return false;
    }
    _webpush.setVapidDetails(subj, pub, priv);
    _ready = true;
    console.log('[pushSender] Klar · VAPID OK');
    return true;
  } catch (e) {
    console.warn('[pushSender] web-push ikke installert (npm install web-push) — push deaktivert');
    return false;
  }
}

// ── Hent db lazy (unngår sirkulær avhengighet) ────────────────────────────────
function getDb() { return require('./db'); }

// ── Send til alle abonnenter ──────────────────────────────────────────────────
async function sendToAll(payload) {
  if (!init()) return;

  const db   = getDb();
  const subs = db.prepare('SELECT * FROM push_subscriptions').all();
  if (!subs.length) return;

  const msg = JSON.stringify(payload);
  let sent = 0, removed = 0;

  for (const sub of subs) {
    try {
      await _webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
        msg,
        { TTL: 3600 }   // 1 time levetid
      );
      sent++;
    } catch (e) {
      // 410 Gone / 404 = subscription ugyldig — slett den
      if (e.statusCode === 410 || e.statusCode === 404) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        removed++;
      } else {
        console.warn('[pushSender] Feil ved sending til', sub.endpoint.slice(0, 60), e.statusCode);
      }
    }
  }

  if (sent > 0) {
    const icon = payload.severity === 'critical' ? '⚠' : '◉';
    console.log(`[pushSender] ${icon} "${payload.title}" → ${sent} mottaker(e)${removed ? ` · ${removed} utgåtte fjernet` : ''}`);
  }
}

// ── Bekvemlighetsfunksjoner per alvorlighetsnivå ──────────────────────────────
function pushCritical(title, body, url = '/#events') {
  return sendToAll({ title, body, url, severity: 'critical', tag: 'critical-' + Date.now() });
}

function pushWarning(title, body, url = '/#events') {
  return sendToAll({ title, body, url, severity: 'warning', tag: 'warning-' + Date.now() });
}

function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

module.exports = { sendToAll, pushCritical, pushWarning, getVapidPublicKey, init };
