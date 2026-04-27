'use strict';
// sensorPoller.js — server-side poller som logger sensorverdier til sensor_history
// uavhengig av om noen har appen åpen i nettleser.

const db = require('./db');

const POLL_MS = 10_000;

const PATHS = [
  { path: 'propulsion.port.fuel.rate',         unit: 'm3/s'  },
  { path: 'propulsion.port.revolutions',        unit: 'Hz'    },
  { path: 'propulsion.port.temperature',        unit: 'K'     },
  { path: 'propulsion.port.oilTemperature',     unit: 'K'     },
  { path: 'propulsion.port.oilPressure',        unit: 'Pa'    },
  { path: 'propulsion.port.engineLoad',         unit: 'ratio' },
  { path: 'propulsion.port.boostPressure',      unit: 'Pa'    },
  { path: 'propulsion.port.alternatorVoltage',  unit: 'V'     },
  { path: 'propulsion.port.runTime',            unit: 's'     },
  { path: 'navigation.speedOverGround',         unit: 'm/s'   },
  { path: 'navigation.position',                unit: null    },
  { path: 'environment.depth.belowTransducer',  unit: 'm'     },
  { path: 'environment.water.temperature',      unit: 'K'     },
  { path: 'tanks.fuel.0.currentLevel',          unit: 'ratio' },
  { path: 'electrical.batteries.279.capacity.stateOfCharge', unit: 'ratio' },
  { path: 'electrical.batteries.279.voltage',   unit: 'V'     },
  { path: 'electrical.batteries.279.current',   unit: 'A'     },
];

const _insert = db.prepare(
  'INSERT INTO sensor_history (ts, path, value, unit) VALUES (@ts, @path, @value, @unit)'
);
const _insertMany = db.transaction(rows => { for (const r of rows) _insert.run(r); });

let _url      = process.env.SIGNALK_URL || 'http://localhost:3000';
let _timer    = null;
let _errCount = 0;

function start(signalkUrl) {
  if (signalkUrl) _url = signalkUrl;
  if (_timer) return;
  console.log('[sensorPoller] Starter · Signal K:', _url);
  poll();
  _timer = setInterval(poll, POLL_MS);
}

function stop() {
  clearInterval(_timer);
  _timer = null;
  console.log('[sensorPoller] Stoppet');
}

async function poll() {
  let raw;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${_url}/signalk/v1/api/vessels/self`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    raw = await res.json();
    _errCount = 0;
  } catch (e) {
    if (++_errCount === 3) console.warn('[sensorPoller] Signal K ikke nådd:', e.message);
    return;
  }

  const rpmHz = extractValue(raw, 'propulsion.port.revolutions');
  const rpm   = (rpmHz ?? 0) * 60;
  if (rpm < 200) return;

  const ts = new Date().toISOString();
  const rows = [];

  for (const { path, unit } of PATHS) {
    const value = extractValue(raw, path);
    if (value === null || value === undefined || !isFinite(value)) continue;
    rows.push({ ts, path, value, unit });
  }

  if (rows.length) _insertMany(rows);
}

// Henter verdi fra SK-treet på en gitt punktert sti.
// Hvis primær .value er null, sjekker vi .values-subkilder for første ikke-null.
function extractValue(obj, dotPath) {
  const parts = dotPath.split('.');
  let node = obj;
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return null;
    node = node[p];
  }
  if (node == null || typeof node !== 'object') return node ?? null;

  // Noden er et SK-leaf-objekt med .value
  if ('value' in node) {
    if (node.value !== null && node.value !== undefined) return node.value;
    // Primærkilden er null — fall tilbake på første ikke-null kilde
    if (node.values && typeof node.values === 'object') {
      for (const src of Object.values(node.values)) {
        if (src?.value !== null && src?.value !== undefined) return src.value;
      }
    }
    return null;
  }
  return null;
}

module.exports = { start, stop };
