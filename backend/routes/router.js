'use strict';
// routes/router.js — Teltonika RUT200 via RutOS REST-API (/api)
//
// RutOS 7.x bruker IKKE lenger /ubus JSON-RPC. uhttpd er konfigurert med
//   -l /api -L /www/cgi-bin/api_dispatcher.lua
// så all programmatisk tilgang går via REST + Bearer token.
//
// Konfigurasjon via env (backend/.env):
//   ROUTER_IP   = 192.168.1.1            (default-gateway fra Cerbo: ip route show default)
//   ROUTER_USER = admin
//   ROUTER_PASS = <admin-passord>
//   ROUTER_TLS  = 1                      (RutOS redirecter HTTP→HTTPS, så TLS=1 nesten alltid)
//
// Auth-flow:
//   POST /api/login {username, password} → {success, data:{token, expires}}
//   Bruk token i Authorization: Bearer <token> på alle videre kall
//
// Dokumentasjon:
//   https://developers.teltonika-networks.com/devices/all-products/rut2-series/api/

const express = require('express');
const http    = require('http');
const https   = require('https');
const router  = express.Router();
const db      = require('../db');

const ROUTER_IP   = process.env.ROUTER_IP   || '192.168.1.1';
const ROUTER_USER = process.env.ROUTER_USER || 'admin';
const ROUTER_PASS = process.env.ROUTER_PASS || '';
const ROUTER_TLS  = process.env.ROUTER_TLS  !== '0';   // default på siden RutOS krever HTTPS

const TOKEN_TTL_MS = 270_000;  // RutOS-token utløper etter ~5 min; fornye innen 4:30

let _token       = null;
let _tokenExp    = 0;
let _cookieToken = null;   // verdi fra Set-Cookie etter login (kan avvike fra JSON-body)

// ── Lavnivå HTTP ────────────────────────────────────────────────────────────

// skipCsrf=true brukes på login-kallet — X-Csrf-Protection endrer login-responsen
function httpJson(method, path, { token, body, timeoutMs = 8000, skipCsrf = false } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const lib  = ROUTER_TLS ? https : http;
    const headers = { 'Accept': 'application/json' };
    if (data)  { headers['Content-Type']   = 'application/json'; headers['Content-Length'] = data.length; }
    if (token) { headers['Authorization']  = `Bearer ${token}`; headers['Cookie'] = `token=${_cookieToken || token}`; }
    if (method !== 'GET' && method !== 'HEAD' && !skipCsrf) { headers['X-Csrf-Protection'] = '1'; }

    const req = lib.request({
      host: ROUTER_IP,
      port: ROUTER_TLS ? 443 : 80,
      path,
      method,
      headers,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, res => {
      // Fang Set-Cookie fra login-respons — token kan komme hit istedenfor i JSON-body
      const setCookies = res.headers['set-cookie'] || [];
      for (const c of setCookies) {
        const m = /^token=([^;]+)/.exec(c);
        if (m) { _cookieToken = m[1]; break; }
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end',  () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          return reject(Object.assign(new Error(`HTTP ${res.statusCode} ${path}`), {
            status: res.statusCode, body: text,
          }));
        }
        if (!text) return resolve(null);
        try { resolve(JSON.parse(text)); }
        catch (e) { reject(new Error(`Ugyldig JSON fra ${path}: ${e.message} (body: ${text.slice(0,120)})`)); }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout mot ' + path)); });
    if (data) req.write(data);
    req.end();
  });
}

// ── Auth ────────────────────────────────────────────────────────────────────

async function getToken() {
  if (_token && Date.now() < _tokenExp) return _token;
  if (!ROUTER_PASS) throw new Error('ROUTER_PASS ikke satt i miljøet');

  const resp = await httpJson('POST', '/api/login', {
    body: { username: ROUTER_USER, password: ROUTER_PASS },
    skipCsrf: true,   // ikke send X-Csrf-Protection på login — endrer responsformatet
  });
  // RutOS 7.x: token enten i data.token (eldre) eller kun i Set-Cookie (nyere)
  // _cookieToken er allerede satt av httpJson via Set-Cookie-headeren
  const token = resp?.data?.token || resp?.ubus_rpc_session || _cookieToken;
  if (!token) throw new Error('Ingen token i login-respons: ' + JSON.stringify(resp).slice(0,200));
  _token    = token;
  _tokenExp = Date.now() + TOKEN_TTL_MS;
  return token;
}

async function apiGet(path) {
  const token = await getToken();
  try {
    return await httpJson('GET', path, { token });
  } catch (e) {
    // 401 → token utløpt: forny én gang og prøv igjen
    if (e.status === 401 || e.status === 403) {
      _token = null;
      const t2 = await getToken();
      return httpJson('GET', path, { token: t2 });
    }
    throw e;
  }
}

