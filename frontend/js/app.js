import * as SK from './signalk.js?v=4';
import { sensors } from './api.js';
import { getSensorQuip } from './fun.js';

const PAGES = {
  dashboard:     () => import('./pages/dashboard.js'),
  electrical:    () => import('./pages/electrical.js'),
  tanks:         () => import('./pages/tanks.js'),
  engine:        () => import('./pages/engine.js'),
  webasto:       () => import('./pages/webasto.js'),
  weather:       () => import('./pages/weather.js'),
  events:        () => import('./pages/events.js'),
  charts:        () => import('./pages/charts.js'),
  trips:         () => import('./pages/trips.js'),
  costs:         () => import('./pages/costs.js'),
  scanner:       () => import('./pages/scanner.js'),
  assistant:     () => import('./pages/assistant.js'),
  docs:          () => import('./pages/docs.js'),
  maintenance:   () => import('./pages/maintenance.js'),
  vessel:        () => import('./pages/vessel.js?v=9'),
  system:        () => import('./pages/system.js'),
  cameras:       () => import('./pages/cameras.js'),
  fuel_efficiency: () => import('./pages/fuel_efficiency.js'),
  sauna:         () => import('./pages/sauna.js'),
};

const SK_PAGES = ['dashboard', 'electrical', 'tanks', 'engine'];

// Bakoverkompatibel ruting: gamle #map-lenker → trips-siden
const PAGE_ALIASES = { map: 'trips' };

let _currentPage   = null;
let _currentModule = null;
const _cache = {};

// Auto-detect backend_url: lokalt → localhost:3001, deployed → samme origin.
// Unngår at alle 20 filer må oppdateres med fallback-logikk.
function bootstrapBackendUrl() {
  const stored   = localStorage.getItem('backend_url');
  const { hostname, origin } = window.location;
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';

  // Lagret localhost-URL mens vi kjører fra en annen host (f.eks. Cerbo) → utdatert, nullstill
  if (stored && /localhost|127\.0\.0\.1/.test(stored) && !isLoopback) {
    localStorage.removeItem('backend_url');
  } else if (stored) {
    return;  // respekter brukerens egen konfig
  }

  // localhost/127.0.0.1 → dev-backend; alt annet (inkl. Cerbo 192.168.x.x) → same origin
  localStorage.setItem('backend_url', isLoopback ? 'http://localhost:3001' : origin);
}

export async function init() {
  bootstrapBackendUrl();
  registerServiceWorker();
  setupNav();
  SK.start();
  SK.on('connect',    () => updateSkStatus(true));
  SK.on('disconnect', () => updateSkStatus(false));
  SK.on('update',     onSkUpdate);
  const hash = location.hash.replace('#','') || 'dashboard';
  await showPage(hash);
  setInterval(recordSensors, 60000);
  setupPushUI();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').then(reg => {
    // Lytt etter ny SW som venter
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      newSW?.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          // Ny versjon klar — vis toast og last om
          const t = document.createElement('div');
          t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;background:var(--blue);color:#fff;padding:12px 20px;font-family:Barlow Condensed,sans-serif;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:12px;box-shadow:0 4px 16px rgba(0,0,0,.2)';
          t.innerHTML = '<span>Ny versjon tilgjengelig</span><button onclick="location.reload()" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;font-family:inherit;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;cursor:pointer">Oppdater</button>';
          document.body.appendChild(t);
        }
      });
    });
  }).catch(() => {});
}

function setupNav() {
  document.querySelectorAll('[data-page],[data-sidebar-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page || btn.dataset.sidebarPage;
      location.hash = page;
      showPage(page);
    });
  });
  window.addEventListener('hashchange', () => {
    const page = location.hash.replace('#','') || 'dashboard';
    showPage(page);
  });
}

