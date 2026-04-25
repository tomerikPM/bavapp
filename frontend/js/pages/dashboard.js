// pages/dashboard.js — live sensoroversikt
import * as SK from '../signalk.js';
import { maintenance } from '../api.js';

export async function render(container) {

  container.innerHTML = `
    <div class="sl">Live sensordata</div>
    <div class="sgrid" id="dash-sensors">
      ${sc('soc',      'Batteri SOC',  '—', '',        'Victron',   'wn')}
      ${sc('volt',     'Spenning',     '—', '',        'Victron',   'wn')}
      ${sc('cur',      'Batteristrøm','—', '',         'Victron',   '')}
      ${sc('fuel',     'Dieseltank',   '—', '',        'NMEA 2000', '')}
      ${sc('coolant',  'Kjølevann',   '—', '',        'NMEA 2000', '')}
      ${sc('rpm',      'Motor RPM',   '—', 'rpm',     'NMEA 2000', '')}
      ${sc('hours',    'Gangtimer',   '1 085', 'timer','Signal K',  'ok')}
      ${sc('shore',    'Landstrøm',   '—', '',        'Signal K',  '')}
      ${sc('watertemp','Sjøtemp.',    '—', '',        'Signal K',  '')}
      ${sc('depth',    'Dybde',       '—', '',        'Signal K',  '')}
    </div>

    <div class="sl">Vær nå</div>
    <div id="dash-wx-mini"><div class="wx-load"><div class="spin"></div>Henter vær…</div></div>

    <div class="sl">Ruter</div>
    <a href="#system" class="rt-widget" id="dash-router">
      <div class="rt-widget-main">
        <span class="rt-widget-icon" id="rt-w-icon">📡</span>
        <div class="rt-widget-body">
          <div class="rt-widget-title" id="rt-w-title">Henter status…</div>
          <div class="rt-widget-sub"   id="rt-w-sub"></div>
        </div>
      </div>
      <span class="rt-widget-chev">→</span>
    </a>

    <div class="sl">Prioriterte oppgaver</div>
    <div id="dash-mx"><div class="wx-load"><div class="spin"></div></div></div>

  <style>
    /* Ruter-widget */
    .rt-widget {
      display:flex; align-items:center; justify-content:space-between; gap:12px;
      padding:10px 14px; background:var(--white); border:1px solid var(--line);
      border-left:3px solid var(--ink-light); margin-bottom:8px;
      text-decoration:none; color:inherit; cursor:pointer;
      transition: background .15s, border-color .15s;
    }
    .rt-widget:hover { background:var(--surface); border-left-color:var(--blue); }
    .rt-widget-main { display:flex; align-items:center; gap:10px; min-width:0; }
    .rt-widget-icon { font-size:1.3rem; }
    .rt-widget-body { min-width:0; }
    .rt-widget-title { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; letter-spacing:.04em; color:var(--ink); }
    .rt-widget-sub { font-size:11px; color:var(--ink-light); margin-top:1px; }
    .rt-widget-chev { color:var(--ink-light); font-size:16px; }
    .rt-widget.rt-w-excellent { border-left-color:#4caf50; }
    .rt-widget.rt-w-good      { border-left-color:#8bc34a; }
    .rt-widget.rt-w-fair      { border-left-color:#ffc107; }
    .rt-widget.rt-w-poor      { border-left-color:#ff9800; }
    .rt-widget.rt-w-offline   { border-left-color:#9e9e9e; }

    .fun-card { background: var(--white); border: 1px solid var(--line); padding: 12px 14px; margin: 4px 0; }
    .fun-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .fun-card-title { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
    .fun-haiku { border-left: 3px solid #7b1fa2; }
    .fun-haiku-text { font-size: 12.5px; line-height: 2; color: var(--ink-light); font-style: italic; white-space: pre-line; min-height: 32px; }
    .fun-haiku-text.loaded { color: var(--ink); font-style: normal; font-family: 'Barlow Condensed', sans-serif; font-weight: 500; font-size: 1rem; letter-spacing: .02em; }
    .fun-rule { border-left: 3px solid var(--ok); }
    .fun-rule-num { font-size: 9.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--ok); margin-bottom: 5px; }
    .fun-rule-text { font-size: 13px; color: var(--ink); line-height: 1.55; }
  </style>`;

  loadMaintenanceList();
  loadWeatherMini();
  loadRouterWidget();

  const state = SK.getState();
  if (Object.keys(state).length) onSkUpdate(state);
}

// ── Ruter-widget ──────────────────────────────────────────────────────────
async function loadRouterWidget() {
  const BASE = localStorage.getItem('backend_url') || 'http://localhost:3001';
  const widget = document.getElementById('dash-router');
  const iconEl = document.getElementById('rt-w-icon');
  const titleEl = document.getElementById('rt-w-title');
  const subEl = document.getElementById('rt-w-sub');
  if (!widget) return;

  try {
    const r = await fetch(`${BASE}/api/router/status`);
    const d = await r.json();
    if (!d.reachable) {
      widget.classList.add('rt-w-offline');
      iconEl.textContent = '🔌';
      titleEl.textContent = 'Ruter ikke tilgjengelig';
      subEl.textContent = d.config?.passSet ? 'Kan ikke nå RUT200' : 'ROUTER_PASS ikke satt';
      return;
    }
    const m = d.mobile || {};
    const w = d.wan || {};
    const dbm = m.signal;
    let cls = 'rt-w-offline';
    if (dbm != null) {
      if (dbm >= -70) cls = 'rt-w-excellent';
      else if (dbm >= -85) cls = 'rt-w-good';
      else if (dbm >= -100) cls = 'rt-w-fair';
      else cls = 'rt-w-poor';
    }
    widget.classList.add(cls);
    iconEl.textContent = '📡';
    const signalStr = dbm != null ? `${dbm} dBm` : '—';
    titleEl.textContent = `${m.networkType || 'Ukjent'} · ${signalStr}`;
    subEl.textContent = `${m.operator || ''} · WAN ${w.proto || '—'}${w.up ? ' ✓' : ''}`;
  } catch {
    widget.classList.add('rt-w-offline');
    iconEl.textContent = '🔌';
    titleEl.textContent = 'Ruter ikke tilgjengelig';
    subEl.textContent = 'Kan ikke kontakte backend';
  }
}

// ── Haiku ─────────────────────────────────────────────────────────────────────
async function onHaikuClick() {
  if (_haikuLoading) return;
  _haikuLoading = true;
  const btn  = document.getElementById('haiku-btn');
  const text = document.getElementById('haiku-text');
  if (btn)  btn.textContent = '…';
  if (text) { text.textContent = 'Spør Summer om tillatelse…'; text.classList.remove('loaded'); }
  try {
    const haiku = await generateHaiku(SK.getState());
    if (text) { text.textContent = haiku; text.classList.add('loaded'); }
    if (btn)  btn.textContent = 'Ny haiku';
  } catch (e) {
    if (text) text.textContent = e.message;
    if (btn)  btn.textContent = 'Prøv igjen';
  } finally {
    _haikuLoading = false;
  }
}

