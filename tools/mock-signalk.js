'use strict';
// tools/mock-signalk.js — minimal Signal K-mock som serverer snapshot/signalk.json
//
// Speiler API-overflaten bavapp bruker:
//   GET  /signalk/v1/api/                                 → root meta
//   GET  /signalk/v1/api/vessels/self                     → full state-tre
//   GET  /signalk/v1/api/vessels/self/<dotted/path>       → subtre
//   PUT  /signalk/v1/api/vessels/self/...                 → 200 (no-op)
//   PUT  /signalk/v2/api/vessels/self/navigation/course   → 200 (no-op)
//   DELETE samme                                          → 200 (no-op)
//
// Slik får sensorPoller, navigate.js, diag.js osv. ekte form på dataen
// uten at noe må endres i backend.

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = parseInt(process.env.PORT || '3010', 10);
const SNAP_PATH = process.env.SNAPSHOT || path.join(__dirname, '..', 'snapshot', 'signalk.json');

if (!fs.existsSync(SNAP_PATH)) {
  console.error(`[mock-signalk] Fant ikke ${SNAP_PATH}. Kjør tools/snapshot.sh først.`);
  process.exit(1);
}

let snapshot = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'));
console.log(`[mock-signalk] Lastet ${SNAP_PATH}`);

// Hot-reload ved endring (handy under utvikling)
fs.watchFile(SNAP_PATH, { interval: 1000 }, () => {
  try {
    snapshot = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'));
    console.log('[mock-signalk] Reloaded snapshot');
  } catch (e) {
    console.warn('[mock-signalk] Reload feilet:', e.message);
  }
});

function getByPath(obj, dotted) {
  if (!dotted) return obj;
  const parts = dotted.split('/').filter(Boolean);
  let node = obj;
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return null;
    node = node[p];
  }
  return node;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p   = url.pathname;

  // Root-meta
  if (p === '/signalk' || p === '/signalk/' || p === '/signalk/v1/api/' || p === '/signalk/v1/api') {
    return json(res, 200, {
      version: 'mock',
      self:    'vessels.self',
      endpoints: { v1: { version: '1.0.0', 'signalk-http': `http://localhost:${PORT}/signalk/v1/api/` } },
    });
  }

  // PUT/DELETE — no-op suksess
  if (req.method === 'PUT' || req.method === 'DELETE') {
    return json(res, 200, { state: 'COMPLETED', statusCode: 200, mock: true });
  }

  // GET vessels/self[/...]
  const m = p.match(/^\/signalk\/v[12]\/api\/vessels\/self(?:\/(.*))?$/);
  if (m && req.method === 'GET') {
    const sub  = m[1] || '';
    const data = getByPath(snapshot, sub);
    if (data === undefined || data === null) return json(res, 404, { error: 'not found in snapshot', path: sub });
    return json(res, 200, data);
  }

  json(res, 404, { error: 'not implemented in mock', path: p });
});

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

server.listen(PORT, () => {
  console.log(`[mock-signalk] http://localhost:${PORT}/signalk/v1/api/vessels/self`);
});
