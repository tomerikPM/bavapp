// pages/webasto.js — Webasto AirTop Evo 3900 Marine · fjernkontroll via W-Bus
// Modi basert på MC04/05-panel: Eco / Normal / Plus / Ventilator / Stopp
const BASE = () => localStorage.getItem('backend_url') || 'http://localhost:3001';

let _pollTimer  = null;
let _lastState  = null;
let _confirming = false;

// ── Feilkodetabell fra bruksanvisningen ───────────────────────────────────────
const FAULT_CODES = {
  'F00': 'Feil i apparatets styring',
  'F01': 'Ingen start (etter 2 startforsøk)',
  'F02': 'Flammeavbrudd (minst 3 ganger)',
  'F03': 'For lav eller for høy spenning',
  'F04': 'For tidlig flammedeteksjon',
  'F06': 'Avbrudd/kortslutning i temperaturføler',
  'F07': 'Avbrudd/kortslutning i doseringspumpe',
  'F08': 'Avbrudd/kortslutning/blokkering i viftemotor',
  'F09': 'Brudd/kortslutning i glødestift',
  'F10': 'Overheting',
  'F11': 'Avbrudd/kortslutning i overhetingssensor',
  'F12': 'Feillåsing av varmeapparatet',
  'F14': 'Feilmontert overhetingssensor',
  'F15': 'Avbrudd ved giver for ønsket temperatur',
};

function faultDescription(code) {
  if (!code) return null;
  const key = String(code).toUpperCase().startsWith('F') ? String(code).toUpperCase() : `F${String(code).padStart(2,'0')}`;
  return FAULT_CODES[key] ? `${key}: ${FAULT_CODES[key]}` : `Feilkode ${code}`;
}

