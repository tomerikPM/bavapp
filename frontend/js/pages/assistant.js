// pages/assistant.js — Summer-assistent · AI-chat med båtkontekst
import * as SK from '../signalk.js';
import { trips, costs, maintenance, parts } from '../api.js';
import { toast } from '../app.js';

let _history = [];   // { role, content, ts }
let _thinking = false;

const BOAT_CONTEXT = `Du er Summer-assistent, en AI-assistent innebygd i BavApp ombord på Bavaria Sport 32 "Summer" (reg. FAR999).

Båten tilhører familien Thorsen. Faste passasjerer:
- Tom Erik (mann, 46) — eier og skipper
- Mailinn (kvinne, 40)
- Eva (jente, 14)
- Erik (gutt, 13)
- Isak (gutt, 11)
- Liv (jente, 9)

Teknisk:
- Motor: Volvo Penta D6 330 hk, drev DP-D 1.76
- Dieseltank: 370 liter
- Husbatterier: 4× LiFePO4 100Ah (400Ah total)
- Topphastighet: ~32 knop, cruising ~22–25 knop
- Hjemmehavn: Kristiansand (58.15°N, 7.99°Ø)
- Omtrentlig forbruk: 35–40 L/t ved 22 kn, 55–65 L/t ved full gass

Svar alltid på norsk, vær konsis og praktisk. Bruk maritim terminologi. 
Når du regner på rekkevidde, ta hensyn til sikkerhetsmargin (behold minst 50L reserve).
Du har tilgang til live sensordata, turhistorikk og kostnadsoversikt — bruk dem aktivt.`;