async function apiPost(path, body) {
  const token = await getToken();
  try {
    return await httpJson('POST', path, { token, body });
  } catch (e) {
    if (e.status === 401) {  // 401 = token utløpt; 403 = permanent tillatelsessjekk — ikke retry
      _token = null;
      const t2 = await getToken();
      return httpJson('POST', path, { token: t2, body });
    }
    throw e;
  }
}

async function apiDelete(path) {
  const token = await getToken();
  return httpJson('DELETE', path, { token });
}

// Prøv flere endepunkter (firmware-versjoner har litt ulike stier)
async function tryGet(paths) {
  for (const p of paths) {
    try {
      const r = await apiGet(p);
      if (r != null) return { _path: p, ...r };
    } catch (e) {
      if (e.status && e.status !== 404 && e.status !== 405) {
        // Ikke 404/405 = uventet feil, men vi prøver neste sti likevel
      }
    }
  }
  return { _error: 'Ingen av endepunktene svarte', _tried: paths };
}

// ── Hjelpere ────────────────────────────────────────────────────────────────

// Klassifiser et interface basert på navn/proto
function classifyInterface(iface) {
  const name  = (iface.id || iface.interface || iface.name || '').toLowerCase();
  const proto = (iface.proto    || iface.protocol || '').toLowerCase();
  const dev   = (iface.device   || iface.l3_device || iface.ifname || '').toLowerCase();

  if (name.startsWith('mob') || name.startsWith('lte') ||
      ['wwan', '3g', '4g', 'lte', 'qmi', 'ncm', 'modemmanager'].includes(proto)) {
    return 'cellular';
  }
  if (name === 'wwan' || name.startsWith('wwan') || name.includes('wifi') ||
      name.includes('sta') || name.includes('hotspot') ||
      dev.startsWith('wlan') || dev.startsWith('phy')) {
    return 'wifi';
  }
  if (name === 'wan' || name === 'wan6' || name.startsWith('wan_')) {
    return 'wan';
  }
  return name || 'unknown';
}

function pickFirstArray(...candidates) {
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
    if (Array.isArray(c?.data)) return c.data;
  }
  return [];
}

// ── Endepunkter ─────────────────────────────────────────────────────────────

// GET /api/router/config — hva er konfigurert (uten å eksponere passord)
router.get('/config', (req, res) => {
  res.json({
    ip:          ROUTER_IP,
    user:        ROUTER_USER,
    tls:         ROUTER_TLS,
    passSet:     !!ROUTER_PASS,
    tokenCached: !!_token && Date.now() < _tokenExp,
    api:         'rest',
    note:        'RutOS 7.x REST-API. Setter ROUTER_TLS=0 hvis du må bruke ren HTTP.',
  });
});

