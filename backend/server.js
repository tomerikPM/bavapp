'use strict';

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const http     = require('http');
const https    = require('https');
require('dotenv').config();

const app    = express();
const PORT   = process.env.PORT || 3001;
const SK_URL = process.env.SIGNALK_URL || 'http://localhost:3000';

// Railway/proxy: trust én proxy-hop for å få korrekt req.ip
app.set('trust proxy', 1);

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Passord-gate for ikke-lokal tilgang (aktiveres kun hvis SITE_PASSWORD er satt).
// Må mountes før routes + static slik at alt bak /uploads og /diagrams også er gated.
app.use(require('./middleware/siteAuth'));

const uploadsPath = process.env.UPLOADS_PATH || './uploads';
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use('/uploads', express.static(path.resolve(uploadsPath)));

const frontendPath = path.resolve(__dirname, '../frontend');
if (fs.existsSync(frontendPath)) app.use(express.static(frontendPath));

// ── Signal K proxy ────────────────────────────────────────────────────────────
app.use('/signalk', (req, res) => {
  const skBase = SK_URL.replace(/\/$/, '');
  const qs     = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = `${skBase}/signalk${req.path}${qs}`;
  const lib    = target.startsWith('https') ? https : http;
  const proxyReq = lib.request(target, {
    method: req.method,
    headers: { ...req.headers, host: new URL(skBase).host },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', err => res.status(502).json({ error: 'Signal K ikke tilgjengelig', detail: err.message }));
  req.pipe(proxyReq, { end: true });
});

// ── MET Norway proxy ──────────────────────────────────────────────────────────
app.use('/met', (req, res) => {
  const qs     = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = `https://api.met.no${req.path}${qs}`;
  const proxyReq = https.request(target, {
    method: 'GET',
    headers: { 'User-Agent': 'Bavaria32App/1.0 tom.erik.thorsen@gmail.com', 'Accept': 'application/json' },
  }, (proxyRes) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(proxyRes.statusCode);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', err => res.status(502).json({ error: 'MET Norway ikke tilgjengelig', detail: err.message }));
  proxyReq.end();
});

// ── Kartverket Tidevann proxy (vannstand.kartverket.no/tideapi.php) ──────────
app.get('/tide', (req, res) => {
  const qs     = new URLSearchParams(req.query).toString();
  const target = `https://vannstand.kartverket.no/tideapi.php?${qs}`;
  const proxyReq = https.request(target, {
    method: 'GET',
    headers: { 'User-Agent': 'Bavaria32App/1.0 tom.erik.thorsen@gmail.com', 'Accept': 'application/xml,text/xml,*/*' },
  }, (proxyRes) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.writeHead(proxyRes.statusCode);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', err => res.status(502).json({ error: 'Kartverket Tide API ikke tilgjengelig', detail: err.message }));
  proxyReq.end();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/events',      require('./routes/events'));
app.use('/api/docs',        require('./routes/docs'));
app.use('/api/parts',       require('./routes/parts'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/trips',       require('./routes/trips'));
app.use('/api/sensors',     require('./routes/sensors'));
app.use('/api/diag',        require('./routes/diag'));
app.use('/api/push',        require('./routes/push'));
app.use('/api/costs',       require('./routes/costs'));
app.use('/api/anomaly',     require('./routes/anomaly'));
app.use('/api/efficiency',  require('./routes/efficiency'));
app.use('/api/webasto',     require('./routes/webasto'));
app.use('/api/changelog',   require('./routes/changelog'));
app.use('/api/navigate',    require('./routes/navigate'));
const fuelRoute = require('./routes/fuel');
app.use('/api/fuel', fuelRoute);
app.use('/api/fog',          require('./routes/fog'));
app.use('/api/kystvaer',     require('./routes/kystvaer'));
app.use('/api/textforecast', require('./routes/textforecast'));
app.use('/api/features',     require('./routes/features'));
app.use('/api/router',       require('./routes/router'));
app.use('/api/admin',        require('./routes/admin'));
app.use('/api/photos',       require('./routes/photos'));
app.use('/api/image',        require('./routes/image'));
app.use('/api/vessel',       require('./routes/vessel'));
app.use('/api/sauna',        require('./routes/sauna'));
app.use('/api/ais',          require('./routes/ais'));

const tracker = require('./tripTracker');
const watcher = require('./eventWatcher');
const poller  = require('./sensorPoller');

app.get('/api/trips/active', (req, res) => {
  const info = tracker.getActiveTripInfo();
  res.json(info || { active: false });
});
app.post('/api/trips/track/start', (req, res) => { tracker.manualStart(req.body); res.json({ ok: true }); });
app.post('/api/trips/track/stop',  (req, res) => { tracker.manualStop();          res.json({ ok: true }); });

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'Summer / Bavaria Sport 32 Backend', vessel: 'FAR999', ts: new Date().toISOString() });
});

app.get('*', (req, res) => {
  const index = path.resolve(frontendPath, 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n⛵  Summer / Bavaria Sport 32 Backend`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Signal K: ${SK_URL}\n`);
  tracker.start(SK_URL);
  watcher.start(SK_URL);
  poller.start(SK_URL);
  fuelRoute.startScheduler();
});