// ── Live SK ───────────────────────────────────────────────────────────────────
export function onSkUpdate(state) {
  set('soc',
    SK.get.houseSoc(state), '%', 'husbatteri',
    v => v < 20 ? 'cr' : v < 30 ? 'wn' : 'ok', v => v);

  set('volt',
    SK.get.houseVolt(state)?.toFixed(1), ' V', 'batteri',
    v => parseFloat(v) < 12.0 ? 'cr' : parseFloat(v) < 12.4 ? 'wn' : 'ok');

  const cur = SK.get.houseCurrent(state);
  setRaw('cur',
    cur != null ? (cur > 0 ? '+' : '') + cur.toFixed(1) + ' A' : '—',
    cur != null ? (cur > 0 ? 'lader' : 'forbruker') : '',
    cur != null ? (cur > 0 ? 'ok' : cur < -20 ? 'wn' : '') : '');

  set('fuel',
    SK.get.fuelPct(state), '%',
    SK.get.fuelLitres(state) != null ? SK.get.fuelLitres(state) + ' liter' : '',
    v => v < 20 ? 'wn' : 'ok', v => v);

  set('coolant',
    SK.get.coolant(state), '°C', 'kjølevann',
    v => v > 95 ? 'cr' : v > 85 ? 'wn' : 'ok');

  set('rpm',
    SK.get.rpm(state)?.toLocaleString('no'), '', 'rpm',
    v => parseInt(v) > 0 ? 'ok' : '');

  const hrs = SK.get.engineHours(state);
  if (hrs != null) setRaw('hours', Math.round(hrs).toLocaleString('no'), 'timer', 'ok');

  const shore = SK.get.shorepower(state);
  setRaw('shore',
    shore == null ? '—' : shore ? 'Tilkoblet' : 'Frakoblet',
    shore == null ? 'ukjent' : '',
    shore ? 'ok' : '');

  const wt = SK.get.waterTempC(state);
  setRaw('watertemp', wt != null ? wt + '°C' : '—', 'overflate', '');

  const depth = SK.get.waterDepth(state);
  setRaw('depth', depth != null ? depth + ' m' : '—', 'under kjøl',
    depth != null && depth < 3 ? 'wn' : '');
}

// ── Hjelpere ──────────────────────────────────────────────────────────────────
function sc(id, label, val, unit, source, cls) {
  return `
    <div class="sc">
      <div class="sc-line ${cls}" id="scl-${id}"></div>
      <div class="sc-src">${source}</div>
      <div class="sc-lbl">${label}</div>
      <div class="sc-v ${cls}" id="scv-${id}">${val}</div>
      <div class="sc-u" id="scu-${id}">${unit}</div>
      <div class="sc-bar" id="scbar-${id}" style="display:none">
        <div class="sc-bf ok" id="scbf-${id}" style="width:0%"></div>
      </div>
    </div>`;
}

function set(id, val, suffix, unit, clsFn, barFn) {
  const display = val != null ? val + suffix : '—';
  const cls     = val != null && clsFn ? clsFn(val) : '';
  setRaw(id, display, val != null && typeof unit === 'string' ? unit : (unit || ''), cls);
  if (val != null && barFn) {
    const bar = document.getElementById('scbar-' + id);
    const bf  = document.getElementById('scbf-'  + id);
    if (bar && bf) { bar.style.display = ''; bf.style.width = Math.min(100, barFn(val)) + '%'; }
  }
}

function setRaw(id, val, unit, cls) {
  const v = document.getElementById('scv-' + id);
  const u = document.getElementById('scu-' + id);
  const l = document.getElementById('scl-' + id);
  if (v) { v.textContent = val; v.className = 'sc-v ' + cls; }
  if (u) u.textContent = unit;
  if (l) l.className = 'sc-line ' + cls;
}

async function loadMaintenanceList() {
  const box = document.getElementById('dash-mx');
  if (!box) return;
  try {
    const { data } = await maintenance.list({ status: 'open', limit: 4 });
    if (!data.length) { box.innerHTML = '<div class="empty">Ingen åpne oppgaver 🎉</div>'; return; }
    box.innerHTML = data.map(m => `
      <div class="dui">
        <div class="dub ${m.priority === 'critical' ? 'c' : m.priority === 'high' ? 'h' : 'm'}"></div>
        <div style="flex:1;min-width:0">
          <div class="dun">${m.title}</div>
          <div class="dum">${m.notes || m.description || ''}</div>
        </div>
        <div class="dur">
          <span class="pill ${m.priority === 'critical' ? 'pc' : m.priority === 'high' ? 'pw' : 'pi'}">
            ${m.priority}
          </span>
        </div>
      </div>`).join('');
  } catch {
    box.innerHTML = `<div class="empty">Vedlikehold ikke tilgjengelig</div>`;
  }
}

async function loadWeatherMini() {
  const box = document.getElementById('dash-wx-mini');
  if (!box) return;
  try {
    const { fetchAndRenderMini } = await import('./weather.js');
    fetchAndRenderMini(box);
  } catch {}
}