// GET /api/router/status — signalstyrke, operatør, WAN-status
router.get('/status', async (req, res) => {
  const unreachable = (error) => res.json({
    reachable: false, error,
    config: { ip: ROUTER_IP, passSet: !!ROUTER_PASS, tls: ROUTER_TLS },
  });

  if (!ROUTER_PASS) return unreachable('ROUTER_PASS ikke satt');

  try {
    // system/device/status er "is alive"-prøven — feiler den, er ruteren utilgjengelig
    const sysInfo = await apiGet('/api/system/device/status')
      .catch(e => { throw new Error('Kunne ikke nå ruteren: ' + e.message); });

    // Resten parallelt — alle kan feile uavhengig
    const [ifStatus, modems, wifiInterfaces, sysExtra] = await Promise.all([
      tryGet([
        '/api/interfaces/status',          // RutOS 7.x standard
        '/api/network/interfaces/status',
      ]),
      tryGet([
        '/api/modems/status',
        '/api/mobile/modem/status',
      ]),
      tryGet([
        '/api/wireless/interfaces/status',
        '/api/wireless/devices/status',
      ]),
      // Uptime + load — device/status har bare board-info, ikke runtime
      tryGet([
        '/api/system/info',
        '/api/system/status',
        '/api/system/device/info',
      ]),
    ]);

    // ── WAN-deteksjon ──
    const ifaces = pickFirstArray(ifStatus.data, ifStatus, ifStatus.interfaces);
    const isLan  = (i) => {
      const id = (i.id || i.interface || i.name || '').toLowerCase();
      return /^lan/.test(id) || id === 'loopback';
    };
    const hasIp4 = (i) => {
      // RutOS-formater varierer
      if (Array.isArray(i['ipv4-address']) && i['ipv4-address'].length) return true;
      if (i.ipv4 || i.ip || i.ipaddr) return true;
      if (Array.isArray(i.ipv4_address) && i.ipv4_address.length) return true;
      return false;
    };
    const isUp = (i) => i.up === true || i.up === 'true' || i.status === 'up' || i.state === 'up';

    const candidates = ifaces
      .filter(i => !isLan(i) && (isUp(i) || hasIp4(i)))
      .map(i => ({ ...i, _source: classifyInterface(i) }));

    const order = { cellular: 1, wifi: 2, wan: 3 };
    candidates.sort((a, b) => {
      const oa = order[a._source] || 9;
      const ob = order[b._source] || 9;
      if (oa !== ob) return oa - ob;
      // Within same type: prefer interfaces that have an IPv4 address
      return (hasIp4(b) ? 1 : 0) - (hasIp4(a) ? 1 : 0);
    });

    const wan = candidates[0] || null;
    const wanSource = wan?._source ?? 'none';
    const wanIp = wan?.['ipv4-address']?.[0]?.address
               ?? wan?.ipv4
               ?? wan?.ip
               ?? wan?.ipaddr
               ?? wan?.ipv4_address?.[0]
               ?? null;

    // ── WiFi-detaljer hvis WAN er via WiFi ──
    const wifis = pickFirstArray(wifiInterfaces.data, wifiInterfaces, wifiInterfaces.interfaces);
    let wifiSta = null;
    if (wanSource === 'wifi' || wanSource === 'wan') {
      wifiSta = wifis.find(w => {
        const m = (w.mode || w.iftype || '').toLowerCase();
        return m === 'sta' || m === 'client' || m === 'station';
      }) || wifis[0] || null;
    }

    // ── Mobil-data ──
    const mList = pickFirstArray(modems.data, modems, modems.modems);
    const mod   = mList[0] || null;
    // RutOS: simstate kan være 'Not inserted', 'Inserted', 'Ready', 'PIN required'... og iccid/imsi
    // returneres som "N/A" når det ikke er SIM. Stol på simstate_id (1 = Not inserted).
    const simStateText = (mod?.simstate || '').toLowerCase();
    const noSim = !mod || mod.simstate_id === 1 ||
                  simStateText.includes('not inserted') || simStateText.includes('no sim') ||
                  simStateText === '' || mod.iccid === 'N/A';
    const hasSim = !noSim;

    // Uptime: prøv først dedikert endepunkt, ellers fall tilbake til LAN-interface uptime
    // (LAN starter når ruteren booter, så den er en god proxy for system-uptime)
    const lanIface = ifaces.find(i => (i.id || i.name || '') === 'lan');
    const uptime = sysExtra?.data?.uptime ?? sysExtra?.uptime ??
                   sysInfo?.data?.uptime  ?? sysInfo?.uptime  ??
                   lanIface?.uptime       ?? null;

    res.json({
      reachable:  true,
      uptime,
      hostname:   sysInfo?.data?.static?.hostname ?? sysInfo?.data?.hostname ?? null,
      model:      sysInfo?.data?.model?.name ?? sysInfo?.data?.static?.model ?? null,
      fwVersion:  sysInfo?.data?.static?.fw_version ?? sysInfo?.data?.fw_version ?? null,
      wanSource,
      hasSim,
      mobile: hasSim && mod ? {
        signal:      mod.signal ?? mod.rssi ?? null,
        sinr:        mod.sinr ?? null,
        rsrp:        mod.rsrp ?? null,
        rsrq:        mod.rsrq ?? null,
        operator:    mod.operator ?? mod.operator_name ?? mod.network_name ?? null,
        networkType: mod.network_type ?? mod.connection_type ?? mod.mode ?? mod.type
                  ?? (mod.band ? (mod.band.match(/^(LTE|4G|5G|NR|3G|UMTS|HSPA\+?|2G|GSM)/i)?.[0] ?? null) : null),
        band:        mod.band ?? null,
        cellId:      mod.cell_id ?? mod.cellid ?? null,
        imei:        mod.imei ?? null,
      } : null,
      wan: {
        source:  wanSource,
        ifname:  wan?.id || wan?.interface || wan?.name || null,
        device:  wan?.device || wan?.l3_device || wan?.ifname || null,
        proto:   wan?.proto || wan?.protocol || null,
        up:      wan ? isUp(wan) : false,
        ipv4:    wanIp,
        uptime:  wan?.uptime ?? null,
        ssid:    wifiSta?.ssid ?? null,
        signal:  wifiSta?.signal ?? wifiSta?.rssi ?? null,
        bitrate: wifiSta?.bitrate ?? null,
        encryption: wifiSta?.encryption?.description?.[0] ?? wifiSta?.encryption ?? null,
      },
      wanCandidates: candidates.map(c => ({
        source: c._source,
        ifname: c.id || c.interface || c.name,
        proto:  c.proto || c.protocol,
        ipv4:   c['ipv4-address']?.[0]?.address ?? c.ipv4 ?? c.ip ?? c.ipaddr ?? null,
      })),
      _diag: {
        ifStatusPath:    ifStatus._path || null,
        modemsPath:      modems._path   || null,
        wifiPath:        wifiInterfaces._path || null,
        ifaceCount:      ifaces.length,
        candidateCount:  candidates.length,
        seenInterfaces:  candidates.length === 0
          ? ifaces.map(i => ({
              name: i.id || i.interface || i.name,
              up: isUp(i), proto: i.proto || i.protocol, hasIp4: hasIp4(i),
            }))
          : undefined,
      },
      ts: new Date().toISOString(),
    });
  } catch (e) {
    unreachable(e.message);
  }
});

