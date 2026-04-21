'use strict';
// routes/router.js — PoC for Teltonika RUT200 via OpenWrt ubus JSON-RPC
//
// Konfigurasjon via env:
//   ROUTER_IP   = 192.168.1.1           (standard RUT200-adresse)
//   ROUTER_USER = admin
//   ROUTER_PASS = <passord>             (settes når ruteren kommer)
//   ROUTER_TLS  = 0 | 1                 (bruk https)
//
// Alle kall er best-effort: hvis ruteren ikke er nådd, returnerer vi
// { reachable:false, error: ... } slik at frontend kan vise det pent.
//
// ubus-dokumentasjon:
//   https://openwrt.org/docs/techref/ubus
//   https://wiki.teltonika-networks.com/view/Monitoring_via_JSON-RPC
//
// Typisk flow:
//   1. POST /ubus body: ["00000000000000000000000000000000", "session", "login",
//                        {"username":"admin","password":"..."}]
//      → response.result[1].ubus_rpc_session = <session-id>
//   2. POST /ubus body: [<session-id>, "<path>", "<method>", {<args>}]
//      → response.result[1] = data

const express = require('express');
const http    = require('http');
const https   = require('https');
const router  = express.Router();

const ROUTER_IP   = process.env.ROUTER_IP   || '192.168.1.1';
const ROUTER_USER = process.env.ROUTER_USER || 'admin';
const ROUTER_PASS = process.env.ROUTER_PASS || '';
const ROUTER_TLS  = process.env.ROUTER_TLS  === '1';

const EMPTY_SESSION = '00000000000000000000000000000000';
const SESSION_TTL_MS = 270_000;  // ruteren forkaster sessions etter ~5 min; fornye innen 4:30

let _session     = null;
let _sessionExp  = 0;

function httpPost(path, body, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const lib  = ROUTER_TLS ? https : http;
    const req  = lib.request({
      host: ROUTER_IP,
      port: ROUTER_TLS ? 443 : 80,
      path,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': data.length,
      },
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end',  () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error('Ugyldig JSON fra ruter: ' + e.message)); }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

// JSON-RPC-oppkall mot ubus: { jsonrpc, id, method, params: [session, path, method, args] }
async function ubus(path, method, args = {}, { noSession } = {}) {
  const session = noSession ? EMPTY_SESSION : await getSession();
  const body = {
    jsonrpc: '2.0',
    id:      Date.now(),
    method:  'call',
    params:  [session, path, method, args],
  };
  const resp = await httpPost('/ubus', body);
  if (resp.error) throw new Error(`ubus feil: ${JSON.stringify(resp.error)}`);
  if (!Array.isArray(resp.result)) throw new Error('Uventet ubus-respons');
  const [status, data] = resp.result;
  if (status !== 0) {
    // Status 4 = Access denied → sesjon utgått, retry én gang
    if (status === 4 && !noSession) {
      _session = null;
      return ubus(path, method, args);
    }
    throw new Error(`ubus status ${status} for ${path}.${method}`);
  }
  return data;
}

async function getSession() {
  if (_session && Date.now() < _sessionExp) return _session;
  if (!ROUTER_PASS) throw new Error('ROUTER_PASS ikke satt i miljøet');

  const data = await ubus('session', 'login', {
    username: ROUTER_USER,
    password: ROUTER_PASS,
    timeout:  300,
  }, { noSession: true });

  if (!data?.ubus_rpc_session) throw new Error('Ingen session-ID i login-respons');
  _session    = data.ubus_rpc_session;
  _sessionExp = Date.now() + SESSION_TTL_MS;
  return _session;
}

// ── Endepunkter ─────────────────────────────────────────────────────────────

// GET /api/router/config — hva er konfigurert (uten å eksponere passord)
router.get('/config', (req, res) => {
  res.json({
    ip:         ROUTER_IP,
    user:       ROUTER_USER,
    tls:        ROUTER_TLS,
    passSet:    !!ROUTER_PASS,
    sessionCached: !!_session && Date.now() < _sessionExp,
    note: 'Sett ROUTER_PASS i .env for å aktivere. Ruteren er ikke levert ennå — PoC returnerer { reachable: false } inntil da.',
  });
});

// GET /api/router/status — signalstyrke, operatør, WAN-status
router.get('/status', async (req, res) => {
  const unreachable = (error) => res.json({
    reachable: false, error,
    config: { ip: ROUTER_IP, passSet: !!ROUTER_PASS },
  });

  if (!ROUTER_PASS) return unreachable('ROUTER_PASS ikke satt');

  try {
    // Parallelle kall for effektivitet
    const [info, mobile, wan, clients] = await Promise.all([
      ubus('system',  'info',         {}).catch(e => ({ _error: e.message })),
      ubus('gsm.api', 'serving',      {}).catch(e => ({ _error: e.message })),
      ubus('network.interface.mob1s1a1', 'status', {}).catch(() =>
        ubus('network.interface.wan',     'status', {}).catch(e => ({ _error: e.message }))
      ),
      ubus('iwinfo', 'assoclist',     { device: 'wlan0' }).catch(() => null),
    ]);

    res.json({
      reachable: true,
      uptime:    info?.uptime   ?? null,
      loadavg:   info?.load     ?? null,
      memory:    info?.memory   ?? null,
      mobile: {
        signal:      mobile?.signal     ?? null,    // dBm (RSSI)
        sinr:        mobile?.sinr       ?? null,
        rsrp:        mobile?.rsrp       ?? null,
        rsrq:        mobile?.rsrq       ?? null,
        operator:    mobile?.operator   ?? null,
        networkType: mobile?.networkType ?? null,   // 2G/3G/4G/LTE
        band:        mobile?.band       ?? null,
        cellId:      mobile?.cellId     ?? null,
        _note:       mobile?._error ?? null,
      },
      wan: {
        proto:   wan?.proto ?? null,
        up:      wan?.up    ?? null,
        ipv4:    wan?.['ipv4-address']?.[0]?.address ?? null,
        uptime:  wan?.uptime ?? null,
        _note:   wan?._error ?? null,
      },
      wifiClients: Array.isArray(clients?.results) ? clients.results.length
                 : Array.isArray(clients)         ? clients.length
                 : null,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    unreachable(e.message);
  }
});

// POST /api/router/reboot — admin-kommando
router.post('/reboot', async (req, res) => {
  if (!ROUTER_PASS) return res.status(503).json({ error: 'ROUTER_PASS ikke satt' });
  try {
    await ubus('system', 'reboot', {});
    res.json({ ok: true, message: 'Reboot-kommando sendt. Ruteren er utilgjengelig i ~2 minutter.' });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// POST /api/router/sms — send SMS via ruterens SIM
// Body: { number: "+47...", message: "..." }
router.post('/sms', async (req, res) => {
  if (!ROUTER_PASS) return res.status(503).json({ error: 'ROUTER_PASS ikke satt' });
  const { number, message } = req.body || {};
  if (!number || !message) return res.status(400).json({ error: 'number + message påkrevd' });
  try {
    const result = await ubus('gsm.api', 'send_sms', { number, text: message });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/router/wifi-clients — liste over tilkoblede WiFi-enheter
router.get('/wifi-clients', async (req, res) => {
  if (!ROUTER_PASS) return res.status(503).json({ error: 'ROUTER_PASS ikke satt' });
  try {
    const data = await ubus('iwinfo', 'assoclist', { device: 'wlan0' });
    res.json({ clients: data?.results || data || [] });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