export async function render(container) {
  container.innerHTML = `
    <div class="asst-shell">

      <!-- Header-kort med status -->
      <div class="asst-status" id="asst-status">
        <div class="asst-status-dot" id="asst-dot"></div>
        <div class="asst-status-info" id="asst-status-info">Henter båtstatus…</div>
      </div>

      <!-- Meldings-historikk -->
      <div class="asst-messages" id="asst-messages">
        <div class="asst-welcome">
          <div class="asst-welcome-icon">⛵</div>
          <div class="asst-welcome-title">Hva kan jeg hjelpe deg med?</div>
          <div class="asst-welcome-sub">Jeg har tilgang til live sensordata, vær, turhistorikk og kostnader.</div>
          <div class="asst-suggestions" id="asst-suggestions">
            ${suggestions().map(s => `
              <button class="asst-sug" data-q="${s}">${s}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Input-rad -->
      <div class="asst-input-row">
        <textarea
          class="asst-input"
          id="asst-input"
          placeholder="Spør om båten, været, drivstoff, turer…"
          rows="1"
        ></textarea>
        <button class="asst-send" id="asst-send" title="Send">↑</button>
      </div>

      <div class="asst-footer">
        Summer-assistenten bruker Claude (Anthropic) · Live data fra Signal K
        <button class="asst-clear" id="asst-clear">Ny samtale</button>
      </div>

    </div>

  <style>
    .asst-shell {
      display: flex; flex-direction: column;
      height: calc(100vh - var(--hdr-h) - var(--sat) - var(--nav-h) - var(--sab) - 3px);
      margin: -20px -16px;
      overflow: hidden;
    }
    @media(min-width:600px){ .asst-shell { margin: -28px -28px; } }

    /* Status-stripe */
    .asst-status {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 16px; border-bottom: 1px solid var(--line);
      background: var(--surface); flex-shrink: 0; flex-wrap: wrap;
    }
    .asst-status-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #bbb; flex-shrink: 0;
    }
    .asst-status-dot.live { background: #5de8a0; }
    .asst-status-info {
      font-size: 11px; color: var(--ink-light);
      font-family: 'Barlow Condensed', sans-serif;
      letter-spacing: .06em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* Meldingsvindu */
    .asst-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .asst-welcome {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center; padding: 20px 0;
    }
    .asst-welcome-icon { font-size: 2.5rem; margin-bottom: 12px; }
    .asst-welcome-title {
      font-family: 'Barlow Condensed', sans-serif; font-weight: 700;
      font-size: 1.1rem; letter-spacing: .06em; text-transform: uppercase;
      color: var(--ink); margin-bottom: 6px;
    }
    .asst-welcome-sub { font-size: 12px; color: var(--ink-light); margin-bottom: 20px; }
    .asst-suggestions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
    .asst-sug {
      font-family: 'Barlow', sans-serif; font-size: 12px; font-weight: 500;
      padding: 7px 14px; border: 1px solid var(--line);
      background: var(--white); color: var(--ink); cursor: pointer;
      border-radius: 99px; transition: border-color .15s;
      text-align: left;
    }
    .asst-sug:hover { border-color: var(--blue); color: var(--blue); }

    /* Meldingsbobler */
    .asst-msg { display: flex; gap: 10px; align-items: flex-start; }
    .asst-msg.user { flex-direction: row-reverse; }
    .asst-avatar {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: .8rem; font-weight: 700;
    }
    .asst-avatar.ai  { background: var(--blue); color: #fff; }
    .asst-avatar.usr { background: var(--line); color: var(--ink); }
    .asst-bubble {
      max-width: 78%; padding: 10px 14px;
      font-size: 13px; line-height: 1.65; color: var(--ink);
    }
    .asst-msg.ai   .asst-bubble { background: var(--white); border: 1px solid var(--line); border-radius: 0 8px 8px 8px; }
    .asst-msg.user .asst-bubble { background: var(--blue); color: #fff; border-radius: 8px 0 8px 8px; }
    .asst-bubble p { margin: 0 0 6px; }
    .asst-bubble p:last-child { margin-bottom: 0; }
    .asst-bubble ul, .asst-bubble ol { margin: 6px 0 6px 16px; }
    .asst-bubble li { margin-bottom: 3px; }
    .asst-bubble strong { font-weight: 600; }
    .asst-bubble code {
      font-family: 'DM Mono', monospace; font-size: 11px;
      background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 3px;
    }
    .asst-msg.user .asst-bubble code { background: rgba(255,255,255,.15); }
    .asst-ts {
      font-size: 9.5px; color: var(--ink-light); margin-top: 4px;
      font-family: 'Barlow Condensed', sans-serif; letter-spacing: .04em;
    }
    .asst-msg.user .asst-ts { text-align: right; }

    /* Skriver-indikator */
    .asst-typing { display: flex; align-items: center; gap: 4px; padding: 8px 0; }
    .asst-typing span {
      width: 6px; height: 6px; border-radius: 50%; background: #bbb;
      animation: blink 1.4s infinite both;
    }
    .asst-typing span:nth-child(2) { animation-delay: .2s; }
    .asst-typing span:nth-child(3) { animation-delay: .4s; }
    @keyframes blink { 0%,80%,100%{opacity:.2} 40%{opacity:1} }

    /* Input */
    .asst-input-row {
      display: flex; align-items: flex-end; gap: 8px;
      padding: 10px 16px; border-top: 1px solid var(--line);
      background: var(--white); flex-shrink: 0;
    }
    .asst-input {
      flex: 1; border: 1.5px solid var(--line); border-radius: 8px;
      padding: 10px 14px; font-family: 'Barlow', sans-serif; font-size: 14px;
      resize: none; outline: none; max-height: 120px; overflow-y: auto;
      background: var(--surface); color: var(--ink); line-height: 1.5;
    }
    .asst-input:focus { border-color: var(--blue); background: var(--white); }
    .asst-send {
      width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
      background: var(--blue); border: none; color: #fff;
      font-size: 1.1rem; cursor: pointer; transition: background .15s;
      display: flex; align-items: center; justify-content: center;
    }
    .asst-send:hover { background: var(--blue-hover); }
    .asst-send:disabled { background: #bbb; cursor: default; }

    .asst-footer {
      font-size: 10px; color: #ccc; text-align: center;
      padding: 5px 16px 8px; display: flex; align-items: center;
      justify-content: center; gap: 12px; flex-shrink: 0;
      background: var(--white);
    }
    .asst-clear {
      font-size: 10px; color: var(--ink-light); background: none;
      border: none; cursor: pointer; padding: 2px 0; text-decoration: underline;
    }
    .asst-clear:hover { color: var(--danger); }
  </style>`;

  setupUI();
  updateStatusBar();
}

// ── UI-oppsett ─────────────────────────────────────────────────────────────────
function setupUI() {
  const input  = document.getElementById('asst-input');
  const sendBtn= document.getElementById('asst-send');

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  // Send på Enter (Shift+Enter = ny linje)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  // Foreslåtte spørsmål
  document.getElementById('asst-suggestions')?.addEventListener('click', e => {
    const btn = e.target.closest('.asst-sug');
    if (!btn) return;
    input.value = btn.dataset.q;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    sendMessage();
  });

  // Ny samtale
  document.getElementById('asst-clear').addEventListener('click', () => {
    _history = [];
    const msgs = document.getElementById('asst-messages');
    msgs.innerHTML = `
      <div class="asst-welcome">
        <div class="asst-welcome-icon">⛵</div>
        <div class="asst-welcome-title">Hva kan jeg hjelpe deg med?</div>
        <div class="asst-welcome-sub">Jeg har tilgang til live sensordata, vær, turhistorikk og kostnader.</div>
        <div class="asst-suggestions">
          ${suggestions().map(s => `<button class="asst-sug" data-q="${s}">${s}</button>`).join('')}
        </div>
      </div>`;
    document.getElementById('asst-suggestions')?.addEventListener('click', e => {
      const btn = e.target.closest('.asst-sug');
      if (!btn) return;
      input.value = btn.dataset.q;
      sendMessage();
    });
  });
}

// ── Statuslinje ─────────────────────────────────────────────────────────────────
function updateStatusBar() {
  const s = SK.getState();
  const dot = document.getElementById('asst-dot');
  const info= document.getElementById('asst-status-info');
  if (!dot || !info) return;

  if (SK.isConnected()) {
    dot.classList.add('live');
    const fuel = SK.get.fuelLitres(s);
    const soc  = SK.get.houseSoc(s);
    const rpm  = SK.get.rpm(s);
    const parts = [
      rpm > 100 ? `Motor på · ${rpm.toLocaleString('no')} RPM` : 'Motor av',
      fuel != null ? `Diesel ${fuel} L` : null,
      soc  != null ? `Batteri ${soc}%` : null,
    ].filter(Boolean);
    info.textContent = parts.join(' · ');
  } else {
    dot.classList.remove('live');
    info.textContent = 'Signal K ikke tilkoblet · Historiske data tilgjengelig';
  }
}

// ── Sende melding ──────────────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('asst-input');
  const text  = input.value.trim();
  if (!text || _thinking) return;

  const apiKey = localStorage.getItem('api_key');
  if (!apiKey) {
    toast('API-nøkkel mangler — legg inn i ⚙ Innstillinger', 'err');
    return;
  }

  // Fjern velkomstskjerm
  const welcome = document.querySelector('.asst-welcome');
  if (welcome) welcome.remove();

  input.value = '';
  input.style.height = 'auto';
  _thinking = true;
  document.getElementById('asst-send').disabled = true;

  // Legg til brukermelding
  appendMessage('user', text);

  // Vis skriver-indikator
  const typingId = 'typing-' + Date.now();
  appendTyping(typingId);

  // Bygg kontekst
  const systemPrompt = await buildSystemPrompt();

  // Historikk til API
  _history.push({ role: 'user', content: text });
  const apiMessages = _history.slice(-12); // maks 12 meldinger (6 frem og tilbake)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: apiMessages,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);

    const reply = data.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') || '(intet svar)';
    _history.push({ role: 'assistant', content: reply });

    removeTyping(typingId);
    appendMessage('ai', reply);
    updateStatusBar();
  } catch (e) {
    removeTyping(typingId);
    appendMessage('ai', `⚠ Feil: ${e.message}`);
  } finally {
    _thinking = false;
    document.getElementById('asst-send').disabled = false;
    document.getElementById('asst-input')?.focus();
  }
}

// ── Bygg system prompt med live kontekst ──────────────────────────────────────
async function buildSystemPrompt() {
  const s    = SK.getState();
  const now  = new Date();
  const lines = [BOAT_CONTEXT, '', `--- LIVE STATUS (${now.toLocaleString('no')}) ---`];

  // Signal K data
  if (SK.isConnected()) {
    const fuel    = SK.get.fuelLitres(s);
    const fuelPct = SK.get.fuelPct(s);
    const soc     = SK.get.houseSoc(s);
    const volt    = SK.get.houseVolt(s);
    const cur     = SK.get.houseCurrent(s);
    const rpm     = SK.get.rpm(s);
    const cool    = SK.get.coolant(s);
    const sogKn   = SK.get.sogKnots(s);
    const wt      = SK.get.waterTempC(s);
    const depth   = SK.get.waterDepth(s);
    const wind    = SK.get.windSpeed(s);
    const shore   = SK.get.shorepower(s);
    const hrs     = SK.get.engineHours(s);
    const fuelRt  = SK.get.fuelRateLH(s);

    lines.push('Signal K tilkoblet — live data:');
    if (fuel != null)   lines.push(`  Diesel: ${fuel} L (${fuelPct}% av 370L tank)`);
    if (fuel != null)   {
      const reserve = 50;
      const available = fuel - reserve;
      const rangeNm25 = available > 0 ? Math.round(available / 38 * 22) : 0; // ~38L/t ved 22kn → nm
      const rangeNm20 = available > 0 ? Math.round(available / 28 * 20) : 0; // ~28L/t ved 20kn
      lines.push(`  Estimert rekkevidde (50L reserve): ~${rangeNm25} nm ved 22 kn, ~${rangeNm20} nm ved 20 kn`);
    }
    if (soc != null)    lines.push(`  Husbatteri: ${soc}% SOC, ${volt?.toFixed(1)}V, ${cur != null ? (cur > 0 ? '+' : '') + cur.toFixed(1) + 'A' : '—'}`);
    if (rpm != null)    lines.push(`  Motor: ${rpm > 100 ? 'PÅ · ' + rpm.toLocaleString('no') + ' RPM' : 'AV'}${cool != null ? ' · kjølevann ' + cool + '°C' : ''}`);
    if (hrs != null)    lines.push(`  Gangtimer: ${Math.round(hrs).toLocaleString('no')} t`);
    if (fuelRt != null && rpm > 100) lines.push(`  Aktuelt forbruk: ${fuelRt} L/t`);
    if (shore)          lines.push('  Landstrøm: tilkoblet');
    if (sogKn > 0.3)    lines.push(`  Fart over grunn: ${sogKn.toFixed(1)} knop`);
    if (wt != null)     lines.push(`  Sjøtemp: ${wt}°C`);
    if (depth != null)  lines.push(`  Dybde: ${depth} m`);
    if (wind != null)   lines.push(`  Vind: ${wind.toFixed(1)} m/s`);
  } else {
    lines.push('Signal K ikke tilkoblet (offline / ved kai)');
  }

  // Siste 5 turer
  try {
    const { data: recentTrips } = await trips.list({ limit: 5 });
    if (recentTrips.length) {
      lines.push('', 'Siste turer:');
      recentTrips.forEach(t => {
        const d = new Date(t.start_ts).toLocaleDateString('no', { day:'2-digit', month:'short' });
        lines.push(`  ${d}: ${t.name || 'Tur'} · ${t.distance_nm ? parseFloat(t.distance_nm).toFixed(1) + ' nm' : '—'} · ${t.fuel_used_l ? t.fuel_used_l + 'L diesel' : '—'}`);
      });
    }
  } catch {}

  // Kostnader inneværende sesong
  try {
    const { grandTotal, costPerNm, totals } = await costs.summary({ year: now.getFullYear() });
    if (grandTotal > 0) {
      lines.push('', `Kostnader ${now.getFullYear()}: ${Math.round(grandTotal).toLocaleString('no')} kr totalt${costPerNm ? ' · ' + Math.round(costPerNm) + ' kr/nm' : ''}`);
      const fuel = totals.find(r => r.category === 'fuel');
      if (fuel) lines.push(`  Drivstoff: ${Math.round(fuel.total).toLocaleString('no')} kr · ${fuel.total_liters ? Math.round(fuel.total_liters) + ' L' : ''}`);
    }
  } catch {}

  // Åpne vedlikeholdsoppgaver
  try {
    const { data: openMx } = await maintenance.list({ status: 'open', limit: 5 });
    if (openMx.length) {
      lines.push('', 'Åpne vedlikeholdsoppgaver:');
      openMx.slice(0,4).forEach(m => lines.push(`  [${m.priority}] ${m.title}`));
    }
  } catch {}

  // Vær fra MET Norway
  try {
    const lat = parseFloat(localStorage.getItem('wx_lat') || '58.15');
    const lon = parseFloat(localStorage.getItem('wx_lon') || '7.99');
    const { hostname } = window.location;
    const metBase = (hostname !== 'localhost' && hostname !== '127.0.0.1')
      ? window.location.origin + '/met'
      : 'https://api.met.no';
    const wx = await fetch(
      `${metBase}/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`,
      { headers: { 'User-Agent': 'Bavaria32App/1.0 tom.erik.thorsen@gmail.com' } }
    ).then(r => r.json());
    const ts0  = wx.properties.timeseries;
    const cur  = ts0[0]?.data?.instant?.details || {};
    const next = ts0[0]?.data?.next_1_hours || ts0[0]?.data?.next_6_hours || {};
    const sym  = (next?.summary?.symbol_code || '').replace(/_day|_night|_polartwilight/, '');
    const WDESCS = {
      clearsky:'Klarvær', fair:'Lettskyet', partlycloudy:'Delvis skyet', cloudy:'Skyet',
      fog:'Tåke', lightrainshowers:'Lette regnbyger', rainshowers:'Regnbyger',
      lightrain:'Lett regn', rain:'Regn', heavyrain:'Kraftig regn',
      lightsnow:'Lett snø', snow:'Snø', sleet:'Sludd', thunder:'Torden',
    };
    const wdesc   = Object.entries(WDESCS).find(([k]) => sym.startsWith(k))?.[1] || sym;
    const wind_ms = Number(cur.wind_speed || 0);
    const gust    = Number(cur.wind_speed_of_gust || wind_ms);
    const temp    = Math.round(cur.air_temperature || 0);
    const hum     = Math.round(cur.relative_humidity || 0);
    const prec    = Number(next?.details?.precipitation_amount || 0);
    const next6   = ts0.slice(0, 6).map(t => {
      const d  = t.data?.instant?.details || {};
      const s  = ((t.data?.next_1_hours || t.data?.next_6_hours || {})?.summary?.symbol_code || '')
                   .replace(/_day|_night|_polartwilight/, '');
      const sd = Object.entries(WDESCS).find(([k]) => s.startsWith(k))?.[1] || s;
      return `${new Date(t.time).toLocaleTimeString('no',{hour:'2-digit',minute:'2-digit'})}: ${Math.round(d.air_temperature||0)}°C ${sd} ${Math.round(d.wind_speed||0)}m/s`;
    }).join(' · ');
    lines.push('', 'Vær nå:');
    lines.push(`  ${temp}°C, ${wdesc}, vind ${wind_ms.toFixed(1)} m/s (kast ${gust.toFixed(1)} m/s), fukt ${hum}%${prec > 0 ? ', nedbør ' + prec.toFixed(1) + 'mm' : ''}`);
    lines.push(`  Neste 6 timer: ${next6}`);
  } catch (e) {
    lines.push('', `Vær: ikke tilgjengelig (${e.message})`);
  }

  lines.push('', '---');
  lines.push('Svar konsist og på norsk. Bruk tallene over aktivt når du svarer på spørsmål om rekkevidde, kostnad, vær osv. Du har nå faktisk tilgang til værdataene ovenfor — bruk dem direkte i svar om vær.');

  return lines.join('\n');
}

// ── DOM-hjelpere ──────────────────────────────────────────────────────────────
function appendMessage(role, text) {
  const box = document.getElementById('asst-messages');
  if (!box) return;

  const ts  = new Date().toLocaleTimeString('no', { hour:'2-digit', minute:'2-digit' });
  const div = document.createElement('div');
  div.className = `asst-msg ${role}`;

  const avatarLabel = role === 'ai' ? '⛵' : 'TE';
  const html = role === 'ai' ? mdToHtml(text) : escHtml(text);

  div.innerHTML = `
    <div class="asst-avatar ${role === 'ai' ? 'ai' : 'usr'}">${avatarLabel}</div>
    <div>
      <div class="asst-bubble">${html}</div>
      <div class="asst-ts">${ts}</div>
    </div>`;

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function appendTyping(id) {
  const box = document.getElementById('asst-messages');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'asst-msg ai';
  div.id = id;
  div.innerHTML = `
    <div class="asst-avatar ai">⛵</div>
    <div class="asst-bubble" style="padding:12px 16px">
      <div class="asst-typing"><span></span><span></span><span></span></div>
    </div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

// Enkel markdown-parser for svar
function mdToHtml(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/^### (.+)$/gm,'<strong>$1</strong>')
    .replace(/^## (.+)$/gm,'<strong>$1</strong>')
    .replace(/^# (.+)$/gm,'<strong>$1</strong>')
    .replace(/^\* (.+)$/gm,'<li>$1</li>')
    .replace(/^- (.+)$/gm,'<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm,'<li>$1. $2</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g,'</p><p>')
    .replace(/\n/g,'<br>')
    .replace(/^(.)/,'<p>$1')
    .replace(/(.)$/,'$1</p>');
}

function escHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function suggestions() {
  return [
    'Hvordan har Summer det i dag?',
    'Har vi nok diesel til å seile til Lindesnes?',
    'Hva er forventet vær de neste 24 timene?',
    'Hva har vi brukt på diesel i sommer?',
    'Hvilke vedlikeholdsoppgaver er åpne?',
    'Hva er estimert rekkevidde nå?',
  ];
}
