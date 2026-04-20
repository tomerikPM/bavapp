'use strict';
// routes/navigate.js — Send destinasjonspunkt til Garmin via Signal K → NMEA 2000
//
// Kjeden:
//   BavApp → POST /api/navigate → Signal K PUT nextPoint
//           → Cerbo GX VE.Can → N2K PGN 129284 (Navigation Data)
//           → Garmin 1223xsv viser aktiv navigasjon (bearing, distanse, ETA)

const express = require('express');
const http    = require('http');
const https   = require('https');
const router  = express.Router();

const SK_URL = () => process.env.SIGNALK_URL || 'http://localhost:3000';

function skPut(path, value) {
  return new Promise((resolve, reject) => {
    const base    = SK_URL().replace(/\/$/, '');
    const urlPath = `/signalk/v1/api/vessels/self/${path.replace(/\./g, '/')}`;
    const body    = JSON.stringify({ value });
    const parsed  = new URL(base);
    const lib     = base.startsWith('https') ? https : http;
    const req     = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (base.startsWith('https') ? 443 : 80),
      path:     urlPath, method: 'PUT',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('SK timeout')); });
    req.write(body);
    req.end();
  });
}

function httpReq(url, method, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib    = url.startsWith('https') ? https : http;
    const opts   = {
      hostname: parsed.hostname,
      port:     parsed.port || (url.startsWith('https') ? 443 : 80),
      path:     parsed.pathname, method,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
    };
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// POST /api/navigate  { lat, lon, name }
router.post('/', async (req, res) => {
  const { lat, lon, name } = req.body;
  if (!lat || !lon) return res.status(400).json({ error: 'lat og lon er påkrevd' });
  const latitude = parseFloat(lat), longitude = parseFloat(lon);
  if (isNaN(latitude) || isNaN(longitude)) return res.status(400).json({ error: 'Ugyldig koordinat' });

  const errors = [];
  const base   = SK_URL().replace(/\/$/, '');

  // 1. Signal K v2 courses API
  try {
    const body   = JSON.stringify({ nextPoint: { position: { latitude, longitude } } });
    const result = await httpReq(`${base}/signalk/v2/api/vessels/self/navigation/course`, 'PUT', body);
    if (result.status < 300) {
      console.log(`[navigate] SK v2 course satt: ${name} (${latitude}, ${longitude})`);
      return res.json({ ok: true, api: 'signalk-v2', name, latitude, longitude });
    }
    errors.push(`SK v2: HTTP ${result.status}`);
  } catch (e) { errors.push(`SK v2: ${e.message}`); }

  // 2. Signal K v1 courseGreatCircle
  try {
    await skPut('navigation.courseGreatCircle.nextPoint.position', { latitude, longitude });
    if (name) await skPut('navigation.courseGreatCircle.nextPoint.name', name).catch(() => {});
    console.log(`[navigate] SK v1 nextPoint satt: ${name} (${latitude}, ${longitude})`);
    return res.json({ ok: true, api: 'signalk-v1', name, latitude, longitude });
  } catch (e) { errors.push(`SK v1: ${e.message}`); }

  res.status(502).json({
    error:   'Signal K ikke tilgjengelig — Cerbo GX er ikke tilkoblet.',
    details: errors,
    note:    'Krever Cerbo GX installert og N2K-backbone aktiv.',
  });
});

// DELETE /api/navigate — avbryt aktiv navigasjon
router.delete('/', async (req, res) => {
  const base = SK_URL().replace(/\/$/, '');
  try {
    const result = await httpReq(`${base}/signalk/v2/api/vessels/self/navigation/course`, 'DELETE');
    if (result.status < 300) return res.json({ ok: true });
  } catch {}
  try {
    await skPut('navigation.courseGreatCircle.nextPoint.position', null);
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

module.exports = router;
