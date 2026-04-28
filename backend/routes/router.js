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

const ROUTER_IP   = process.env.ROUTER_IP   || '192.168.1.1';
const ROUTER_USER = process.env.ROUTER_USER || 'admin';
const ROUTER_PASS = process.env.ROUTER_PASS || '';
const ROUTER_TLS  = process.env.ROUTER_TLS  !== '0';   // default på siden RutOS krever HTTPS

const TOKEN_TTL_MS = 270_000;  // RutOS-token utløper etter ~5 min; fornye innen 4:30

let _token    = null;
let _tokenExp = 0;

// ── Lavnivå HTTP ────────────────────────────────────────────────────────────

function httpJson(method, path, { token, body, timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const lib  = ROUTER_TLS ? https : http;
    const headers = { 'Accept': 'application/json' };
    if (data)  { headers['Content-Type']   = 'application/json'; headers['Content-Length'] = data.length; }
    if (token) { headers['Authorization']  = `Bearer ${token}`; }

    const req = lib.request({
      host: ROUTER_IP,
      port: ROUTER_TLS ? 443 : 80,
      path,
      method,
      headers,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, res => {
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
  });
  // RutOS svarer typisk { success:true, data:{ username, token, expires } }
  const token = resp?.data?.token || resp?.ubus_rpc_session;
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
    if (e.status === 401 || e.status === 403) {
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
    // RutOS-stier varierer mellom firmware-versjoner
    const candidates = [
      { path: '/api/messages/actions/send',                 body: { number, text: message } },
      { path: '/api/sms/actions/send',                      body: { number, message } },
      { path: '/api/modems/0/sms/actions/send',             body: { number, message } },
    ];
    for (const c of candidates) {
      try { const r = await apiPost(c.path, c.body); return res.json({ ok: true, result: r, _path: c.path }); }
      catch (e) { if (e.status !== 404) { /* prøv neste likevel */ } }
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
      '/api/wireless/devices/status',
      '/api/wireless/clients',
    ]);
    if (data?._error) return res.json({ clients: [] });
    // Plukk ut klienter — formatet varierer
    const all = pickFirstArray(data.data, data);
    const clients = [];
    for (const dev of all) {
      const stations = dev.stations || dev.assoclist || dev.clients || [];
      for (const s of stations) clients.push(s);
    }
    res.json({ clients });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/router/traffic
router.get('/traffic', async (req, res) => {
  if (!ROUTER_PASS) return res.status(503).json({ error: 'ROUTER_PASS ikke satt' });
  try {
    const data = await tryGet([
      '/api/interfaces/status',
      '/api/network/interfaces/status',
    ]);
    const ifaces = pickFirstArray(data.data, data, data.interfaces);
    // Velg WAN-interfacet
    const wan = ifaces.find(i => {
      const id = (i.id || i.interface || i.name || '').toLowerCase();
      return id.startsWith('mob') || id === 'wan' || id === 'wwan';
    });
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
      '/api/messages',
      '/api/sms/messages',
      '/api/modems/0/sms/messages',
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
    '/api/modems/status',
    '/api/modems/0/status',
    '/api/modems/0/serving',
    '/api/messages',
    '/api/sms/messages',
  ];
  const results = await Promise.all(paths.map(p => probe(p).then(r => ({ path: p, ...r }))));
  res.json({ results, ts: new Date().toISOString() });
});

module.exports = router;
