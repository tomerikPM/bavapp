'use strict';

/**
 * eventWatcher.js — automatiske hendelser + push-varsler
 *
 * Overvåker:
 *   - Motor startet / stoppet
 *   - Landstrøm tilkoblet / frakoblet
 *   - Batteri under 30% / 20% / tilbake OK / fulladet
 *   - Kjølevannstemperatur høy / kritisk / normalisert
 *   - Bilgepumpe aktiv
 *   - DTC / motormeldinger
 *
 * Push-varsler sendes for:
 *   - Alle 'critical'-hendelser (bilge, batteri < 20%, kjølevann kritisk, DTC emergency)
 *   - Utvalgte 'warn'-hendelser (landstrøm frakoblet, batteri < 30%, kjølevann høy)
 */

const db             = require('./db');
const { randomUUID } = require('crypto');
const push           = require('./pushSender');

const POLL_MS = 10_000;

const DEBOUNCE = {
  engine:  120_000,
  shore:    60_000,
  batt:    300_000,
  coolant:  60_000,
  bilge:   120_000,
  dtc:      60_000,
};

const NO_DEBOUNCE = new Set([
  'engine_start', 'engine_stop',
  'shore_on', 'shore_off',
  'batt_ok', 'batt_full', 'cool_ok',
]);

// Hendelsesnøkler som skal sende push selv om severity = 'warn'
const PUSH_ON_WARN = new Set([
  'shore_off', 'batt_warn', 'cool_warn',
]);

let _url         = process.env.SIGNALK_URL || 'http://localhost:3000';
let _timer       = null;
let _errCount    = 0;
let _initialized = false;

const _prev = {
  engineOn:     null,
  shorepower:   null,
  soc:          null,
  socAlarm:     null,
  coolantAlarm: null,
  bilgeActive:  null,
};

const _activeDtcCodes = new Set();
const _lastFired = {};

// ── Public API ────────────────────────────────────────────────────────────────

function start(signalkUrl) {
  if (signalkUrl) _url = signalkUrl;
  if (_timer) return;
  console.log('[eventWatcher] Starter · Signal K:', _url);
  push.init();  // initialiser web-push tidlig (logger om nøkler mangler)
  _timer = setInterval(poll, POLL_MS);
  poll();
}

function stop() {
  clearInterval(_timer);
  _timer = null;
  console.log('[eventWatcher] Stoppet');
}

// ── Poll ──────────────────────────────────────────────────────────────────────

async function poll() {
  let sk;
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 5000);
    const res  = await fetch(`${_url}/signalk/v1/api/vessels/self`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    sk = flatten(await res.json());
    _errCount = 0;
  } catch (e) {
    if (++_errCount === 3) console.warn('[eventWatcher] Signal K ikke nådd:', e.message);
    return;
  }

  if (!_initialized) {
    initBaseline(sk);
    _initialized = true;
    return;
  }

  checkEngine(sk);
  checkShorepower(sk);
  checkBattery(sk);
  checkCoolant(sk);
  checkBilge(sk);
  checkDtcAlarms(sk);
}

// ── Sjekker ───────────────────────────────────────────────────────────────────

function checkEngine(sk) {
  const rpm      = (sk['propulsion.0.revolutions'] ?? 0) * 60;
  const engineOn = rpm > 100 || sk['propulsion.0.state'] === 'started';
  if (engineOn === _prev.engineOn) return;
  if (engineOn)
    fire('engine_start', 'engine', 'Motor startet', `RPM: ${Math.round(rpm)}`, 'info', 'engine');
  else {
    const hrs = sk['propulsion.0.runTime'] ? Math.round(sk['propulsion.0.runTime'] / 3600).toLocaleString('no') : null;
    fire('engine_stop', 'engine', 'Motor stoppet', hrs ? `${hrs} gangtimer totalt` : 'RPM: 0', 'info', 'engine');
  }
  _prev.engineOn = engineOn;
}

function checkShorepower(sk) {
  const shore = sk['electrical.ac.shore.available'] ?? false;
  if (shore === _prev.shorepower) return;
  if (shore)
    fire('shore_on',  'electrical', 'Landstrøm tilkoblet', '230V AC · lading startet', 'info',  'shore');
  else
    fire('shore_off', 'electrical', 'Landstrøm frakoblet', 'Byttet til batteri',        'warn',  'shore');
  _prev.shorepower = shore;
}

function checkBattery(sk) {
  const socRaw = sk['electrical.batteries.0.capacity.stateOfCharge'] ?? null;
  if (socRaw == null) return;
  const soc     = Math.round(socRaw * 100);
  const current = sk['electrical.batteries.0.current'] ?? null;
  const newAlarm  = soc <= 20 ? 'low20' : soc <= 30 ? 'low30' : 'none';
  const prevAlarm = _prev.socAlarm;
  if (newAlarm !== prevAlarm) {
    if (newAlarm === 'low20')
      fire('batt_crit', 'electrical', `Batteri kritisk lavt — ${soc}%`, 'Under 20% · koble til landstrøm eller start motor', 'critical', 'batt');
    else if (newAlarm === 'low30' && prevAlarm === 'none')
      fire('batt_warn', 'electrical', `Batteri lavt — ${soc}%`, 'Under 30% · vurder lading', 'warn', 'batt');
    else if (newAlarm === 'none' && prevAlarm !== 'none')
      fire('batt_ok', 'electrical', `Batteri OK — ${soc}%`, 'Over 30% igjen', 'info', 'batt');
    _prev.socAlarm = newAlarm;
  }
  const prevSoc = _prev.soc ?? 0;
  if (current != null && current > 0.5 && soc >= 95 && prevSoc < 95)
    fire('batt_full', 'electrical', `Batteri fulladet — ${soc}%`, 'Lading fullført', 'info', 'batt');
  _prev.soc = soc;
}

