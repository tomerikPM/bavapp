'use strict';
// routes/webasto.js — Webasto AirTop Evo 3900 kontroll via Signal K / Node-RED
//
// Arkitektur:
//   BavApp ─→ POST /api/webasto/command ─→ Signal K PUT  ─→ Node-RED ─→ W-Bus ─→ Webasto
//   BavApp ←─ GET  /api/webasto/state   ←─ Signal K GET  ←─ Node-RED ←─ W-Bus
//
// Signal K paths (custom):
//   environment.heating.0.state          — "off"|"starting"|"running"|"cooling"|"fault"
//   environment.heating.0.setTemperature — Kelvin
//   environment.heating.0.currentTemperature — Kelvin
//   environment.heating.0.operatingVoltage   — V
//   environment.heating.0.runtime            — sekunder
//   environment.heating.0.fault              — boolean
//   environment.heating.0.faultCode          — string

const express = require('express');
const http    = require('http');
const https   = require('https');
const router  = express.Router();

const SK_URL      = () => process.env.SIGNALK_URL || 'http://localhost:3000';
const NODERED_URL = () => process.env.NODERED_URL || 'http://localhost:1880';

// ── Hjelpefunksjoner ──────────────────────────────────────────────────────────

function skGet(path) {
  return new Promise((resolve, reject) => {
    const base = SK_URL().replace(/\/$/, '');
    const url  = `${base}/signalk/v1/api/vessels/self/${path.replace(/\./g, '/')}`;
    const lib  = url.startsWith('https') ? https : http;
    const req  = lib.get(url, { headers: { Accept: 'application/json' } }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed?.value ?? parsed);
        } catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('SK timeout')); });
  });
}

function skPut(path, value) {
  return new Promise((resolve, reject) => {
    const base    = SK_URL().replace(/\/$/, '');
    const urlPath = `/signalk/v1/api/vessels/self/${path.replace(/\./g, '/')}`;
    const body    = JSON.stringify({ value });
    const lib     = base.startsWith('https') ? https : http;
    const parsed  = new URL(base);
    const req     = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (base.startsWith('https') ? 443 : 80),
      path:     urlPath,
      method:   'PUT',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('SK PUT timeout')); });
    req.write(body);
    req.end();
  });
}

// Direktekall til Node-RED HTTP-endepunkt (brukes som fallback / primær kanal)
function nodeRedCommand(command, temperature) {
  return new Promise((resolve, reject) => {
    const base    = NODERED_URL().replace(/\/$/, '');
    const body    = JSON.stringify({ command, temperature });
    const parsed  = new URL(base);
    const lib     = base.startsWith('https') ? https : http;
    const req     = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || 1880,
      path:     '/webasto/command',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try   { resolve(JSON.parse(data)); }
        catch { resolve({ ok: true, raw: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Node-RED timeout')); });
    req.write(body);
    req.end();
  });
}

// ── GET /api/webasto/state ────────────────────────────────────────────────────
router.get('/state', async (req, res) => {
  try {
    const [state, setTemp, curTemp, voltage, runtime, fault, faultCode] = await Promise.allSettled([
      skGet('environment.heating.0.state'),
      skGet('environment.heating.0.setTemperature'),
      skGet('environment.heating.0.currentTemperature'),
      skGet('environment.heating.0.operatingVoltage'),
      skGet('environment.heating.0.runtime'),
      skGet('environment.heating.0.fault'),
      skGet('environment.heating.0.faultCode'),
    ]);

    const val = p => p.status === 'fulfilled' ? p.value : null;

    res.json({
      connected:           val(state) !== null,
      state:               val(state)    ?? 'unknown',
      setTemperature:      val(setTemp)  != null ? Math.round(val(setTemp)  - 273.15) : 20,
      currentTemperature:  val(curTemp)  != null ? Math.round(val(curTemp)  - 273.15) : null,
      operatingVoltage:    val(voltage),
      runtime:             val(runtime),
      fault:               val(fault) ?? false,
      faultCode:           val(faultCode) ?? null,
    });
  } catch (e) {
    res.status(502).json({ error: e.message, connected: false, state: 'unknown' });
  }
});

// ── POST /api/webasto/command ─────────────────────────────────────────────────
// Body: { command: "start" | "stop" | "settemp", temperature?: number (°C) }
router.post('/command', async (req, res) => {
  const { command, temperature } = req.body;

  if (!['start', 'stop', 'settemp', 'ventilation', 'eco', 'normal', 'plus'].includes(command)) {
    return res.status(400).json({ error: `Ugyldig kommando: ${command}` });
  }

  const errors = [];

  // 1. Forsøk via Node-RED (direkte W-Bus-styring)
  try {
    const result = await nodeRedCommand(command, temperature);
    console.log(`[webasto] Node-RED kommando "${command}" sendt:`, result);

    // Speil tilstand tilbake til Signal K
    const startCmds = ['start', 'eco', 'normal', 'plus', 'ventilation'];
    if (startCmds.includes(command)) {
      const newState = command === 'ventilation' ? 'ventilation' : command === 'eco' ? 'eco' : command === 'plus' ? 'plus' : 'starting';
      await skPut('environment.heating.0.state', newState).catch(() => {});
    } else if (command === 'stop') {
      await skPut('environment.heating.0.state', 'cooling').catch(() => {});
    }
    if (temperature != null) {
      await skPut('environment.heating.0.setTemperature', temperature + 273.15).catch(() => {});
    }
    return res.json({ ok: true, channel: 'nodered', result });
  } catch (e) {
    errors.push(`Node-RED: ${e.message}`);
  }

  // 2. Fallback: Signal K PUT direkte (krever at SK-plugin håndterer PUT)
  try {
    const startCmds2 = ['start', 'eco', 'normal', 'plus', 'ventilation'];
    const targetState = startCmds2.includes(command) ? (command === 'eco' ? 'eco' : command === 'plus' ? 'plus' : command === 'ventilation' ? 'ventilation' : 'starting') : command === 'stop' ? 'cooling' : null;
    if (targetState) {
      await skPut('environment.heating.0.state', targetState);
    }
    if (temperature != null) {
      await skPut('environment.heating.0.setTemperature', temperature + 273.15);
    }
    console.log(`[webasto] SK PUT kommando "${command}" sendt`);
    return res.json({ ok: true, channel: 'signalk' });
  } catch (e) {
    errors.push(`Signal K PUT: ${e.message}`);
  }

  res.status(502).json({ error: 'Kunne ikke nå verken Node-RED eller Signal K', details: errors });
});

module.exports = router;