export async function showPage(id) {
  if (PAGE_ALIASES[id]) id = PAGE_ALIASES[id];
  if (!PAGES[id]) id = 'dashboard';
  if (_currentModule?.onHide) _currentModule.onHide();
  _currentPage = id;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const container = document.getElementById('page-' + id);
  if (container) container.classList.add('active');
  document.querySelectorAll('[data-page],[data-sidebar-page]').forEach(b => {
    const p = b.dataset.page || b.dataset.sidebarPage;
    b.classList.toggle('active', p === id);
  });
  if (!_cache[id]) _cache[id] = await PAGES[id]();
  _currentModule = _cache[id];
  if (container && _currentModule.render) await _currentModule.render(container);
  if (_currentModule.onShow) _currentModule.onShow();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

let _lastQuipUpdate = 0;

function onSkUpdate(state) {
  const now = Date.now();
  if (now - _lastQuipUpdate > 30_000) {
    _lastQuipUpdate = now;
    const quipEl = document.getElementById('hdr-quip');
    if (quipEl) {
      quipEl.style.opacity = '0';
      setTimeout(() => {
        quipEl.textContent = getSensorQuip(state);
        quipEl.style.opacity = '1';
      }, 200);
    }
  }
  if (SK_PAGES.includes(_currentPage) && _currentModule?.onSkUpdate) {
    _currentModule.onSkUpdate(state);
  }
}

function updateSkStatus(connected) {
  const dot = document.getElementById('sk-dot');
  const txt = document.getElementById('sk-txt');
  if (dot) dot.className = 'sk-dot ' + (connected ? 'live' : 'offline');
  if (txt) txt.textContent = connected ? 'Live' : 'Offline';
}

async function recordSensors() {
  if (!SK.isConnected()) return;
  const s  = SK.getState();
  const ts = new Date().toISOString();
  const PATHS = [
    { path: 'electrical.batteries.279.capacity.stateOfCharge', unit: 'ratio' },
    { path: 'electrical.batteries.279.voltage',                unit: 'V' },
    { path: 'electrical.batteries.279.current',                unit: 'A' },
    { path: 'electrical.batteries.279.power',                  unit: 'W' },
    { path: 'electrical.batteries.0.voltage',                  unit: 'V' },
    { path: 'tanks.fuel.0.currentLevel',                     unit: 'ratio' },
    { path: 'tanks.freshWater.0.currentLevel',               unit: 'ratio' },
    { path: 'tanks.wasteWater.0.currentLevel',               unit: 'ratio' },
    { path: 'propulsion.port.revolutions',                      unit: 'Hz' },
    { path: 'propulsion.port.temperature',               unit: 'K' },
    { path: 'propulsion.port.runTime',                          unit: 's' },
    { path: 'propulsion.port.oilTemperature',                   unit: 'K' },
    { path: 'propulsion.port.oilPressure',                      unit: 'Pa' },
    { path: 'propulsion.port.engineLoad',                       unit: 'ratio' },
    { path: 'propulsion.port.boostPressure',                    unit: 'Pa' },
    { path: 'propulsion.port.fuel.rate',                         unit: 'm3/s' },
    { path: 'propulsion.port.alternatorVoltage',             unit: 'V' },
    { path: 'navigation.speedOverGround',                    unit: 'm/s' },
    { path: 'environment.water.temperature',                 unit: 'K' },
    { path: 'environment.depth.belowTransducer',            unit: 'm' },
    { path: 'environment.wind.speedApparent',                unit: 'm/s' },
  ];
  const readings = PATHS
    .map(({ path, unit }) => ({ path, value: s[path], unit, ts }))
    .filter(r => r.value != null && isFinite(r.value));
  if (readings.length) sensors.batch(readings).catch(() => {});
}

function getBackendUrl() { return localStorage.getItem('backend_url') || 'http://localhost:3001'; }

function vapidKeyToUint8(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window))
    throw new Error('Push-varsler støttes ikke i denne nettleseren');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Tillatelse ble avslått');
  const keyRes = await fetch(`${getBackendUrl()}/api/push/vapid-public-key`);
  if (!keyRes.ok) throw new Error('Backend ikke klar for push');
  const { publicKey } = await keyRes.json();
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToUint8(publicKey) });
  const saveRes = await fetch(`${getBackendUrl()}/api/push/subscribe`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sub.toJSON()),
  });
  if (!saveRes.ok) throw new Error('Kunne ikke lagre abonnement');
  localStorage.setItem('push_enabled', '1');
  return sub;
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch(`${getBackendUrl()}/api/push/subscribe`, {
        method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  } catch {}
  localStorage.removeItem('push_enabled');
}

async function getPushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  // iOS Safari krever standalone PWA-modus før PushManager er gyldig
  const ua = navigator.userAgent;
  const isIOS = /iP(ad|hone|od)/.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isIOS && !isStandalone) return 'needs-pwa';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return 'unavailable';
  const sub = await reg.pushManager.getSubscription().catch(() => null);
  return sub ? 'active' : 'inactive';
}

async function setupPushUI() {
  const btn  = document.getElementById('cfg-push-btn');
  const info = document.getElementById('cfg-push-info');
  if (!btn || !info) return;
  const update = st => {
    btn.disabled = false;
    if (st === 'active')       { btn.textContent='Deaktiver varsler'; info.textContent='Push-varsler er aktive'; info.style.color='var(--ok)'; }
    else if (st === 'denied')  { btn.textContent='Tillatelse blokkert'; btn.disabled=true; info.textContent='Tillatelse avslått tidligere — gå til iPhone Innstillinger → Bavapp → Varsler for å aktivere igjen'; info.style.color='var(--danger)'; }
    else if (st === 'insecure') { btn.textContent='Krever HTTPS'; btn.disabled=true; info.innerHTML='Push virker bare over HTTPS. Du bruker en usikker URL. Bytt til Tailscale Funnel-URL-en (https).'; info.style.color='var(--danger)'; }
    else if (st === 'needs-pwa') { btn.textContent='Installer som PWA først'; btn.disabled=true; info.innerHTML='På iPhone må Bavapp være lagt til hjemmeskjermen før push virker.<br>Trykk <strong>Del</strong> → <strong>Legg til på Hjem-skjerm</strong>. Åpne så fra ikonet på hjemmeskjermen.'; info.style.color='var(--warn)'; }
    else if (st === 'unsupported') { btn.textContent='Ikke støttet'; btn.disabled=true; info.textContent='Nettleseren støtter ikke Web Push. Bruk Safari på iOS 16.4+ eller Chrome/Firefox på desktop.'; info.style.color='#bbb'; }
    else { btn.textContent='Aktiver varsler'; info.textContent='Motta push-varsler ved bilgepumpe, lav batteri og motoralarmer.'; info.style.color='#bbb'; }
  };
  update(await getPushStatus());
  btn.addEventListener('click', async () => {
    const cur = await getPushStatus(); btn.disabled = true;
    try {
      if (cur==='active') { await disablePush(); update('inactive'); toast('Push-varsler deaktivert'); }
      else { await enablePush(); update('active'); toast('Push-varsler aktivert ✓','ok'); }
    } catch(e) { toast('Feil: '+e.message,'err'); update(await getPushStatus()); }
    finally { btn.disabled = false; }
  });
}

export function closeSettings() {
  document.getElementById('settings-panel')?.classList.remove('open');
}

export function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container')?.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