function checkCoolant(sk) {
  const engineOn = (_prev.engineOn === true);
  const coolantK = sk['propulsion.0.coolantTemperature'] ?? null;
  const coolantC = coolantK != null ? coolantK - 273.15 : null;
  if (!engineOn) { _prev.coolantAlarm = 'ok'; return; }
  if (coolantC == null) return;
  const newAlarm  = coolantC >= 95 ? 'crit95' : coolantC >= 90 ? 'warn90' : 'ok';
  const prevAlarm = _prev.coolantAlarm ?? 'ok';
  if (newAlarm === prevAlarm) return;
  if (newAlarm === 'crit95')
    fire('cool_crit', 'engine', `Kjølevann kritisk — ${Math.round(coolantC)}°C`, 'Over 95°C · stopp motor umiddelbart', 'critical', 'coolant');
  else if (newAlarm === 'warn90')
    fire('cool_warn', 'engine', `Kjølevann høy — ${Math.round(coolantC)}°C`, 'Over 90°C · overvåk nøye', 'warn', 'coolant');
  else if (newAlarm === 'ok' && prevAlarm !== 'ok')
    fire('cool_ok', 'engine', `Kjølevann normalt — ${Math.round(coolantC)}°C`, 'Under 90°C igjen', 'info', 'coolant');
  _prev.coolantAlarm = newAlarm;
}

function checkBilge(sk) {
  const bilge = !!(
    sk['electrical.switches.bilgePump.state'] === 'on' ||
    sk['electrical.switches.bilgepump.state'] === 'on'
  );
  if (bilge && !_prev.bilgeActive)
    fire('bilge', 'alarm', 'Bilgepumpe aktiv', 'Vann i båten registrert', 'critical', 'bilge');
  _prev.bilgeActive = bilge;
}

function checkDtcAlarms(sk) {
  const alarms = sk['propulsion.0.alarms'];
  if (!Array.isArray(alarms)) { _activeDtcCodes.clear(); return; }

  const currentCodes = new Set(alarms.map(a => a.code));

  for (const alarm of alarms) {
    if (!_activeDtcCodes.has(alarm.code)) {
      const severity = alarm.severity === 'emergency' ? 'critical'
                     : alarm.severity === 'warning'   ? 'warn' : 'info';
      fire(`dtc_${alarm.code}`, 'engine', alarm.message,
        `Kode: ${alarm.code} · Kilde: ${alarm.source ?? 'EVC'}`, severity, 'dtc');
    }
  }

  for (const code of _activeDtcCodes) {
    if (!currentCodes.has(code))
      fire(`dtc_resolve_${code}`, 'engine', `Motormelding kvittert: ${code}`, 'Alarm ikke lenger aktiv', 'info', 'dtc');
  }

  _activeDtcCodes.clear();
  for (const code of currentCodes) _activeDtcCodes.add(code);
}

// ── Baseline ──────────────────────────────────────────────────────────────────

function initBaseline(sk) {
  const rpm    = (sk['propulsion.0.revolutions'] ?? 0) * 60;
  const socRaw = sk['electrical.batteries.0.capacity.stateOfCharge'] ?? null;
  const soc    = socRaw != null ? Math.round(socRaw * 100) : null;
  _prev.engineOn     = rpm > 100 || sk['propulsion.0.state'] === 'started';
  _prev.shorepower   = sk['electrical.ac.shore.available'] ?? false;
  _prev.soc          = soc;
  _prev.socAlarm     = soc == null ? 'none' : soc <= 20 ? 'low20' : soc <= 30 ? 'low30' : 'none';
  _prev.coolantAlarm = 'ok';
  _prev.bilgeActive  = false;
  const alarms = sk['propulsion.0.alarms'];
  if (Array.isArray(alarms)) for (const a of alarms) _activeDtcCodes.add(a.code);
  console.log(`[eventWatcher] Baseline satt · motor=${_prev.engineOn} · shore=${_prev.shorepower} · soc=${soc ?? '?'}% · dtc=${_activeDtcCodes.size} aktive`);
}

// ── Fire med debounce og push ─────────────────────────────────────────────────

function fire(key, category, title, body, severity, debounceGroup) {
  const now  = Date.now();
  const last = _lastFired[key] ?? 0;
  const wait = DEBOUNCE[debounceGroup] ?? 60_000;

  if (!NO_DEBOUNCE.has(key) && now - last < wait) return;
  _lastFired[key] = now;

  // ── Logg til database ──────────────────────────────────────────────────────
  try {
    db.prepare(
      `INSERT INTO events (id, ts, type, category, title, body, source, severity)
       VALUES (@id, @ts, 'auto', @cat, @title, @body, 'eventWatcher', @sev)`
    ).run({ id: randomUUID(), ts: new Date().toISOString(), cat: category, title, body: body ?? null, sev: severity });
    const icon = severity === 'critical' ? '⚠ ' : severity === 'warn' ? '◉ ' : '◎ ';
    console.log(`[eventWatcher] ${icon}${title}`);
  } catch (e) {
    console.error('[eventWatcher] Lagringsfeil:', e.message);
  }

  // ── Push-varsel ────────────────────────────────────────────────────────────
  const shouldPush = severity === 'critical' || (severity === 'warn' && PUSH_ON_WARN.has(key));
  if (shouldPush) {
    // Ikke await — push-sending skal ikke blokkere event-loopen
    const pushFn = severity === 'critical' ? push.pushCritical : push.pushWarning;
    pushFn(title, body || '', '/#events').catch(() => {});
  }
}

// ── Flatten Signal K JSON ─────────────────────────────────────────────────────

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && 'value' in v) out[key] = v.value;
    else if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

module.exports = { start, stop };