// ── Modi-definisjon (MC04/05) ─────────────────────────────────────────────────
const MODES = [
  { id:'eco',        icon:'🌿', label:'Eco',       desc:'Energisparemodus',  color:'#1a7040', command:'eco' },
  { id:'normal',     icon:'🔥', label:'Normal',    desc:'Komfortvarme',      color:'#c8400a', command:'normal' },
  { id:'plus',       icon:'⚡', label:'Plus',      desc:'Hurtigoppvarming',  color:'#b01020', command:'plus' },
  { id:'ventilation',icon:'💨', label:'Vifte',     desc:'Vifte uten fyr',   color:'#1a4a6a', command:'ventilation' },
];

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Webasto</div>
      <div class="ph-s">AirTop Evo 3900 Marine · MC04/05 · W-Bus</div>
    </div>

    <!-- Statuskort -->
    <div class="wb-card" id="wb-card">
      <div class="wb-flame-wrap">${flameSvg()}</div>
      <div class="wb-status-label" id="wb-status-label">Kobler til…</div>
      <div class="wb-mode-badge" id="wb-mode-badge"></div>
      <div class="wb-temp-row">
        <div class="wb-temp-block">
          <div class="wb-temp-label">Kabintemperatur</div>
          <div class="wb-temp-val" id="wb-cur-temp">—</div>
          <div class="wb-temp-unit">°C</div>
        </div>
        <div class="wb-temp-divider"></div>
        <div class="wb-temp-block">
          <div class="wb-temp-label">Mål</div>
          <div class="wb-temp-val" id="wb-set-temp">—</div>
          <div class="wb-temp-unit">°C</div>
        </div>
        <div class="wb-temp-divider"></div>
        <div class="wb-temp-block">
          <div class="wb-temp-label">Gangtid</div>
          <div class="wb-temp-val" id="wb-runtime">—</div>
          <div class="wb-temp-unit" id="wb-runtime-unit"></div>
        </div>
      </div>
    </div>

    <!-- Temperaturvelger -->
    <div class="wb-section">
      <div class="wb-section-title">Temperaturinnstilling</div>
      <div class="wb-temp-picker">
        <button class="wb-temp-btn" id="wb-temp-down">−</button>
        <div class="wb-temp-target" id="wb-temp-display">20°C</div>
        <button class="wb-temp-btn" id="wb-temp-up">+</button>
      </div>
      <div class="wb-temp-hint">Webasto varmer til valgt temperatur, deretter vedlikeholder.</div>
    </div>

    <!-- Modi-grid (MC04/05) -->
    <div class="wb-section">
      <div class="wb-section-title">Driftsmodus</div>
      <div class="wb-modes" id="wb-modes">
        ${MODES.map(m => `
          <button class="wb-mode-btn" id="wb-mode-${m.id}" data-mode="${m.id}"
            style="--mc:${m.color}">
            <span class="wb-mode-icon">${m.icon}</span>
            <span class="wb-mode-label">${m.label}</span>
            <span class="wb-mode-desc">${m.desc}</span>
          </button>`).join('')}
      </div>
      <button class="wb-stop-btn" id="wb-stop-btn" disabled>
        <span>⏹</span> Stopp Webasto
      </button>
    </div>

    <!-- Bekreftelsesdialog -->
    <div class="wb-confirm" id="wb-confirm" style="display:none">
      <div class="wb-confirm-box">
        <div class="wb-confirm-title" id="wb-confirm-title"></div>
        <div class="wb-confirm-msg" id="wb-confirm-msg"></div>
        <div class="wb-confirm-btns">
          <button class="wb-confirm-yes" id="wb-confirm-yes">Bekreft</button>
          <button class="wb-confirm-no"  id="wb-confirm-no">Avbryt</button>
        </div>
      </div>
    </div>

    <!-- Teknisk info -->
    <div class="wb-section">
      <div class="wb-section-title">Teknisk</div>
      <div class="spg">
        <div class="spc"><div class="spk">Driftsspenning</div><div class="spv m" id="wb-voltage">—</div></div>
        <div class="spc"><div class="spk">Feilkode</div><div class="spv m" id="wb-fault">Ingen</div></div>
        <div class="spc"><div class="spk">Kanal</div><div class="spv" id="wb-channel">Node-RED → W-Bus</div></div>
        <div class="spc"><div class="spk">Sist lest fra heater</div>
          <div class="spv" style="display:flex;align-items:center;gap:8px">
            <span id="wb-synced">—</span>
            <button id="wb-refresh-btn" class="wb-tiny-btn" title="Oppdater nå">⟳</button>
          </div>
        </div>
        <div class="spc"><div class="spk">Modell</div><div class="spv">AirTop Evo 3900 Marine</div></div>
        <div class="spc"><div class="spk">Protokoll</div><div class="spv m">W-Bus · K-line · 2400 baud</div></div>
      </div>
      <div class="wb-info-note">
        W-Bus-statuslesing hvert 10 sek — henter <em>faktisk</em> tilstand direkte fra maskinvaren,
        uavhengig av om endringen kom fra appen eller MC04/05-panelet om bord.
      </div>
    </div>

    <!-- Feilkodetabell -->
    <div class="wb-section">
      <div class="wb-section-title" style="cursor:pointer" id="wb-fault-toggle">
        Feilkodetabell (F00–F15) <span id="wb-fault-chevron" style="margin-left:auto;font-size:10px">▼</span>
      </div>
      <div id="wb-fault-table" style="display:none">
        <table class="wb-ftable">
          ${Object.entries(FAULT_CODES).map(([k,v]) => `
            <tr>
              <td class="wb-fc">${k}</td>
              <td class="wb-fd">${v}</td>
            </tr>`).join('')}
        </table>
        <div class="wb-info-note" style="margin-top:8px">
          Ved vedvarende feil: slå av med sikringen. Kontakt Webasto-autorisert verksted.
          Apparatet skal kontrolleres av fagmann ved starten av hver sesong.
        </div>
      </div>
    </div>

    <!-- Praktisk koblingsveiledning -->
    <div class="wb-section">
      <div class="wb-section-title" style="cursor:pointer" id="wb-wiring-toggle">
        Praktisk W-Bus-kobling <span id="wb-wiring-chevron" style="margin-left:auto;font-size:10px">▼</span>
      </div>
      <div id="wb-wiring-body" style="display:none">
        <div class="wb-info-note" style="margin-bottom:12px">
          Utstyr: <strong>JDTech FTDI USB to OBD2 KKL</strong> (FT232RL-chip) + <strong>3M Scotchlok 314</strong> (Clas Ohlson). W-Bus er en enkel 0,5 mm² leder — du kan fint klippe og bruke Scotchlok 314 som skjøteklemme for tre ledere.
        </div>
        <div class="wb-setup-steps">
          <div class="wb-step"><div class="wb-step-n">1</div><div class="wb-step-body">
            <div class="wb-step-title">Finn W-Bus-ledningen</div>
            <div class="wb-step-desc">Fjern det elektriske dekselet på toppen av varmeren (lever forsiktig av med butt skrutrekker i merkene «X»). Inne ser du X7-kontakten på styringsenheten. W-Bus-signalet er den <strong>grå ledningen</strong> (Terminal 58) i kabeltreet mellom varmeren og MC04/05-panelet.</div>
          </div></div>
          <div class="wb-step"><div class="wb-step-n">2</div><div class="wb-step-body">
            <div class="wb-step-title">Klipp OBD2-enden og identifiser K-line</div>
            <div class="wb-step-desc">Klipp av OBD2-kontakten på JDTech-kabelen. K-line-ledningen (pin 7 i OBD2) er typisk hvit eller gul. Dette er den eneste ledningen som kobles til Webasto.</div>
          </div></div>
          <div class="wb-step"><div class="wb-step-n">3</div><div class="wb-step-body">
            <div class="wb-step-title">Koble inn med Scotchlok 314</div>
            <div class="wb-step-desc">Klipp den grå W-Bus-ledningen. Stikk begge endene pluss K-line-ledningen fra JDTech-kabelen inn i en <strong>3M Scotchlok 314</strong> tre-ledersklemme og klem med tang. Solid forbindelse, ingen lodding. MC04/05-panelet fortsetter å fungere normalt.</div>
          </div></div>
          <div class="wb-step"><div class="wb-step-n">4</div><div class="wb-step-body">
            <div class="wb-step-title">Strøm og jord til KKL-kabelen</div>
            <div class="wb-step-desc">Koble <code>pin 16</code> (+12V) og <code>pin 4/5</code> (GND) fra den klippede OBD2-enden til nærmeste tilgjengelige 12V og jord i sikringsskapet.</div>
          </div></div>
          <div class="wb-step"><div class="wb-step-n">5</div><div class="wb-step-body">
            <div class="wb-step-title">USB til Cerbo GX</div>
            <div class="wb-step-desc">Koble USB-enden rett inn i en USB-port på Cerbo GX. Venus OS gjenkjenner FTDI FT232RL automatisk — adapteren dukker opp som <code>/dev/ttyUSB0</code> uten ekstra drivere.</div>
          </div></div>
          <div class="wb-step"><div class="wb-step-n">6</div><div class="wb-step-body">
            <div class="wb-step-title">Deksel tilbake og test</div>
            <div class="wb-step-desc">Sett dekselet tilbake på varmeren. Kabeltreet ledes ut til venstre eller høyre etter behov. Verifiser tilkobling i Node-RED før du anser jobben som ferdig.</div>
          </div></div>
        </div>
        <div class="wb-info-note" style="margin-top:10px">
          W-Bus-protokoll: K-line · ISO 9141 · 2400 baud · 8E1. Jord i båten: aldri koble fra batteriet mens varmeren er i nedkjølingsfase.
        </div>
      </div>
    </div>

    <!-- Oppsettguide -->
    <div class="wb-section">
      <div class="wb-section-title">Oppsett på Cerbo GX</div>
      <div class="wb-setup-steps">
        <div class="wb-step"><div class="wb-step-n">1</div><div class="wb-step-body">
          <div class="wb-step-title">KKL USB-adapter (FTDI-basert)</div>
          <div class="wb-step-desc">Koble VAG KKL 409.1-adapter til Cerbo GX USB og Webasto W-Bus 2-pins diagnostikkontakt på kabelharnesset.</div>
        </div></div>
        <div class="wb-step"><div class="wb-step-n">2</div><div class="wb-step-body">
          <div class="wb-step-title">Node-RED på Venus OS Large</div>
          <div class="wb-step-desc">Importer <code>nodered-webasto-flow.json</code>. Sett serial-port til <code>/dev/ttyUSB0</code>, 2400 baud, 8N1.</div>
        </div></div>
        <div class="wb-step"><div class="wb-step-n">3</div><div class="wb-step-body">
          <div class="wb-step-title">Verifiser kommunikasjon</div>
          <div class="wb-step-desc">Sjekk debug-panelet i Node-RED etter deploy. Status-kommando skal returnere svar fra Webasto.</div>
        </div></div>
        <div class="wb-step"><div class="wb-step-n">4</div><div class="wb-step-body">
          <div class="wb-step-title">Backend-konfigurasjon</div>
          <div class="wb-step-desc">Sett <code>NODERED_URL=http://&lt;cerbo-ip&gt;:1880</code> i <code>.env</code>.</div>
        </div></div>
      </div>
    </div>

  <style>
    .wb-card {
      background:var(--blue); color:#fff;
      padding:24px 20px 18px; margin-bottom:16px;
      position:relative; overflow:hidden;
      border-bottom:3px solid var(--red);
      transition:background .4s, border-color .4s;
    }
    .wb-card.eco         { background:#1a3d2a; border-bottom-color:#4caf50; }
    .wb-card.running,
    .wb-card.normal      { background:#7b1a00; border-bottom-color:#ff6b35; animation:cardPulse 2s ease-in-out infinite; }
    .wb-card.plus        { background:#5c0a00; border-bottom-color:#ff1a1a; animation:cardPulse 1s ease-in-out infinite; }
    .wb-card.starting    { background:#5c3600; border-bottom-color:#f0a500; animation:cardPulse 1.5s ease-in-out infinite; }
    .wb-card.cooling     { background:#1a3a5c; border-bottom-color:#64b5f6; }
    .wb-card.ventilation { background:#1a4a3a; border-bottom-color:#4caf50; }
    .wb-card.fault       { background:#5c0000; border-bottom-color:var(--danger); animation:cardPulse .7s ease-in-out infinite; }
    @keyframes cardPulse { 0%,100%{opacity:1} 50%{opacity:.82} }

    .wb-flame-wrap { position:absolute; right:16px; top:12px; width:72px; height:72px; opacity:.1; transition:opacity .5s; }
    .wb-card.running .wb-flame-wrap, .wb-card.normal .wb-flame-wrap,
    .wb-card.plus .wb-flame-wrap, .wb-card.starting .wb-flame-wrap { opacity:.16; }

    .wb-status-label {
      font-family:'Barlow Condensed',sans-serif; font-weight:800;
      font-size:2rem; letter-spacing:.06em; text-transform:uppercase;
      color:#fff; line-height:1; margin-bottom:4px;
    }
    .wb-mode-badge {
      font-size:10px; letter-spacing:.12em; text-transform:uppercase;
      color:rgba(255,255,255,.45); margin-bottom:14px; min-height:14px;
    }
    .wb-temp-row { display:flex; }
    .wb-temp-block { flex:1; text-align:center; padding:8px 0; }
    .wb-temp-divider { width:1px; background:rgba(255,255,255,.15); }
    .wb-temp-label { font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:rgba(255,255,255,.4); margin-bottom:4px; }
    .wb-temp-val   { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:2rem; line-height:1; color:#fff; }
    .wb-temp-unit  { font-size:10px; color:rgba(255,255,255,.35); margin-top:2px; }

    .wb-section { margin-bottom:16px; }
    .wb-section-title {
      font-family:'Barlow Condensed',sans-serif; font-weight:700;
      font-size:11px; letter-spacing:.16em; text-transform:uppercase;
      color:var(--blue); margin-bottom:12px;
      display:flex; align-items:center; gap:10px;
    }
    .wb-section-title::after { content:''; flex:1; height:1px; background:var(--line); }

    .wb-temp-picker { display:flex; align-items:center; justify-content:center; gap:20px; margin-bottom:8px; }
    .wb-temp-btn {
      width:44px; height:44px; border:2px solid var(--blue); background:none;
      color:var(--blue); font-size:1.6rem; cursor:pointer;
      font-family:'Barlow Condensed',sans-serif; font-weight:700;
      display:flex; align-items:center; justify-content:center; transition:background .12s;
    }
    .wb-temp-btn:hover { background:var(--blue-tint); }
    .wb-temp-target { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:3rem; color:var(--ink); min-width:100px; text-align:center; line-height:1; }
    .wb-temp-hint { font-size:11px; color:var(--ink-light); text-align:center; }

    /* ── Modusknapper ── */
    .wb-modes { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
    .wb-mode-btn {
      display:flex; flex-direction:column; align-items:center; gap:4px;
      padding:14px 8px; border:2px solid var(--mc); background:none;
      cursor:pointer; transition:all .15s;
    }
    .wb-mode-btn:hover:not(:disabled) { background:var(--mc); color:#fff; }
    .wb-mode-btn:hover:not(:disabled) .wb-mode-desc { color:rgba(255,255,255,.7); }
    .wb-mode-btn.active { background:var(--mc); color:#fff; }
    .wb-mode-btn.active .wb-mode-desc { color:rgba(255,255,255,.7); }
    .wb-mode-btn:disabled { opacity:.3; cursor:not-allowed; }
    .wb-mode-icon  { font-size:1.5rem; line-height:1; }
    .wb-mode-label { font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:var(--mc); }
    .wb-mode-btn:hover:not(:disabled) .wb-mode-label,
    .wb-mode-btn.active .wb-mode-label { color:#fff; }
    .wb-mode-desc  { font-size:10px; color:var(--ink-light); }
    .wb-stop-btn {
      width:100%; padding:12px; border:2px solid var(--blue); background:none;
      color:var(--blue); font-family:'Barlow Condensed',sans-serif; font-weight:700;
      font-size:12px; letter-spacing:.1em; text-transform:uppercase;
      cursor:pointer; transition:all .15s; display:flex; align-items:center; justify-content:center; gap:8px;
    }
    .wb-stop-btn:hover:not(:disabled) { background:var(--blue); color:#fff; }
    .wb-stop-btn:disabled { opacity:.3; cursor:not-allowed; }

    .wb-confirm {
      position:fixed; inset:0; z-index:600; background:rgba(0,0,0,.6);
      display:flex; align-items:center; justify-content:center; padding:24px;
    }
    .wb-confirm-box {
      background:var(--white); padding:28px 24px;
      border-top:4px solid #c8400a; max-width:340px; width:100%;
      animation:slideUp .18s ease;
    }
    .wb-confirm-title {
      font-family:'Barlow Condensed',sans-serif; font-weight:800;
      font-size:1.4rem; letter-spacing:.04em; text-transform:uppercase;
      margin-bottom:10px; color:var(--ink);
    }
    .wb-confirm-msg { font-size:13px; color:var(--ink-light); margin-bottom:20px; line-height:1.6; }
    .wb-confirm-btns { display:flex; gap:8px; }
    .wb-confirm-yes {
      flex:1; padding:12px; background:#c8400a; border:none; color:#fff;
      font-family:'Barlow Condensed',sans-serif; font-weight:700;
      font-size:13px; letter-spacing:.1em; text-transform:uppercase; cursor:pointer;
    }
    .wb-confirm-yes.stop { background:var(--blue); }
    .wb-confirm-no {
      flex:1; padding:12px; background:none; border:2px solid var(--line);
      color:var(--ink-light); font-family:'Barlow Condensed',sans-serif;
      font-weight:700; font-size:13px; letter-spacing:.1em; text-transform:uppercase; cursor:pointer;
    }

    .wb-info-note { font-size:11px; color:var(--ink-light); line-height:1.7; padding:8px 0 4px; }
    .wb-tiny-btn {
      font-family:'Barlow Condensed',sans-serif; font-size:11px; font-weight:700;
      letter-spacing:.06em; padding:3px 8px; border:1px solid var(--line);
      background:none; color:var(--ink-light); cursor:pointer;
    }

    /* ── Feilkodetabell ── */
    .wb-ftable { width:100%; border-collapse:collapse; font-size:12px; }
    .wb-ftable tr { border-bottom:1px solid var(--line); }
    .wb-ftable tr:last-child { border-bottom:none; }
    .wb-fc { font-family:'DM Mono',monospace; font-size:11px; font-weight:700; color:var(--danger); padding:7px 10px 7px 0; width:44px; white-space:nowrap; }
    .wb-fd { color:var(--ink-medium); padding:7px 0; line-height:1.5; }

    /* ── Oppsettguide ── */
    .wb-setup-steps { display:flex; flex-direction:column; }
    .wb-step { display:flex; gap:14px; padding:12px 0; border-bottom:1px solid var(--line); }
    .wb-step:last-child { border-bottom:none; }
    .wb-step-n {
      flex:0 0 28px; height:28px; background:var(--blue); color:#fff;
      display:flex; align-items:center; justify-content:center;
      font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:14px; flex-shrink:0;
    }
    .wb-step-title { font-size:13px; font-weight:600; color:var(--ink); margin-bottom:3px; }
    .wb-step-desc  { font-size:11px; color:var(--ink-light); line-height:1.6; }
    .wb-step-desc code { font-family:'DM Mono',monospace; font-size:10px; background:var(--surface); padding:1px 5px; border:1px solid var(--line); }
  </style>`;

  // ── Temperaturvelger ──────────────────────────────────────────────────────
  let _targetTemp = 20;
  const tempDisplay = container.querySelector('#wb-temp-display');
  container.querySelector('#wb-temp-up').addEventListener('click', () => {
    if (_targetTemp < 30) { _targetTemp++; tempDisplay.textContent = `${_targetTemp}°C`; }
  });
  container.querySelector('#wb-temp-down').addEventListener('click', () => {
    if (_targetTemp > 5) { _targetTemp--; tempDisplay.textContent = `${_targetTemp}°C`; }
  });

  // ── Modusknapper ───────────────────────────────────────────────────────────
  MODES.forEach(m => {
    container.querySelector(`#wb-mode-${m.id}`)?.addEventListener('click', () => {
      const msgs = {
        eco:         `Webasto starter i energisparemodus og varmer kahytten til ${_targetTemp}°C med redusert effekt.`,
        normal:      `Webasto starter i komfortmodus og varmer kahytten til ${_targetTemp}°C.`,
        plus:        `Webasto starter hurtigoppvarming (maks effekt) til ${_targetTemp}°C.`,
        ventilation: 'Viften starter uten forbrenning. Kun luftsirkulasjon i kahytten.',
      };
      showConfirm(`${m.icon} ${m.label}?`, msgs[m.id], () => sendCommand(m.command, _targetTemp), false, m.color);
    });
  });

  container.querySelector('#wb-stop-btn')?.addEventListener('click', () => {
    showConfirm('⏹ Stopp Webasto?',
      'Webasto gjennomfører nedkjølingssyklus (~3 min) før full stopp.',
      () => sendCommand('stop', null), true);
  });

  // ── Koblingsveiledning toggle ──────────────────────────────────────────────
  container.querySelector('#wb-wiring-toggle')?.addEventListener('click', () => {
    const body = document.getElementById('wb-wiring-body');
    const chv  = document.getElementById('wb-wiring-chevron');
    const open = body.style.display === 'none';
    body.style.display = open ? '' : 'none';
    chv.textContent    = open ? '▲' : '▼';
  });

  // ── Feilkodetabell toggle ─────────────────────────────────────────────────
  container.querySelector('#wb-fault-toggle')?.addEventListener('click', () => {
    const tbl = document.getElementById('wb-fault-table');
    const chv = document.getElementById('wb-fault-chevron');
    const open = tbl.style.display === 'none';
    tbl.style.display = open ? '' : 'none';
    chv.textContent   = open ? '▲' : '▼';
  });

  // ── Polling ───────────────────────────────────────────────────────────────
  await poll();
  _pollTimer = setInterval(poll, 5000);
  container.querySelector('#wb-refresh-btn')?.addEventListener('click', poll);

  async function poll() {
    try {
      const data = await fetch(`${BASE()}/api/webasto/state`).then(r => r.json());
      updateUI(data);
    } catch (e) {
      updateUI({ connected: false, state: 'unknown', error: e.message });
    }
  }
}

export function onHide() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// ── UI-oppdatering ────────────────────────────────────────────────────────────
function updateUI(data) {
  _lastState = data;
  const card        = document.getElementById('wb-card');
  const statusLabel = document.getElementById('wb-status-label');
  const modeBadge   = document.getElementById('wb-mode-badge');
  const curTemp     = document.getElementById('wb-cur-temp');
  const setTemp     = document.getElementById('wb-set-temp');
  const runtime     = document.getElementById('wb-runtime');
  const runtimeUnit = document.getElementById('wb-runtime-unit');
  const stopBtn     = document.getElementById('wb-stop-btn');
  const voltEl      = document.getElementById('wb-voltage');
  const faultEl     = document.getElementById('wb-fault');
  if (!card) return;

  const STATE_LABELS = {
    off:         'Av',
    starting:    'Starter…',
    running:     'Varmer',
    normal:      'Varmer',
    eco:         'Eco',
    plus:        'Hurtig',
    cooling:     'Kjøler ned',
    ventilation: 'Ventilasjon',
    fault:       '⚠ Feil',
    unknown:     data.connected === false ? 'Ikke tilkoblet' : 'Ukjent',
  };
  const MODE_BADGES = {
    eco:'🌿 Energisparemodus', normal:'🔥 Komfortvarme',
    plus:'⚡ Hurtigoppvarming', ventilation:'💨 Ventilasjon',
    running:'🔥 Komfortvarme',
  };

  const st = data.state || 'unknown';
  card.className          = `wb-card ${st}`;
  statusLabel.textContent = STATE_LABELS[st] || st;
  if (modeBadge) modeBadge.textContent = MODE_BADGES[st] || '';

  curTemp.textContent = data.currentTemperature != null ? data.currentTemperature : '—';
  setTemp.textContent = data.setTemperature     != null ? data.setTemperature     : '—';

  if (data.runtime != null && data.runtime > 0) {
    const m = Math.floor(data.runtime / 60);
    const s = Math.floor(data.runtime % 60);
    runtime.textContent     = m > 0 ? m : s;
    runtimeUnit.textContent = m > 0 ? 'min' : 'sek';
  } else {
    runtime.textContent = '—'; runtimeUnit.textContent = '';
  }

  const isOn = ['starting','running','normal','eco','plus','ventilation'].includes(st);
  MODES.forEach(m => {
    const btn = document.getElementById(`wb-mode-${m.id}`);
    if (!btn) return;
    btn.disabled = isOn;
    btn.classList.toggle('active', st === m.id || (st === 'running' && m.id === 'normal'));
  });
  if (stopBtn) stopBtn.disabled = !isOn;

  if (voltEl) voltEl.textContent = data.operatingVoltage != null
    ? `${data.operatingVoltage.toFixed(1)} V` : '—';

  if (faultEl) {
    const fdesc = data.fault ? faultDescription(data.faultCode) : null;
    faultEl.textContent = fdesc || 'Ingen';
    faultEl.style.color = data.fault ? 'var(--danger)' : '';
    faultEl.title       = fdesc || '';
  }

  const syncedEl = document.getElementById('wb-synced');
  if (syncedEl) {
    syncedEl.textContent = data.connected !== false
      ? new Date().toLocaleTimeString('no', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
      : 'Ikke tilkoblet';
    syncedEl.style.color = data.connected !== false ? '' : 'var(--ink-light)';
  }
}

// ── Bekreftelsesdialog ────────────────────────────────────────────────────────
function showConfirm(title, msg, onYes, isStop, accentColor) {
  if (_confirming) return;
  _confirming = true;
  const dlg    = document.getElementById('wb-confirm');
  const box    = dlg.querySelector('.wb-confirm-box');
  const yesBtn = document.getElementById('wb-confirm-yes');
  document.getElementById('wb-confirm-title').textContent = title;
  document.getElementById('wb-confirm-msg').textContent   = msg;
  box.style.borderTopColor  = isStop ? 'var(--blue)' : (accentColor || '#c8400a');
  yesBtn.style.background   = isStop ? 'var(--blue)' : (accentColor || '#c8400a');
  yesBtn.textContent        = isStop ? 'Stopp' : 'Start';
  dlg.style.display         = 'flex';
  yesBtn.onclick = async () => { dlg.style.display = 'none'; _confirming = false; await onYes(); };
  document.getElementById('wb-confirm-no').onclick = () => { dlg.style.display = 'none'; _confirming = false; };
}

// ── Kommando ──────────────────────────────────────────────────────────────────
async function sendCommand(command, temperature) {
  MODES.forEach(m => { const b = document.getElementById(`wb-mode-${m.id}`); if (b) b.disabled = true; });
  const stopBtn = document.getElementById('wb-stop-btn');
  if (stopBtn) stopBtn.disabled = true;

  const optimistic = { start:'starting', eco:'eco', normal:'starting', plus:'starting', ventilation:'ventilation', stop:'cooling' };
  updateUI({ ...(_lastState || {}), state: optimistic[command] || 'unknown' });

  try {
    const res = await fetch(`${BASE()}/api/webasto/command`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ command, temperature }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const channelEl = document.getElementById('wb-channel');
    if (channelEl) channelEl.textContent =
      data.channel === 'nodered' ? 'Node-RED → W-Bus ✓' :
      data.channel === 'signalk' ? 'Signal K PUT ✓' : 'Ukjent kanal';

    setTimeout(async () => {
      try { const s = await fetch(`${BASE()}/api/webasto/state`).then(r => r.json()); updateUI(s); } catch {}
    }, 2000);
  } catch (e) {
    const card = document.getElementById('wb-card');
    if (card) {
      const d = document.createElement('div');
      d.style.cssText = 'background:var(--danger);color:#fff;padding:10px 14px;font-size:12px;margin-top:12px';
      d.textContent = `Feil: ${e.message}`;
      card.after(d); setTimeout(() => d.remove(), 4000);
    }
    if (_lastState) updateUI(_lastState);
  }
}

function flameSvg() {
  return `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" fill="white">
    <path d="M40 0 C40 0 55 20 55 35 C55 42 52 47 48 50 C52 38 44 30 40 25 C40 25 38 40 30 45 C26 48 24 53 24 58 C24 74 31 85 40 90 C49 85 56 74 56 58 C56 52 54 47 50 43 C58 46 65 55 65 68 C65 86 54 100 40 100 C26 100 15 86 15 68 C15 50 28 35 40 0Z"/>
  </svg>`;
}
