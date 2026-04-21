'use strict';
// middleware/siteAuth.js — HTTP Basic Auth-gate for ikke-lokal tilgang.
//
// Hensikt: La utvikling på localhost + tilgang fra boatens lokale nett
// (192.168.x / 10.x / 169.254.x) fortsette uten friksjon, men kreve
// brukernavn + passord for alt som kommer utenfra (Railway-URL osv).
//
// Miljøvariabler:
//   SITE_PASSWORD — påkrevd for at gaten skal aktiveres
//   SITE_USER     — valgfri, default "bavapp"
//
// Hvis SITE_PASSWORD ikke er satt, slippes alle gjennom (dev-scenarie).

const crypto = require('crypto');

function isLoopbackOrLan(req) {
  const h = (req.hostname || '').toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;

  // req.ip kan ha "::ffff:"-prefix for IPv4-mappet IPv6
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1') return true;

  // Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
  if (/^10\./.test(ip))             return true;
  if (/^192\.168\./.test(ip))       return true;
  if (/^169\.254\./.test(ip))       return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;

  return false;
}

// Konstant-tid-sammenlikning for å unngå timing-angrep
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = function siteAuth(req, res, next) {
  const password = process.env.SITE_PASSWORD;
  // Ikke konfigurert → ingen gate (dev-modus)
  if (!password) return next();

  // Ingen gate for localhost / LAN / healthcheck
  if (req.path === '/api/health')  return next();
  if (isLoopbackOrLan(req))        return next();

  const user   = process.env.SITE_USER || 'bavapp';
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Bavapp"');
    return res.status(401).send('Autentisering kreves');
  }

  let provided;
  try {
    provided = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    res.set('WWW-Authenticate', 'Basic realm="Bavapp"');
    return res.status(401).send('Ugyldig autentiseringshode');
  }
  const idx = provided.indexOf(':');
  const providedUser = idx >= 0 ? provided.slice(0, idx) : '';
  const providedPass = idx >= 0 ? provided.slice(idx + 1) : '';

  const userOk = safeEqual(providedUser, user);
  const passOk = safeEqual(providedPass, password);

  if (userOk && passOk) return next();

  res.set('WWW-Authenticate', 'Basic realm="Bavapp"');
  return res.status(401).send('Ugyldig brukernavn eller passord');
};
