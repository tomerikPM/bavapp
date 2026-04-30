'use strict';
// middleware/siteAuth.js — HTTP Basic Auth + session-cookie for ikke-lokal tilgang.
//
// Flyt:
//   1. Første besøk: Browser får 401 + WWW-Authenticate → Basic Auth-prompt.
//   2. Korrekt passord: Server setter signert HMAC-cookie (30 dager).
//   3. Senere requests: Cookie sjekkes først — ingen re-prompt.
//
// Dette løser Safari/iOS-problemet der browseren "glemmer" Basic Auth mellom
// fetch()-kall og prompter på hvert klikk.
//
// Miljøvariabler:
//   SITE_PASSWORD — påkrevd for at gaten skal aktiveres
//   SITE_USER     — valgfri, default "bavapp"

const crypto = require('crypto');

const COOKIE_NAME = 'bavapp_session';
const COOKIE_MAX_AGE_MS = 30 * 24 * 3600 * 1000;  // 30 dager

function signToken(user, password) {
  const data = `${user}.${Date.now()}`;
  const sig  = crypto.createHmac('sha256', password).update(data).digest('hex');
  return `${data}.${sig}`;
}

function validToken(token, password) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [user, tsStr, sig] = parts;
  const expected = crypto.createHmac('sha256', password).update(`${user}.${tsStr}`).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return false;
  } catch { return false; }
  const ts = parseInt(tsStr, 10);
  if (!Number.isFinite(ts)) return false;
  if (Date.now() - ts > COOKIE_MAX_AGE_MS) return false;
  return true;
}

function parseCookies(header) {
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

function isLoopbackOrLan(req) {
  // NB: 127.0.0.1 / ::1 bypasses ikke — Tailscale Funnel proxer fra loopback.
  // Auth gjelder for Funnel og Tailscale (100.x); kun ekte private LAN-IPs slipper unna.
  const ip = (req.ip || '').replace(/^::ffff:/, '');
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
  if (!password) return next();  // dev-modus

  if (req.path === '/api/health')  return next();
  if (isLoopbackOrLan(req))        return next();

  const user = process.env.SITE_USER || 'bavapp';

  // 1. Sjekk cookie først — raskest og unngår re-prompts
  const cookies = parseCookies(req.headers.cookie);
  if (validToken(cookies[COOKIE_NAME], password)) return next();

  // 2. Sjekk Basic Auth
  const header = req.headers.authorization;
  if (header && header.startsWith('Basic ')) {
    let provided;
    try {
      provided = Buffer.from(header.slice(6), 'base64').toString('utf8');
    } catch {
      return sendAuthChallenge(res, 'Ugyldig autentiseringshode');
    }
    const idx = provided.indexOf(':');
    const providedUser = idx >= 0 ? provided.slice(0, idx) : '';
    const providedPass = idx >= 0 ? provided.slice(idx + 1) : '';

    if (safeEqual(providedUser, user) && safeEqual(providedPass, password)) {
      // Sett session-cookie så browseren slipper å bruke Basic Auth for hvert kall
      const token = signToken(user, password);
      res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure:   req.secure || req.headers['x-forwarded-proto'] === 'https',
        sameSite: 'lax',
        maxAge:   COOKIE_MAX_AGE_MS,
        path:     '/',
      });
      return next();
    }

    return sendAuthChallenge(res, 'Ugyldig brukernavn eller passord');
  }

  // 3. Ingen auth ennå — be browser prompte
  sendAuthChallenge(res, 'Autentisering kreves');
};

function sendAuthChallenge(res, message) {
  res.set('WWW-Authenticate', 'Basic realm="Bavapp"');
  res.status(401).send(message);
}
