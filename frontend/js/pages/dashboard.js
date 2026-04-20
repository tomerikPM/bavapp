// pages/dashboard.js — live sensoroversikt
import * as SK from '../signalk.js';
import { maintenance } from '../api.js';
import { fetchTides, fetchSunrise } from '../fun.js';

let _sunTideLoaded = false;

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

    <div class="sl">Prioriterte oppgaver</div>
    <div id="dash-mx"><div class="wx-load"><div class="spin"></div></div></div>

  <style>
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

  if (!_sunTideLoaded) {
    _sunTideLoaded = true;
    loadHeaderSunTide();
  }

  const state = SK.getState();
  if (Object.keys(state).length) onSkUpdate(state);
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

// ── Sol og tidevann → header ──────────────────────────────────────────────────
async function loadHeaderSunTide() {
  const lat = parseFloat(localStorage.getItem('wx_lat') || '58.15');
  const lon = parseFloat(localStorage.getItem('wx_lon') || '7.99');

  fetchSunrise(lat, lon)
    .then(({ sunrise, sunset }) => { setHdr('rise', sunrise); setHdr('set', sunset); })
    .catch(() => {});

  fetchTides(lat, lon)
    .then(({ nextHigh, nextLow }) => {
      const fmt = p => {
        if (!p) return '—';
        const tid = new Date(p.t).toLocaleTimeString('no', { hour:'2-digit', minute:'2-digit' });
        return p.v != null ? `${tid} ${Math.round(p.v)}cm` : tid;
      };
      setHdr('hv', fmt(nextHigh));
      setHdr('lv', fmt(nextLow));
    })
    .catch(e => console.warn('[tide]', e.message));
}

function setHdr(key, val) {
  const el = document.getElementById('hm-' + key);
  if (el) el.textContent = val;
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
  setRaw('shore', shore ? 'Tilkoblet' : 'Frakoblet', '', shore ? 'ok' : '');

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
