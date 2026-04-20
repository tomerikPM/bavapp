// signalk.js — Signal K REST polling + WebSocket stream

const SK_POLL_INTERVAL = 5000;

function getSkBase() {
  const { protocol, hostname, port } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  return window.location.origin;
}

const SK_BASE = getSkBase();

let _ws = null;
let _pollTimer = null;
let _listeners = {};
let _state = {};
let _connected = false;
let _lastSeen = null;

export function getState()    { return _state; }
export function isConnected() { return _connected; }
export function getLastSeen() { return _lastSeen; }

export function on(event, cb) {
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(cb);
}
function emit(event, data) {
  (_listeners[event] || []).forEach(cb => { try { cb(data); } catch {} });
}

export function start() {
  poll();
  _pollTimer = setInterval(poll, SK_POLL_INTERVAL);
  connectWS();
}

export function stop() {
  clearInterval(_pollTimer);
  if (_ws) _ws.close();
}

async function poll() {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${SK_BASE}/signalk/v1/api/vessels/self`, { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    _state = flatten(data);
    _connected = true;
    _lastSeen = new Date();
    emit('update', _state);
    emit('connect', null);
  } catch {
    if (_connected) {
      _connected = false;
      emit('disconnect', null);
    }
  }
}

function connectWS() {
  const proto = SK_BASE.startsWith('https') ? 'wss:' : 'ws:';
  const host  = SK_BASE.replace(/^https?:\/\//, '');
  const wsUrl = `${proto}//${host}/signalk/v1/stream`;
  try {
    _ws = new WebSocket(wsUrl);
    _ws.onmessage = (e) => {
      try {
        const delta = JSON.parse(e.data);
        if (delta.updates) applyDelta(delta);
      } catch {}
    };
    _ws.onclose = () => setTimeout(connectWS, 5000);
    _ws.onerror = () => {};
  } catch {}
}

function applyDelta(delta) {
  for (const update of delta.updates || []) {
    for (const { path, value } of update.values || []) {
      _state[path] = value;
    }
  }
  _lastSeen = new Date();
  emit('update', _state);
}

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && 'value' in v) {
      out[key] = v.value;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

// ── Named getters ─────────────────────────────────────────────────────────────
export const get = {
  // Navigasjon
  lat:          (s = _state) => s['navigation.position']?.latitude  ?? null,
  lon:          (s = _state) => s['navigation.position']?.longitude ?? null,
  sog:          (s = _state) => s['navigation.speedOverGround']      ?? null,
  sogKnots:     (s = _state) => (get.sog(s) ?? 0) * 1.94384,

  // Motor
  rpm:          (s = _state) => Math.round((s['propulsion.0.revolutions'] ?? 0) * 60),
  engineOn:     (s = _state) => (get.rpm(s) ?? 0) > 100 || s['propulsion.0.state'] === 'started',
  engineHours:  (s = _state) => s['propulsion.0.runTime'] != null
                                  ? s['propulsion.0.runTime'] / 3600 : null,
  coolant:      (s = _state) => s['propulsion.0.coolantTemperature'] != null
                                  ? Math.round(s['propulsion.0.coolantTemperature'] - 273.15) : null,
  oilTemp:      (s = _state) => s['propulsion.0.oilTemperature'] != null
                                  ? Math.round(s['propulsion.0.oilTemperature'] - 273.15) : null,
  oilPressureBar: (s = _state) => s['propulsion.0.oilPressure'] != null
                                  ? Math.round((s['propulsion.0.oilPressure'] / 100000) * 10) / 10 : null,
  engineLoad:   (s = _state) => s['propulsion.0.engineLoad'] != null
                                  ? Math.round(s['propulsion.0.engineLoad'] * 100) : null,
  boostKpa:     (s = _state) => s['propulsion.0.boostPressure'] != null
                                  ? Math.round(s['propulsion.0.boostPressure'] / 1000) : null,
  fuelRateLH:   (s = _state) => s['propulsion.0.fuelRate'] != null
                                  ? Math.round(s['propulsion.0.fuelRate'] * 3600000 * 10) / 10 : null,
  gear:         (s = _state) => s['propulsion.0.transmission.gear'] ?? null,
  alternatorVolt: (s = _state) => s['electrical.alternators.0.voltage'] ?? null,

  // Motor-alarmer: returnerer array av aktive alarm-objekter
  engineAlarms: (s = _state) => {
    const raw = s['propulsion.0.alarms'];
    return Array.isArray(raw) ? raw : [];
  },

  // Batterier
  houseSoc:     (s = _state) => s['electrical.batteries.0.capacity.stateOfCharge'] != null
                                  ? Math.round(s['electrical.batteries.0.capacity.stateOfCharge'] * 100) : null,
  houseVolt:    (s = _state) => s['electrical.batteries.0.voltage']  ?? null,
  houseCurrent: (s = _state) => s['electrical.batteries.0.current']  ?? null,
  startSoc:     (s = _state) => s['electrical.batteries.1.capacity.stateOfCharge'] != null
                                  ? Math.round(s['electrical.batteries.1.capacity.stateOfCharge'] * 100) : null,
  startVolt:    (s = _state) => s['electrical.batteries.1.voltage']  ?? null,
  thrusterSoc:  (s = _state) => s['electrical.batteries.2.capacity.stateOfCharge'] != null
                                  ? Math.round(s['electrical.batteries.2.capacity.stateOfCharge'] * 100) : null,
  thrusterVolt: (s = _state) => s['electrical.batteries.2.voltage']  ?? null,
  shorepower:   (s = _state) => s['electrical.ac.shore.available']   ?? false,
  inverter:     (s = _state) => s['electrical.inverter.0.state'] === 'on',

  // Tank
  fuelPct:      (s = _state) => s['tanks.fuel.0.currentLevel'] != null
                                  ? Math.round(s['tanks.fuel.0.currentLevel'] * 100) : null,
  fuelLitres:   (s = _state) => s['tanks.fuel.0.currentLevel'] != null
                                  ? Math.round(s['tanks.fuel.0.currentLevel'] * 370) : null,

  // Miljo
  windSpeed:    (s = _state) => s['environment.wind.speedApparent']  ?? null,
  waterTempC:   (s = _state) => s['environment.water.temperature'] != null
                                  ? Math.round((s['environment.water.temperature'] - 273.15) * 10) / 10 : null,
  waterDepth:   (s = _state) => s['environment.water.depth'] != null
                                  ? Math.round(s['environment.water.depth'] * 10) / 10 : null,
};