// POST /api/router/reboot
router.post('/reboot', async (req, res) => {
  if (!ROUTER_PASS) return res.status(503).json({ error: 'ROUTER_PASS ikke satt' });
  try {
    await apiPost('/api/system/device/actions/reboot', {});
    res.json({ ok: true, message: 'Reboot-kommando sendt. Ruteren er utilgjengelig i ~2 minutter.' });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// POST /api/router/sms — body: { number, message }
router.post('/sms', async (req, res) => {
  if (!ROUTER_PASS) return res.status(503).json({ error: 'ROUTER_PASS ikke satt' });
  const { number, message } = req.body || {};
  if (!number || !message) return res.status(400).json({ error: 'number + message påkrevd' });
  try {
    const candidates = [
      // RutOS 7.x bekreftet format (fra nettverkslogg)
      { path: '/api/messages/actions/send', body: { data: { modem: '1-1', number, message } } },
      // Fallback-varianter
      { path: '/api/messages/actions/send', body: { modem: '1-1', number, message } },
      { path: '/api/messages',              body: { modem_id: '1-1', number, message } },
      { path: '/api/sms/send',              body: { modem: '1-1', number, message } },
    ];
    let got403 = false;
    for (const c of candidates) {
      try {
        const r = await apiPost(c.path, c.body);
        return res.json({ ok: true, result: r, _path: c.path });
      } catch (e) {
        if (e.status === 403) got403 = true;
      }
    }
    if (got403) {
      return res.status(403).json({
        error: 'SMS-API er ikke aktivert på ruteren.',
        hint: 'Gå til RutOS-webgrensesnittet → Services → Mobile Utilities → Messages, og aktiver "Remote configuration / API access".',
      });
    }
    res.status(502).json({ error: 'Fant ingen SMS-send endepunkt på denne RutOS-versjonen' });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/router/wifi-clients
router.get('/wifi-clients', async (req, res) => {
  if (!ROUTER_PASS) return res.status(503).json({ error: 'ROUTER_PASS ikke satt' });
  try {
    const data = await tryGet([
      '/api/wireless/interfaces/status',
      '/api/wireless/devices/status',
      '/api/wireless/clients',
    ]);
    if (data?._error) return res.json({ clients: [], _debug: data });

    const all = pickFirstArray(data.data, data);
    const clients = [];

    for (const item of all) {
      // Format A: interface-objekt med 'clients'-array (RutOS 7.x primærformat)
      if (Array.isArray(item.clients) && item.clients.length) {
        for (const c of item.clients) clients.push(normaliseClient(c));
        continue;
      }
      if (Array.isArray(item.stations) && item.stations.length) {
        for (const c of item.stations) clients.push(normaliseClient(c));
        continue;
      }
      if (Array.isArray(item.associated) && item.associated.length) {
        for (const c of item.associated) clients.push(normaliseClient(c));
        continue;
      }
      // Format A2: assoclist som objekt { MAC: {...} }
      if (item.assoclist && typeof item.assoclist === 'object' && !Array.isArray(item.assoclist)) {
        for (const [mac, info] of Object.entries(item.assoclist)) {
          clients.push(normaliseClient({ macaddr: mac, mac, ...info }));
        }
        continue;
      }
      // Format B: item er selve klienten
      if (item.macaddr || item.mac || item.bssid || item.station) {
        clients.push(normaliseClient(item));
      }
    }

    res.json({ clients });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

function normaliseClient(c) {
  const mac    = c.macaddr || c.mac || c.bssid || c.station || null;
  const sigRaw = c.signal ?? null;
  const signal = sigRaw == null ? null
    : typeof sigRaw === 'string' ? parseInt(sigRaw, 10) || null
    : sigRaw;
  return {
    mac,
    hostname: c.hostname || c.name || null,
    ip:       c.ipaddr   || c.ip   || null,
    signal,
    band:     c.band     || null,
    rxRate:   c.rx_rate  || null,
    txRate:   c.tx_rate  || null,
  };
}

function isWanIface(i) {
  const id    = (i.id || i.interface || i.name || '').toLowerCase();
  const proto = (i.proto || i.protocol || '').toLowerCase();
  return id.startsWith('mob') || id.startsWith('wan') || id === 'wwan' ||
    ['wwan', '3g', '4g', 'lte', 'qmi', 'ncm', 'modemmanager'].includes(proto);
}

// GET /api/router/traffic
router.get('/traffic', async (req, res) => {
  if (!ROUTER_PASS) return res.status(503).json({ error: 'ROUTER_PASS ikke satt' });
  try {
    const data = await tryGet([
      '/api/interfaces/status',
      '/api/network/interfaces/status',
    ]);
    const ifaces = pickFirstArray(data.data, data, data.interfaces);
    const wan = ifaces.find(isWanIface);
    const stats = wan?.statistics || wan?.stats || {};
    res.json({
      ifname:     wan?.id || wan?.interface || wan?.name || null,
      rx_bytes:   stats.rx_bytes   ?? null,
      tx_bytes:   stats.tx_bytes   ?? null,
      rx_packets: stats.rx_packets ?? null,
      tx_packets: stats.tx_packets ?? null,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/router/sms-inbox
router.get('/sms-inbox', async (req, res) => {
  if (!ROUTER_PASS) return res.status(503).json({ error: 'ROUTER_PASS ikke satt' });
  try {
    const data = await tryGet([
      '/api/messages',                  // RutOS 7.x bekreftet (cookie-auth)
      '/api/modems/1-1/messages',
      '/api/modems/1-1/sms/messages',
      '/api/sms/messages',
    ]);
    if (data?._error) return res.status(502).json({ error: data._error, tried: data._tried });
    const messages = pickFirstArray(data.data, data, data.messages, data.sms);
    res.json({ messages, _path: data._path });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// DELETE /api/router/sms-inbox/:id
router.delete('/sms-inbox/:id', async (req, res) => {
  if (!ROUTER_PASS) return res.status(503).json({ error: 'ROUTER_PASS ikke satt' });
  const id = req.params.id;
  try {
    await apiDelete(`/api/messages/${encodeURIComponent(id)}`)
      .catch(() => apiDelete(`/api/sms/messages/${encodeURIComponent(id)}`));
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/router/history — tidsseriedata for signal og databruk
router.get('/history', (req, res) => {
  const hours = Math.min(72, Math.max(1, parseInt(req.query.hours || '6', 10)));
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows  = db.prepare(
    'SELECT ts, signal_dbm, rx_bytes, tx_bytes FROM router_history WHERE ts >= ? ORDER BY ts ASC'
  ).all(since);
  res.json({ rows, hours });
});

// GET /api/router/devices — pakke-fordeling per LAN-klient over et vindu.
// Vi lagrer kumulative tx/rx_packets per assoc og regner deltaer på spørringstid.
// Når en klient reasocierer hopper telleren tilbake — da teller vi gjeldende verdi
// som "delta", siden alt før resetten allerede er telt med fra forrige periode.
router.get('/devices', (req, res) => {
  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours || '24', 10)));
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = db.prepare(`
    WITH ordered AS (
      SELECT ts, mac, rx_packets, tx_packets,
             LAG(rx_packets) OVER (PARTITION BY mac ORDER BY ts) AS prev_rx,
             LAG(tx_packets) OVER (PARTITION BY mac ORDER BY ts) AS prev_tx
      FROM device_traffic_history
      WHERE ts >= ?
    ),
    deltas AS (
      SELECT mac,
             CASE WHEN prev_rx IS NULL OR rx_packets < prev_rx THEN rx_packets
                  ELSE rx_packets - prev_rx END AS d_rx,
             CASE WHEN prev_tx IS NULL OR tx_packets < prev_tx THEN tx_packets
                  ELSE tx_packets - prev_tx END AS d_tx
      FROM ordered
    )
    SELECT d.mac,
           (SELECT alias FROM device_aliases WHERE mac = d.mac) AS alias,
           (SELECT hostname FROM device_traffic_history
              WHERE mac = d.mac AND hostname IS NOT NULL
              ORDER BY ts DESC LIMIT 1) AS hostname,
           (SELECT ip FROM device_traffic_history
              WHERE mac = d.mac AND ip IS NOT NULL
              ORDER BY ts DESC LIMIT 1) AS ip,
           SUM(d_rx) AS rx_packets,
           SUM(d_tx) AS tx_packets,
           COUNT(*)  AS samples,
           (SELECT MAX(ts) FROM device_traffic_history WHERE mac = d.mac) AS last_seen
    FROM deltas d
    GROUP BY d.mac
    ORDER BY (SUM(d_rx) + SUM(d_tx)) DESC
  `).all(since);
  res.json({ rows, hours });
});

// GET /api/router/devices/recent?minutes=60 — anslått MB/time per enhet siste vindu.
// Kombinerer per-klient pakke-deltaer med totale WAN-byte-deltaer for å estimere bytes
// per enhet (vi har ikke direkte byte-tellere per klient — se TRINN 2 i CLAUDE.md).
//
// Statusterskler kan settes via env (defaults gjenspeiler 28/4-spike-en):
//   TRAFFIC_WARN_MB_PER_HOUR=500
//   TRAFFIC_ALERT_MB_PER_HOUR=1500
const WARN_MB_H  = parseInt(process.env.TRAFFIC_WARN_MB_PER_HOUR  || '500',  10);
const ALERT_MB_H = parseInt(process.env.TRAFFIC_ALERT_MB_PER_HOUR || '1500', 10);

router.get('/devices/recent', (req, res) => {
  const minutes = Math.min(360, Math.max(5, parseInt(req.query.minutes || '60', 10)));
  const since   = new Date(Date.now() - minutes * 60_000).toISOString();

  // Pakke-deltaer per MAC i vinduet (samme håndtering av reassoc som /devices)
  const macRows = db.prepare(`
    WITH ordered AS (
      SELECT ts, mac, rx_packets, tx_packets,
             LAG(rx_packets) OVER (PARTITION BY mac ORDER BY ts) AS prev_rx,
             LAG(tx_packets) OVER (PARTITION BY mac ORDER BY ts) AS prev_tx
      FROM device_traffic_history
      WHERE ts >= ?
    ),
    deltas AS (
      SELECT mac,
             CASE WHEN prev_rx IS NULL OR rx_packets < prev_rx THEN rx_packets
                  ELSE rx_packets - prev_rx END AS d_rx,
             CASE WHEN prev_tx IS NULL OR tx_packets < prev_tx THEN tx_packets
                  ELSE tx_packets - prev_tx END AS d_tx
      FROM ordered
    )
    SELECT d.mac,
           (SELECT alias FROM device_aliases WHERE mac = d.mac) AS alias,
           (SELECT hostname FROM device_traffic_history
              WHERE mac = d.mac AND hostname IS NOT NULL
              ORDER BY ts DESC LIMIT 1) AS hostname,
           (SELECT ip FROM device_traffic_history
              WHERE mac = d.mac AND ip IS NOT NULL
              ORDER BY ts DESC LIMIT 1) AS ip,
           SUM(d_rx) AS rx_packets,
           SUM(d_tx) AS tx_packets,
           COUNT(*)  AS samples
    FROM deltas d
    GROUP BY d.mac
  `).all(since);

  // Total WAN-bytes-delta i samme vindu (router_history er kumulativ — MAX-MIN er en
  // god nok proxy. Kan undervurdere ved router-reboot mellom samples, men tregheter er
  // tolererbar siden vi bare bruker den til byte-per-pakke-estimat.)
  const totals = db.prepare(`
    SELECT MIN(rx_bytes) AS rx_min, MAX(rx_bytes) AS rx_max,
           MIN(tx_bytes) AS tx_min, MAX(tx_bytes) AS tx_max
    FROM router_history WHERE ts >= ? AND rx_bytes IS NOT NULL
  `).get(since);

  const totalBytes = (totals && totals.rx_max != null)
    ? Math.max(0, (totals.rx_max - totals.rx_min) + (totals.tx_max - totals.tx_min))
    : 0;
  const totalPackets = macRows.reduce((a, r) => a + (r.rx_packets || 0) + (r.tx_packets || 0), 0);
  const bytesPerPacket = totalPackets > 0 ? totalBytes / totalPackets : 0;

  const hoursWindow = minutes / 60;
  const enriched = macRows
    .map(r => {
      const pkts  = (r.rx_packets || 0) + (r.tx_packets || 0);
      const bytes = Math.round(pkts * bytesPerPacket);
      const mbPerHour = hoursWindow > 0 ? (bytes / 1024 / 1024) / hoursWindow : 0;
      let status = 'ok';
      if (mbPerHour >= ALERT_MB_H) status = 'alert';
      else if (mbPerHour >= WARN_MB_H) status = 'warn';
      return {
        mac: r.mac, alias: r.alias, hostname: r.hostname, ip: r.ip,
        rx_packets: r.rx_packets, tx_packets: r.tx_packets,
        est_bytes: bytes,
        est_mb_per_hour: Math.round(mbPerHour * 10) / 10,
        status,
      };
    })
    .sort((a, b) => b.est_bytes - a.est_bytes);

  // Total mobil-bruk i vinduet (ekte, ikke estimat)
  const wanRxMB = totals && totals.rx_max != null ? Math.round((totals.rx_max - totals.rx_min) / 1024 / 1024 * 10) / 10 : null;
  const wanTxMB = totals && totals.tx_max != null ? Math.round((totals.tx_max - totals.tx_min) / 1024 / 1024 * 10) / 10 : null;

  // Worst-case status for hele vinduet
  const worstStatus = enriched.find(d => d.status === 'alert') ? 'alert'
                    : enriched.find(d => d.status === 'warn')  ? 'warn'
                    : 'ok';
  const topDevice = enriched[0] || null;

  res.json({
    minutes,
    bytes_per_packet: Math.round(bytesPerPacket * 10) / 10,
    wan_rx_mb: wanRxMB,
    wan_tx_mb: wanTxMB,
    thresholds: { warn_mb_per_hour: WARN_MB_H, alert_mb_per_hour: ALERT_MB_H },
    status: worstStatus,
    top: topDevice,
    devices: enriched,
  });
});

// ── Device aliases ────────────────────────────────────────────────────────
// Brukerdefinerte navn per MAC ("Tom Eriks MacBook" etc.) som overstyrer
// hostname i UI-visninger. Lagres lokalt i SQLite, ikke avhengig av RUT200.

function normaliseMac(mac) {
  if (!mac || typeof mac !== 'string') return null;
  const cleaned = mac.trim().toUpperCase().replace(/-/g, ':');
  return /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(cleaned) ? cleaned : null;
}

router.get('/aliases', (req, res) => {
  const rows = db.prepare('SELECT mac, alias, updated_at FROM device_aliases ORDER BY alias').all();
  res.json({ rows });
});

router.put('/aliases/:mac', (req, res) => {
  const mac = normaliseMac(req.params.mac);
  if (!mac) return res.status(400).json({ error: 'Ugyldig MAC-adresse' });
  const alias = (req.body?.alias || '').toString().trim();
  if (!alias) return res.status(400).json({ error: 'alias påkrevd' });
  if (alias.length > 60) return res.status(400).json({ error: 'alias maks 60 tegn' });
  db.prepare(`
    INSERT INTO device_aliases (mac, alias, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    ON CONFLICT(mac) DO UPDATE SET alias = excluded.alias, updated_at = excluded.updated_at
  `).run(mac, alias);
  res.json({ ok: true, mac, alias });
});

router.delete('/aliases/:mac', (req, res) => {
  const mac = normaliseMac(req.params.mac);
  if (!mac) return res.status(400).json({ error: 'Ugyldig MAC-adresse' });
  const r = db.prepare('DELETE FROM device_aliases WHERE mac = ?').run(mac);
  res.json({ ok: true, deleted: r.changes });
});

// GET /api/router/debug — probe alle interessante endepunkter
router.get('/debug', async (req, res) => {
  if (!ROUTER_PASS) return res.status(503).json({ error: 'ROUTER_PASS ikke satt' });
  const probe = async (path) => {
    try { const data = await apiGet(path); return { ok: true, data }; }
    catch (e) { return { ok: false, error: e.message, status: e.status }; }
  };
  const paths = [
    '/api/system/device/status',
    '/api/system/device/info',
    '/api/interfaces/status',
    '/api/network/interfaces/status',
    '/api/wireless/devices/status',
    '/api/wireless/interfaces/status',
    '/api/wireless/clients',
    '/api/modems/status',
    '/api/modems/0/status',
    '/api/modems/0/serving',
    '/api/messages',
    '/api/sms/messages',
  ];
  const results = await Promise.all(paths.map(p => probe(p).then(r => ({ path: p, ...r }))));
  res.json({ results, ts: new Date().toISOString() });
});

// ── Router history poller ─────────────────────────────────────────────────────
// Tar snapshots av signal + trafikk hvert 2. minutt uten å vente på at noen
// åpner siden. Lagrer i router_history for grafvisning.

const _histInsert = db.prepare(
  'INSERT INTO router_history (ts, signal_dbm, rx_bytes, tx_bytes) VALUES (?,?,?,?)'
);
const _histPrune = db.prepare(
  "DELETE FROM router_history WHERE ts < datetime('now', '-7 days')"
);
const _devInsert = db.prepare(
  `INSERT INTO device_traffic_history
     (ts, mac, hostname, ip, rx_packets, tx_packets, signal_dbm)
   VALUES (?,?,?,?,?,?,?)`
);
const _devPrune = db.prepare(
  "DELETE FROM device_traffic_history WHERE ts < datetime('now', '-30 days')"
);

function isLanIface(i) {
  const id = (i.id || i.interface || i.name || '').toLowerCase();
  return /^lan/.test(id) || id === 'loopback' || id === 'lo';
}

function extractBytes(obj) {
  if (!obj) return { rx: null, tx: null };
  const s = obj.statistics || obj.stats || {};
  return {
    rx: s.rx_bytes ?? obj.rx_bytes ?? null,
    tx: s.tx_bytes ?? obj.tx_bytes ?? null,
  };
}

async function recordRouterHistory() {
  if (!ROUTER_PASS) return;
  try {
    const [modems, ifStatus, wifiStatus] = await Promise.allSettled([
      tryGet(['/api/modems/status', '/api/mobile/modem/status']),
      tryGet(['/api/interfaces/status', '/api/network/interfaces/status']),
      tryGet(['/api/wireless/interfaces/status']),
    ]);

    const mData  = modems.status === 'fulfilled' ? modems.value : null;
    const mList  = mData ? pickFirstArray(mData.data, mData, mData.modems) : [];
    const mod    = mList[0] || null;
    const signal = mod?.signal ?? mod?.rssi ?? null;

    let rxBytes = null, txBytes = null;

    // Kilde 1: WAN-interfacet i interfaces/status (prioritert)
    const ifData = ifStatus.status === 'fulfilled' ? ifStatus.value : null;
    const ifaces = ifData ? pickFirstArray(ifData.data, ifData, ifData.interfaces) : [];
    const wan    = ifaces.find(isWanIface);
    if (wan) {
      const b = extractBytes(wan);
      if (b.rx != null) { rxBytes = b.rx; txBytes = b.tx; }
    }
    // Fallback: alle ikke-LAN-interface i interfaces/status
    if (rxBytes == null) {
      for (const iface of ifaces) {
        if (isLanIface(iface)) continue;
        const b = extractBytes(iface);
        if (b.rx != null) { rxBytes = b.rx; txBytes = b.tx; break; }
      }
    }

    // Kilde 2: wireless-interfaces (WiFi-WAN / hotspot)
    if (rxBytes == null) {
      const wData  = wifiStatus.status === 'fulfilled' ? wifiStatus.value : null;
      const wIfaces = wData ? pickFirstArray(wData.data, wData) : [];
      for (const w of wIfaces) {
        const b = extractBytes(w);
        if (b.rx != null) { rxBytes = b.rx; txBytes = b.tx; break; }
      }
    }

    // Kilde 3: modem-datakontorer
    if (rxBytes == null && mod) {
      const rx = mod.data_rx ?? mod.bytes_received ?? mod.rx_bytes ?? null;
      const tx = mod.data_tx ?? mod.bytes_sent    ?? mod.tx_bytes ?? null;
      if (rx != null) { rxBytes = rx; txBytes = tx; }
    }

    const ts = new Date().toISOString();
    if (signal != null || rxBytes != null) {
      _histInsert.run(ts, signal, rxBytes, txBytes);
    }

    // Per-klient: kombiner clients[] (som har hostname/ip) med assoclist (pakke-tellere).
    // assoclist er nøkkel→{tx_packets,rx_packets,signal,...}, clients er liste med matchende macaddr.
    const wData   = wifiStatus.status === 'fulfilled' ? wifiStatus.value : null;
    const wIfaces = wData ? pickFirstArray(wData.data, wData) : [];
    const seen    = new Map();   // mac → { hostname, ip, rx, tx, sig }
    for (const ap of wIfaces) {
      const clientList = Array.isArray(ap.clients) ? ap.clients : [];
      const meta = new Map();
      for (const c of clientList) {
        const m = (c.macaddr || c.mac || '').toUpperCase();
        if (!m) continue;
        meta.set(m, {
          hostname: c.hostname || null,
          ip:       c.ipaddr   || c.ip || null,
          sig:      typeof c.signal === 'string'
                      ? parseInt(c.signal, 10) || null
                      : (c.signal ?? null),
        });
      }
      const assoc = ap.assoclist && typeof ap.assoclist === 'object' ? ap.assoclist : {};
      for (const [macRaw, info] of Object.entries(assoc)) {
        const mac = macRaw.toUpperCase();
        const rx  = info.rx_packets;
        const tx  = info.tx_packets;
        if (rx == null && tx == null) continue;
        const m = meta.get(mac) || {};
        seen.set(mac, {
          hostname: m.hostname ?? null,
          ip:       m.ip ?? null,
          rx, tx,
          sig: info.signal ?? m.sig ?? null,
        });
      }
    }
    for (const [mac, d] of seen) {
      _devInsert.run(ts, mac, d.hostname, d.ip, d.rx, d.tx, d.sig);
    }
  } catch { /* ruteren kan være utilgjengelig */ }
}

if (ROUTER_PASS) {
  recordRouterHistory();
  setInterval(recordRouterHistory, 2 * 60_000);
  setInterval(() => {
    try { _histPrune.run(); } catch {}
    try { _devPrune.run();  } catch {}
  }, 3_600_000);
}

module.exports = router;
