// pages/sauna.js — Smeigedag Sauna Bystranda · ledighet for uken
//
// Henter /api/sauna/week og rendrer 4 badstuer (Drømmeren/Oksøy × Privat/Felles)
// med 7-dagers timegrid. Klikk på en celle åpner riktig dato i periode.no
// for booking. Ledige timer er grønne, opptatte røde, tidligere nedtonet.

import { getConfig } from '../api.js';

const DAY_LABELS_NO = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
const MONTH_LABELS_NO = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

let _refreshTimer = null;

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Smeigedag Sauna · Bystranda</div>
      <div class="ph-s">Ledige tider neste 7 dager — like ved båtplassen.</div>
    </div>
    <div id="sauna-body">
      <div class="sauna-loading">Henter ledighet…</div>
    </div>

    <style>
      .sauna-loading { padding:40px 20px; text-align:center; color:var(--ink-light); font-size:13px; }
      .sauna-error {
        padding:16px; margin:12px 0; border:1px solid var(--danger);
        background:rgba(176,16,32,.06); color:var(--danger);
        font-size:12px; line-height:1.5;
      }
      .sauna-meta {
        display:flex; align-items:center; justify-content:space-between;
        font-family:'Barlow Condensed',sans-serif; font-size:11px;
        color:var(--ink-light); letter-spacing:.08em; text-transform:uppercase;
        margin-bottom:14px;
      }
      .sauna-meta a { color:var(--blue); text-decoration:none; }
      .sauna-meta a:hover { text-decoration:underline; }

      .sauna-card {
        border:1px solid var(--line); background:var(--white);
        margin-bottom:16px;
      }
      .sauna-hd {
        display:flex; align-items:center; gap:12px;
        padding:12px 14px; border-bottom:1px solid var(--line);
        background:linear-gradient(180deg, rgba(0,59,126,.04), transparent);
      }
      .sauna-hd-img {
        width:48px; height:48px; flex:0 0 48px; object-fit:cover;
        border:1px solid var(--line); background:#f0f0f0;
      }
      .sauna-hd-txt { flex:1; min-width:0; }
      .sauna-hd-name {
        font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:18px;
        color:var(--ink); letter-spacing:.02em; line-height:1.1;
      }
      .sauna-hd-sub {
        font-size:11px; color:var(--ink-light);
        font-family:'Barlow Condensed',sans-serif; letter-spacing:.06em;
        text-transform:uppercase; margin-top:2px;
      }
      .sauna-hd-tag {
        display:inline-block; padding:2px 7px; margin-right:6px;
        font-size:10px; font-weight:700; letter-spacing:.08em;
        background:var(--blue); color:#fff;
      }
      .sauna-hd-tag.felles { background:var(--ok); }
      .sauna-hd-price {
        font-family:'DM Mono',monospace; font-size:13px;
        font-weight:500; color:var(--ink); white-space:nowrap;
      }
      .sauna-hd-price-sub {
        font-size:10px; color:var(--ink-light);
        font-family:'Barlow Condensed',sans-serif; letter-spacing:.06em;
        text-transform:uppercase; text-align:right;
      }

      .sauna-empty {
        padding:18px 14px; text-align:center; color:var(--ink-light);
        font-size:12px; font-style:italic;
      }

      .sauna-week { padding:8px 10px 10px; }
      .sauna-day {
        display:grid; grid-template-columns:62px 1fr; gap:8px;
        align-items:center; padding:5px 0; border-bottom:1px dashed var(--line);
      }
      .sauna-day:last-child { border-bottom:none; }
      .sauna-day-lbl {
        font-family:'Barlow Condensed',sans-serif; font-size:11px;
        font-weight:700; letter-spacing:.06em; text-transform:uppercase;
        color:var(--ink); line-height:1.2;
      }
      .sauna-day-lbl-sub {
        font-family:'DM Mono',monospace; font-size:10px;
        color:var(--ink-light); display:block;
      }
      .sauna-day.today .sauna-day-lbl { color:var(--blue); }

      .sauna-pills {
        display:flex; flex-wrap:wrap; gap:3px;
      }
      .sauna-pill {
        flex:0 0 auto; min-width:30px; padding:4px 6px;
        font-family:'DM Mono',monospace; font-size:11px; font-weight:500;
        text-align:center; cursor:pointer; user-select:none;
        border:1px solid transparent; transition:transform .08s, filter .08s;
        text-decoration:none; color:inherit;
      }
      .sauna-pill:hover { transform:translateY(-1px); filter:brightness(1.05); }
      .sauna-pill.free {
        background:rgba(26,112,64,.12); color:var(--ok);
        border-color:rgba(26,112,64,.3);
      }
      .sauna-pill.full {
        background:rgba(176,16,32,.08); color:rgba(176,16,32,.6);
        border-color:rgba(176,16,32,.2); cursor:default;
      }
      .sauna-pill.past {
        background:transparent; color:rgba(0,0,0,.25);
        border-color:rgba(0,0,0,.08); cursor:default;
      }
      [data-theme="dark"] .sauna-pill.past { color:rgba(255,255,255,.25); border-color:rgba(255,255,255,.1); }

      .sauna-empty-day {
        font-size:11px; font-style:italic; color:var(--ink-light);
        padding:3px 6px;
      }

      .sauna-legend {
        display:flex; gap:14px; padding:8px 14px;
        font-family:'Barlow Condensed',sans-serif; font-size:11px;
        color:var(--ink-light); letter-spacing:.06em; text-transform:uppercase;
        border-top:1px solid var(--line); background:rgba(0,0,0,.015);
      }
      .sauna-legend-dot {
        display:inline-block; width:10px; height:10px; margin-right:4px;
        border:1px solid; vertical-align:-1px;
      }
      .sauna-legend-dot.free { background:rgba(26,112,64,.2); border-color:var(--ok); }
      .sauna-legend-dot.full { background:rgba(176,16,32,.15); border-color:var(--danger); }
      .sauna-legend-dot.past { background:transparent; border-color:rgba(0,0,0,.2); }

      .sauna-card-foot {
        padding:10px 14px; border-top:1px solid var(--line);
        text-align:center; font-size:11px;
      }
      .sauna-card-foot a {
        display:inline-block; padding:6px 14px; background:var(--blue);
        color:#fff; text-decoration:none;
        font-family:'Barlow Condensed',sans-serif; font-weight:700;
        font-size:11px; letter-spacing:.1em; text-transform:uppercase;
      }
      .sauna-card-foot a:hover { background:#002a5c; }
    </style>
  `;

  await load(container);
  // Auto-refresh hvert 90s mens siden er synlig
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(() => {
    if (document.getElementById('page-sauna')?.classList.contains('active')) {
      load(container).catch(() => {});
    }
  }, 90_000);
}

export function onHide() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
}

async function load(container) {
  const body = container.querySelector('#sauna-body');
  try {
    const r = await fetch(`${getConfig().backend}/api/sauna/week?days=7`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    body.innerHTML = renderWeek(data);
  } catch (e) {
    body.innerHTML = `
      <div class="sauna-error">
        Kunne ikke hente ledighet fra periode.no: ${escapeHtml(e.message)}.<br>
        Prøv igjen om litt, eller åpne <a href="https://www.smeigedagsauna.no/no/kristiansand" target="_blank" rel="noopener" style="color:var(--danger);text-decoration:underline">smeigedagsauna.no</a> direkte.
      </div>
    `;
  }
}

function renderWeek(data) {
  const { saunas = [], fetchedAt, today, hourNow } = data;
  if (!saunas.length) {
    return '<div class="sauna-empty">Ingen badstuer å vise.</div>';
  }

  const fetchedTime = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return `
    <div class="sauna-meta">
      <span>Oppdatert ${escapeHtml(fetchedTime)} · kl. ${hourNow ?? '?'} nå</span>
      <a href="https://www.smeigedagsauna.no/no/kristiansand" target="_blank" rel="noopener">smeigedagsauna.no →</a>
    </div>
    ${saunas.map(s => renderSauna(s, today)).join('')}
  `;
}

function renderSauna(s, today) {
  const tagClass  = s.kind === 'Felles' ? 'felles' : '';
  const priceTxt  = s.priceNok != null ? `${s.priceNok.toLocaleString('nb-NO')} kr` : '—';
  const capTxt    = s.capacity ? `· kap. ${s.capacity}` : '';
  const totalOpen = (s.days || []).reduce((sum, d) => sum + (d.openSlots || 0), 0);

  const body = totalOpen === 0 && allEmpty(s.days)
    ? `<div class="sauna-empty">Ingen tider tilgjengelig denne uka.</div>`
    : `<div class="sauna-week">${(s.days || []).map(d => renderDay(s, d, today)).join('')}</div>`;

  return `
    <div class="sauna-card">
      <div class="sauna-hd">
        ${s.imageUrl ? `<img class="sauna-hd-img" src="${escapeAttr(s.imageUrl)}" alt="" loading="lazy">` : '<div class="sauna-hd-img"></div>'}
        <div class="sauna-hd-txt">
          <div class="sauna-hd-name">
            <span class="sauna-hd-tag ${tagClass}">${escapeHtml(s.kind)}</span>${escapeHtml(s.name)}
          </div>
          <div class="sauna-hd-sub">Bystranda ${capTxt}</div>
        </div>
        <div>
          <div class="sauna-hd-price">${escapeHtml(priceTxt)}</div>
          <div class="sauna-hd-price-sub">per time</div>
        </div>
      </div>
      ${body}
      <div class="sauna-legend">
        <span><span class="sauna-legend-dot free"></span>Ledig</span>
        <span><span class="sauna-legend-dot full"></span>Opptatt</span>
        <span><span class="sauna-legend-dot past"></span>Tidligere</span>
      </div>
      <div class="sauna-card-foot">
        <a href="${escapeAttr(s.bookingUrl)}" target="_blank" rel="noopener">Book på periode.no</a>
      </div>
    </div>
  `;
}

function allEmpty(days) {
  return (days || []).every(d => !d.totalSlots);
}

function renderDay(sauna, day, today) {
  const isToday = day.date === today;
  const lbl     = formatDayLabel(day.date, isToday);
  const cells   = (day.slots || []).map(slot => {
    const cls = slot.isPast ? 'past' : (slot.isFull ? 'full' : 'free');
    const url = `https://minside.periode.no/bookinggroups/${escapeAttr(getMerchantId())}/${escapeAttr(sauna.groupId)}/${escapeAttr(day.date)}`;
    const titleParts = [
      `${pad(slot.time)}:00–${pad(slot.time + slot.length)}:00`,
      slot.isPast ? '(passert)' :
        slot.isFull ? 'Fullbooket' :
          `${slot.available} ledig${slot.available === 1 ? '' : 'e'}`,
      slot.priceNok != null ? `${slot.priceNok.toLocaleString('nb-NO')} kr` : '',
    ].filter(Boolean);
    const title = titleParts.join(' · ');

    if (cls === 'free') {
      return `<a class="sauna-pill free" href="${url}" target="_blank" rel="noopener" title="${escapeAttr(title)}">${pad(slot.time)}</a>`;
    }
    return `<span class="sauna-pill ${cls}" title="${escapeAttr(title)}">${pad(slot.time)}</span>`;
  }).join('') || '<span class="sauna-empty-day">Ingen åpne tider</span>';

  return `
    <div class="sauna-day ${isToday ? 'today' : ''}">
      <div class="sauna-day-lbl">
        ${escapeHtml(lbl.weekday)}
        <span class="sauna-day-lbl-sub">${escapeHtml(lbl.short)}</span>
      </div>
      <div class="sauna-pills">${cells}</div>
    </div>
  `;
}

// MerchantId er hardkodet både i backend og her — Smeigedag.
function getMerchantId() { return 'YAadvG0POHdhx6Mf3qfI'; }

function formatDayLabel(dateStr, isToday) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Lokal Date for dagnavn — vi rendrer kun datostrengen, ingen TZ-arithmetic.
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  return {
    weekday: isToday ? 'I dag' : DAY_LABELS_NO[dow],
    short:   `${d}. ${MONTH_LABELS_NO[m - 1]}`,
  };
}

function pad(n) { return String(n).padStart(2, '0'); }

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }
