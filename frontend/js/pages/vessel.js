// pages/vessel.js — båtens tvilling · koblingsskjemaer · spesifikasjoner
const BASE = () => localStorage.getItem('backend_url') || 'http://localhost:3001';

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Båtens tvilling</div>
      <div class="ph-s">Fullstendig oversikt · koblingsskjemaer · systemarkitektur · FAR999</div>
    </div>

    <div class="vhero">
      <div class="vh-e">Bavaria Yachts · Giebelstadt · 2013</div>
      <div class="vh-t">Sport 32</div>
      <div class="vh-s">Cabincruiser · Hull DE-BAVE32A7K213 · Reg. FAR999</div>
      <div class="vh-st">
        <div><div class="vh-sl">Lengde</div><div class="vh-sv">35 fot</div></div>
        <div><div class="vh-sl">Bredde</div><div class="vh-sv">3,31 m</div></div>
        <div><div class="vh-sl">Dybde</div><div class="vh-sv">1,05 m</div></div>
        <div><div class="vh-sl">Vekt</div><div class="vh-sv">6 000 kg</div></div>
        <div><div class="vh-sl">Topphast.</div><div class="vh-sv">32 kn</div></div>
        <div><div class="vh-sl">Soveplasser</div><div class="vh-sv">4–5</div></div>
      </div>
    </div>

    <div class="sl">Koblingsskjemaer</div>
    <div class="diagram-frame-wrap">
      <iframe
        id="diagram-frame"
        src="/diagrams/"
        title="Koblingsskjemaer — Summer"
        class="diagram-frame"
      ></iframe>
      <div class="diagram-frame-fallback" id="diagram-fallback">
        <div>
          <div style="font-size:2rem;margin-bottom:12px">⚠</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">Koblingsskjema ikke bygget</div>
          <div style="font-size:12px;color:var(--ink-light);margin-bottom:16px;line-height:1.6">
            Kjør disse kommandoene for å bygge diagram-appen:
          </div>
          <code style="display:block;font-family:'DM Mono',monospace;font-size:11px;background:#f0f2f5;padding:10px 14px;line-height:2;white-space:pre;text-align:left">cd diagram-app
npm install
npm run build</code>
        </div>
      </div>
    </div>

    <div class="sl" style="margin-top:36px">Systemarkitektur — BavApp</div>
    ${architecture()}

    ${spec('Identifikasjon', [
      ['Hull ID',           'DE-BAVE32A7K213', true],
      ['Registreringsnr.',  'FAR999', true],
      ['Modell',            'Bavaria Sport 32'],
      ['Byggeår',           '2013'],
    ])}
    ${spec('Fremdrift', [
      ['Motor',             'Volvo Penta D6 330 hk (243 kW)'],
      ['Motor S/N',         '21918547', true],
      ['Chassis ID',        'VV 050736', true],
      ['EVC PCU',           '21722886 · R1I', true],
      ['Drev',              'Volvo Penta DP-D 1.76'],
      ['Drive S/N',         '3G20301186', true],
      ['Dieseltank',        '370 liter (Mastpol 2013)'],
      ['Tankgiver',         'Wema S5-E790 · 0–190 Ω'],
    ])}
    ${spec('Elektrisk', [
      ['Husbatteri',        '8× Makspower LiFePO4 100Ah 12V = 800Ah (2 bokser à 4 stk)'],
      ['Installert',        'Mai 2020 · Bruenech AS'],
      ['BMS',               'Innebygd 150A per celle'],
      ['Ladespenning',      '14,4 V'],
      ['Batterimonitor 1',  'Victron SmartShunt 500A'],
      ['Batterimonitor 2',  'Victron BMV-712 Smart'],
      ['Tilkobling',        'VE.Direct → Cerbo GX (planlagt)'],
      ['Lader 1',           'Victron Blue Smart IP22 12/30 · Li-ION-modus'],
      ['Lader 2',           'Cristec (modell ikke bekreftet)'],
      ['Ladeseparator',     'Quick ECS1'],
      ['Fjernbryter',       'Blue Sea ML-RBS 500A'],
      ['Inverter',          '2900W Pure Sine Wave'],
      ['Landstrøm',         '230V · 3× B16 ABL Sursum'],
    ])}
    ${spec('Navigasjon og autopilot', [
      ['Chartplotter (nå)', 'Garmin GPSmap 4010 · planlagt erstattet'],
      ['Chartplotter (ny)', 'Garmin GPSMAP 1223xsv + GT15M-IH svinger'],
      ['Autopilot display', 'Garmin GHC 20'],
      ['Autopilot ECU',     'GHP Compact Reactor · S/N 4P5001717', true],
      ['GPS-antenne',       'Garmin GPS 19x NMEA 2000'],
      ['NMEA 2000 gateway', 'VP art. 3838617 (planlagt)'],
    ])}
    ${spec('Kommunikasjon', [
      ['VHF-radio',         'Garmin VHF 200 med DSC'],
      ['MMSI',              '⚠ Ikke registrert — kystverket.no'],
      ['AIS',               'Planlagt installasjon'],
      ['WiFi-ruter',        'TP-Link TL-MR6400 · 9V buck converter (planlagt)'],
    ])}
    ${spec('Komfort og interiør', [
      ['Varmeovn',          'Webasto AirTop Evo 3900 Marine'],
      ['Protokoll',         'W-Bus (K-line) · MC04/05 panel'],
      ['Varmtvann',         'Sigmar Boiler Termoinox'],
      ['Toalett',           'Jabsco elektrisk'],
      ['Stereo',            'Fusion MS-CD600 + BT100 (A2DP)'],
    ])}
    ${spec('Hekktruster', [
      ['Modell',            'Anchorlift WS60'],
      ['Skyv',              '60+ kg · brushless motor'],
      ['Spenning',          '36V Lithium dedikert batteri'],
      ['Installert',        '26.05.2022 · kr 49 172'],
    ])}
    ${spec('Digital infrastruktur (planlagt)', [
      ['Datamaskin',        'Victron Cerbo GX'],
      ['OS',                'Venus OS Large'],
      ['Loggeplattform',    'Signal K + Node-RED'],
      ['Tidsseriedata',     'InfluxDB på Cerbo GX'],
      ['Fjerntilgang',      'Tailscale VPN + VPS'],
    ])}
    ${spec('Tank og kapasitet', [
      ['Diesel',            '370 liter · Mastpol 2013'],
      ['Tankgiver',         'Wema S5-E790 · 0–190 Ω'],
      ['Ferskvann',         'Ikke målt — sensor planlagt'],
      ['Gråvann',           'Ikke målt — sensor planlagt'],
    ])}

    <div class="sl">Changelog</div>
    <div id="cl-wrap">
      <!-- Kontroller -->
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
        <button class="btn-primary" id="cl-add-btn" style="font-size:11px;padding:8px 14px">+ Legg til</button>
        <button class="btn-secondary" id="cl-ai-btn" style="font-size:11px;padding:7px 14px">🤖 Analyser og foreslå diagramendring</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ink-light)">
          <input type="checkbox" id="cl-show-auto"> Vis automatiske oppføringer
        </label>
      </div>

      <!-- Legg-til-skjema -->
      <div id="cl-form" style="display:none;background:var(--surface);border:1px solid var(--line);padding:14px;margin-bottom:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <input id="clf-title" placeholder="Tittel *" style="font-family:inherit;font-size:.82rem;border:none;border-bottom:2px solid var(--blue);padding:8px;background:var(--white);outline:none;grid-column:1/-1">
          <select id="clf-type" class="set-inp" style="border-bottom:1px solid var(--line);font-size:.8rem">
            <option value="feat">feat — funksjonalitet</option>
            <option value="hardware">hardware — maskinvare</option>
            <option value="fix">fix — bugfix</option>
          </select>
          <input id="clf-version" placeholder="Versjon (valgfri, f.eks. v0.9)" class="set-inp" style="border-bottom:1px solid var(--line);font-size:.8rem">
        </div>
        <textarea id="clf-desc" placeholder="Beskrivelse (valgfri)" rows="2" style="width:100%;font-family:inherit;font-size:.8rem;border:none;border-bottom:1px solid var(--line);padding:8px;background:var(--white);outline:none;resize:vertical;margin-bottom:8px"></textarea>
        <div style="display:flex;gap:8px">
          <button class="btn-primary" id="clf-save" style="font-size:11px;padding:8px 14px">Lagre</button>
          <button class="btn-secondary" id="clf-cancel" style="font-size:11px;padding:7px 12px">Avbryt</button>
        </div>
      </div>

      <!-- AI-forslag -->
      <div id="cl-ai-result" style="display:none;background:var(--blue-tint);border:1px solid var(--blue);border-left:4px solid var(--blue);padding:14px;margin-bottom:12px;font-size:12px;color:var(--ink-medium);line-height:1.7"></div>

      <!-- Selve listen -->
      <div id="cl-list"><div class="wx-load"><div class="spin"></div>Laster…</div></div>
    </div>

  <style>
    /* ── React Flow diagram iframe ── */
    .diagram-frame-wrap {
      position: relative;
      width: 100%;
      height: 580px;
      border: 1px solid var(--line);
      overflow: hidden;
      margin-bottom: 8px;
      background: #f0f2f5;
    }
    .diagram-frame {
      width: 100%; height: 100%;
      border: none; display: block;
    }
    .diagram-frame-fallback {
      display: none;
      position: absolute; inset: 0;
      align-items: center; justify-content: center;
      background: var(--surface);
      text-align: center;
      padding: 40px;
    }
    .diagram-frame-fallback.visible { display: flex; }

    /* ═══════════════════════════════════════
       SYSTEMARKITEKTUR
    ═══════════════════════════════════════ */
    .arch-intro {
      font-size: 13px; line-height: 1.8; color: var(--ink-medium);
      margin-bottom: 24px; max-width: 720px;
    }
    .arch-flow { margin-bottom: 28px; }
    .arch-flow-title {
      font-family: 'Barlow Condensed', sans-serif; font-weight: 700;
      font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
      color: var(--ink-light); margin-bottom: 12px;
    }
    .arch-pipeline {
      display: flex; align-items: stretch; flex-wrap: wrap;
      gap: 0; border: 1px solid var(--line); overflow: hidden;
    }
    .arch-pipe-step {
      flex: 1; min-width: 100px; padding: 14px 12px;
      background: var(--white); text-align: center;
      border-right: 1px solid var(--line);
    }
    .arch-pipe-step:last-child { border-right: none; }
    .arch-pipe-step.plan { background: var(--surface); }
    .arch-pipe-icon { font-size: 1.4rem; line-height: 1; margin-bottom: 6px; }
    .arch-pipe-label {
      font-family: 'Barlow Condensed', sans-serif; font-weight: 700;
      font-size: 12px; letter-spacing: .04em; text-transform: uppercase;
      color: var(--ink); margin-bottom: 3px;
    }
    .arch-pipe-sub { font-size: 10px; color: var(--ink-light); line-height: 1.5; }
    .arch-pipe-arrow {
      display: flex; align-items: center; padding: 0 4px;
      font-size: 1.2rem; color: var(--line); font-weight: 300;
    }
    .arch-stack {
      display: grid; grid-template-columns: 1fr;
      gap: 12px; margin-bottom: 24px;
    }
    @media (min-width: 600px) { .arch-stack { grid-template-columns: 1fr 1fr; } }
    .arch-card {
      border: 1px solid var(--line);
      border-top: 3px solid var(--blue);
      background: var(--white);
      padding: 16px;
    }
    .arch-card-head {
      display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px;
    }
    .arch-card-icon { font-size: 1.4rem; line-height: 1; flex-shrink: 0; margin-top: 2px; }
    .arch-card-title {
      font-family: 'Barlow Condensed', sans-serif; font-weight: 700;
      font-size: 14px; letter-spacing: .04em; text-transform: uppercase;
      color: var(--ink); margin-bottom: 2px;
    }
    .arch-card-sub { font-size: 11px; color: var(--ink-light); }
    .arch-card-body { font-size: 12px; line-height: 1.7; color: var(--ink-medium); }
    .arch-card-body p { margin-bottom: 8px; }
    .arch-tag {
      display: inline-block;
      font-family: 'Barlow Condensed', sans-serif; font-weight: 600;
      font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase;
      padding: 2px 8px; border: 1px solid var(--line);
      color: var(--ink-light); margin-right: 4px; margin-top: 6px;
    }
    .arch-tag.ok   { border-color: var(--ok);   color: var(--ok);   background: var(--ok-tint); }
    .arch-tag.plan { border-color: var(--warn);  color: var(--warn); background: var(--warn-tint); }
    .arch-note {
      font-size: 11px; color: var(--ink-light);
      padding: 12px 14px; background: var(--surface);
      border: 1px solid var(--line); line-height: 1.8;
      margin-bottom: 24px;
    }
  </style>`;

  // Sjekk om diagram-iframen laster
  const frame    = container.querySelector('#diagram-frame');
  const fallback = container.querySelector('#diagram-fallback');
  const timer = setTimeout(() => {
    if (fallback) fallback.classList.add('visible');
  }, 3000);
  frame?.addEventListener('load', () => {
    clearTimeout(timer);
    if (fallback) fallback.classList.remove('visible');
  });

  // ── Changelog-logikk ───────────────────────────────────────────────────────────
  let _showAuto = false;

  async function loadChangelog() {
    const box = document.getElementById('cl-list');
    if (!box) return;
    try {
      const { data } = await fetch(`${BASE()}/api/changelog`).then(r => r.json());
      renderChangelog(data, _showAuto);
    } catch (e) {
      box.innerHTML = `<div class="empty">Feil: ${e.message}</div>`;
    }
  }

  function versionTitle(v) {
    const titles = {
      'v0.1': 'Grunnmur',
      'v0.2': 'Motor og logg',
      'v0.3': 'Turer og historikk',
      'v0.4': 'Koblingsskjemaer',
      'v0.5': 'Fun layer og push',
      'v0.6': 'Kostnader og scanner',
      'v0.7': 'AI-analyse',
      'v0.8': 'Assistent og navigasjonsrydding',
      'v0.9': 'Webasto og auto-changelog',
    };
    return titles[v] || '';
  }

  function renderChangelog(entries, showAuto) {
    const box = document.getElementById('cl-list');
    if (!box) return;
    const visible = showAuto ? entries : entries.filter(e => !e.auto);
    if (!visible.length) { box.innerHTML = '<div class="empty">Ingen oppføringer</div>'; return; }

    // Grupper etter versjon
    const groups = {};
    for (const e of visible) {
      const key = e.version || '__plan__';
      if (!groups[key]) groups[key] = { version: e.version, date: e.date, entries: [] };
      groups[key].entries.push(e);
    }

    // Sorter grupper: nyeste versjon øverst, planleggingsfase nederst
    function vSort(v) {
      if (!v) return -1;
      const m = v.match(/v(\d+)\.(\d+)/);
      return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0;
    }
    const sortedGroups = Object.values(groups).sort((a, b) => vSort(b.version) - vSort(a.version));

    const TYPE_COLORS = { feat:'var(--ok)', hardware:'#7b1fa2', fix:'var(--warn)', plan:'var(--ink-light)' };
    const TYPE_BG     = { feat:'var(--ok-tint)', hardware:'#f3e8ff', fix:'var(--warn-tint)', plan:'var(--surface)' };
    const SOURCE_ICON = { scanner:'📷', parts:'🔧', costs:'💰', manual:'✏️', system:'⚙️' };

    function entryIcon(e) {
      if (e.type === 'plan') return '📋';
      if (e.type === 'fix')  return '🐛';
      const t = (e.title + ' ' + (e.description || '')).toLowerCase();
      if (t.includes('webasto') || t.includes('varme') || t.includes('w-bus')) return '🔥';
      if (t.includes('motor') || t.includes('ydeg') || t.includes('evc') || t.includes('rpm') || t.includes('d6')) return '⚙️';
      if (t.includes('batteri') || t.includes('strøm') || t.includes('landstrøm') || t.includes('shunt') || t.includes('cerbo') || t.includes('victron') || t.includes('alternator')) return '⚡';
      if (t.includes('kart') || t.includes('gps') || t.includes('leaflet') || t.includes('nmea') || t.includes('garmin')) return '🗺️';
      if (t.includes('diagram') || t.includes('koblings') || t.includes('react flow') || t.includes('node-red')) return '📐';
      if (t.includes('tur') || t.includes('trip') || t.includes('haversine') || t.includes('planlegger')) return '⚓';
      if (t.includes('ai') || t.includes('claude') || t.includes('assistent') || t.includes('haiku') || t.includes('anomali') || t.includes('analyse')) return '🤖';
      if (t.includes('vær') || t.includes('tidevann') || t.includes('sol') || t.includes('met ')) return '⛅';
      if (t.includes('skanner') || t.includes('scanner') || t.includes('kvittering') || t.includes('ocr')) return '📷';
      if (t.includes('kost') || t.includes('pris') || t.includes('diesel') || t.includes('drivstoff')) return '💰';
      if (t.includes('push') || t.includes('varsler') || t.includes('vapid')) return '🔔';
      if (t.includes('pwa') || t.includes('service worker') || t.includes('manifest') || t.includes('offline')) return '📱';
      if (t.includes('header') || t.includes('toppstripa') || t.includes('navigasjon') || t.includes('side')) return '🧹';
      if (t.includes('tank') || t.includes('diesel') || t.includes('ferskvann')) return '🛢️';
      if (t.includes('sikkerhet') || t.includes('epirb') || t.includes('mmsi') || t.includes('gass')) return '🛡️';
      if (e.type === 'hardware') return '🔧';
      return '✨';
    }

    box.innerHTML = sortedGroups.map(g => `
      <div class="cl-release">
        <div class="cl-release-head">
          <div class="cl-date">${g.date.slice(0, 10)}</div>
          <div class="cl-label${!g.version ? ' cl-label-note' : ''}">
            ${g.version ? g.version + ' — ' + versionTitle(g.version) : 'Planleggingsfase'}
          </div>
        </div>
        <div class="cl-items">
          ${g.entries.map(e => `
            <div class="cl-item" style="padding:5px 14px 5px 0;border-left:3px solid ${TYPE_COLORS[e.type]||'var(--line)'}">
              <div style="display:flex;align-items:baseline;gap:8px;padding-left:12px;flex:1;min-width:0">
                <div style="flex:1;min-width:0">
                  <div class="cl-text" style="font-weight:500;color:var(--ink)">
                    <span style="margin-right:5px">${entryIcon(e)}</span>${e.title}
                  </div>
                  ${e.description ? `<div class="cl-text" style="color:var(--ink-light);font-size:11px;margin-top:1px">${e.description}</div>` : ''}
                </div>
              </div>
              <div style="display:flex;align-items:center;flex-shrink:0;margin-left:8px">
                ${e.auto ? `<span title="${e.source}" style="font-size:.75rem;opacity:.35">${SOURCE_ICON[e.source]||''}</span>` : ''}
                <button onclick="delCL('${e.id}')" style="font-size:11px;background:none;border:none;color:#e0e0e0;cursor:pointer;padding:0 4px;line-height:1" title="Slett">×</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }

  window.delCL = async (id) => {
    if (!confirm('Slett denne oppføringen?')) return;
    await fetch(`${BASE()}/api/changelog/${id}`, { method: 'DELETE' });
    loadChangelog();
  };

  // Vis/skjul auto
  document.getElementById('cl-show-auto')?.addEventListener('change', e => {
    _showAuto = e.target.checked;
    loadChangelog();
  });

  // Legg til-knapp
  document.getElementById('cl-add-btn')?.addEventListener('click', () => {
    const f = document.getElementById('cl-form');
    f.style.display = f.style.display === 'none' ? '' : 'none';
  });
  document.getElementById('clf-cancel')?.addEventListener('click', () => {
    document.getElementById('cl-form').style.display = 'none';
  });
  document.getElementById('clf-save')?.addEventListener('click', async () => {
    const title = document.getElementById('clf-title').value.trim();
    if (!title) return;
    await fetch(`${BASE()}/api/changelog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        type:        document.getElementById('clf-type').value,
        version:     document.getElementById('clf-version').value.trim() || null,
        description: document.getElementById('clf-desc').value.trim() || null,
        source:      'manual',
      }),
    });
    document.getElementById('cl-form').style.display = 'none';
    document.getElementById('clf-title').value = '';
    document.getElementById('clf-desc').value  = '';
    loadChangelog();
  });

  // AI diagram-assistent
  document.getElementById('cl-ai-btn')?.addEventListener('click', async () => {
    const apiKey = localStorage.getItem('api_key');
    if (!apiKey) { alert('API-nøkkel mangler i innstillinger'); return; }
    const btn    = document.getElementById('cl-ai-btn');
    const result = document.getElementById('cl-ai-result');
    btn.textContent = '⏳ Analyserer…'; btn.disabled = true;
    result.style.display = '';
    result.textContent   = '…';
    try {
      // Hent siste 15 changelog-entries som kontekst
      const { data } = await fetch(`${BASE()}/api/changelog?limit=15`).then(r => r.json());
      const recent = data.map(e => `[${e.type}] ${e.title}${e.description ? ' — ' + e.description : ''}`).join('\n');

      // Elektrisk diagram-summary
      const diagCtx = `Elektrisk: Landstrøm → Victron IP22-lader + alternator → Husbank (8× Makspower LiFePO4 100Ah = 800Ah, to bokser parallell) / Startbatteri / Thrusterbatteri (36V). Monitorering: Victron SmartShunt 500A + BMV-712 Smart (begge VE.Direct → Cerbo GX planlagt). Cerbo GX (planlagt) → Node-RED → W-Bus → Webasto. NMEA 2000-backbone: YDEG-04, Garmin 1223xsv, VHF/AIS, ekkolodd, Cerbo GX → Signal K → BavApp.`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 600,
          messages: [{ role: 'user', content:
            `Du er arkitekt for Bavaria Sport 32 "Summer" (FAR999) sitt digitale system.\n\nSiste endringer:\n${recent}\n\nNåværende diagramtopologi:\n${diagCtx}\n\nAnalyser endringene og svar på norsk (maks 6 setninger):\n1. Er det ny maskinvare som bør legges til i koblingsskjemaene?\n2. Hvis ja: hvilke nye noder og koblinger skal til, og i hvilket diagram (elektrisk / NMEA)?\n3. Eventuelle andre diagramendringer som anbefales.\n\nVær konkret med nodetyper og relasjoner.`
          }],
        }),
      });
      const d = await res.json();
      result.innerHTML = `<strong style="font-family:'Barlow Condensed',sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--blue)">🤖 AI-vurdering av diagrambehov</strong><br><br>${(d.content?.[0]?.text||'Ingen svar').replace(/\n/g,'<br>')}`;
    } catch (e) {
      result.textContent = 'Feil: ' + e.message;
    } finally {
      btn.textContent = '🤖 Analyser og foreslå diagramendring'; btn.disabled = false;
    }
  });

  // Last changelog ved oppstart
  loadChangelog();
}

// ═══════════════════════════════════════════════════════════════════
// ARKITEKTUR
// ═══════════════════════════════════════════════════════════════════
function architecture() {
  return `
  <div class="arch-intro">
    BavApp er en <strong>Progressive Web App (PWA)</strong> som fungerer som en digital tvilling
    av Bavaria Sport 32. Appen henter sensordata i sanntid fra båtens elektriske og mekaniske
    systemer, lagrer tidsseriedata lokalt, og presenterer alt i et responsivt brukergrensesnitt
    optimalisert for iPad i cockpit. Arkitekturen er bygget rundt
    <strong>tre distinkte lag</strong> — datainnsamling, persistering og presentasjon —
    med en tydelig separasjon mellom live-data og historisk analyse.
  </div>

  <div class="arch-flow">
    <div class="arch-flow-title">Datapipeline — fra sensor til skjerm</div>
    <div class="arch-pipeline">
      <div class="arch-pipe-step plan"><div class="arch-pipe-icon">⚙️</div><div class="arch-pipe-label">Sensorer</div><div class="arch-pipe-sub">NMEA 2000<br>VE.Direct · W-Bus</div></div>
      <div class="arch-pipe-arrow">→</div>
      <div class="arch-pipe-step plan"><div class="arch-pipe-icon">🖥</div><div class="arch-pipe-label">Cerbo GX</div><div class="arch-pipe-sub">Venus OS<br>Signal K server</div></div>
      <div class="arch-pipe-arrow">→</div>
      <div class="arch-pipe-step"><div class="arch-pipe-icon">📡</div><div class="arch-pipe-label">Signal K API</div><div class="arch-pipe-sub">REST + WebSocket<br>lokalt nettverk</div></div>
      <div class="arch-pipe-arrow">→</div>
      <div class="arch-pipe-step"><div class="arch-pipe-icon">🗄</div><div class="arch-pipe-label">Backend</div><div class="arch-pipe-sub">Node.js + Express<br>SQLite database</div></div>
      <div class="arch-pipe-arrow">→</div>
      <div class="arch-pipe-step"><div class="arch-pipe-icon">📱</div><div class="arch-pipe-label">Frontend</div><div class="arch-pipe-sub">PWA · Vanilla JS<br>iPad / iPhone</div></div>
    </div>
    <div style="margin-top:10px;font-size:11px;color:var(--ink-light);font-style:italic">Stiplede bokser er planlagte komponenter.</div>
  </div>

  <div class="arch-stack">
    ${archCard('📡','Signal K','Åpen maritim datastandard · JSON over HTTP/WS',
      `<p>Signal K normaliserer data fra NMEA 0183, NMEA 2000 og proprietære protokoller til et felles JSON-skjema. Alle sensorverdier adresseres via dot-notation paths, f.eks. <code style="font-family:'DM Mono',monospace;font-size:11px;background:var(--surface);padding:1px 4px">electrical.batteries.0.capacity.stateOfCharge</code>.</p>`,
      [['ok','Implementert'],['plan','Cerbo GX planlagt']])}
    ${archCard('🗄','Backend — Node.js + SQLite','Express REST API · lokal persistering',
      `<p>Persistenslag med tre oppgaver: tidsserielagring, domeneobjekter (hendelseslogg, vedlikehold, turer), og turdeteksjon — en tilstandsmaskin som poller Signal K og beregner distanse med Haversine.</p>`,
      [['ok','Implementert'],['','SQLite'],['','Express 4']])}
    ${archCard('📱','Frontend — PWA','Vanilla JS · ES modules · ingen bundler',
      `<p>SPA i ren JavaScript med ES modules. Hash-basert routing, hvert side-modul eksporterer <code style="font-family:'DM Mono',monospace;font-size:11px;background:var(--surface);padding:1px 4px">render()</code> og <code style="font-family:'DM Mono',monospace;font-size:11px;background:var(--surface);padding:1px 4px">onSkUpdate()</code> for live-data.</p>`,
      [['ok','Implementert'],['','Service Worker'],['','ES Modules']])}
    ${archCard('🖥','Victron Cerbo GX','Edge-datamaskin · Venus OS Large · planlagt',
      `<p>ARM-basert datamaskin fra Victron. Cerbo GX aggregerer data fra SmartShunt (VE.Direct) og NMEA 2000-backbone, og eksponerer alt som et Signal K endepunkt på båtnettverket.</p>`,
      [['plan','Planlagt'],['plan','VE.Direct'],['plan','NMEA 2000']])}
    ${archCard('◈','Koblingsskjemaer — React Flow','Interaktive diagrammer · Vite + React + @xyflow/react',
      `<p>Koblingsskjemaene er bygget som en separat Vite + React-app og embeddes som iframe. Nodene er trekkbare og zoombare. Bygges til <code style="font-family:'DM Mono',monospace;font-size:11px;background:var(--surface);padding:1px 4px">frontend/diagrams/</code>.</p>`,
      [['ok','Implementert'],['','React Flow v12'],['','Vite 5']])}
    ${archCard('🤖','Claude AI-integrasjon','Anthropic API · direkte fra browser',
      `<p>Dokumentarkiv scanner bilder og PDFer med Claude Vision. Sensordata genererer norsk haiku via Anthropic API. API-nøkkel i localStorage. Modell: claude-sonnet-4-20250514.</p>`,
      [['ok','Implementert'],['','Claude Sonnet 4'],['','Vision API']])}
  </div>

  <div class="arch-note">
    <strong>Teknologier:</strong>
    Frontend — Vanilla JS ES Modules, Chart.js 4, Leaflet, React Flow (koblingsskjemaer), Service Worker PWA.
    Backend — Node.js v20, Express 4, better-sqlite3, multer 2, uuid.
    Protokoller — Signal K (JSON/WebSocket), NMEA 2000, VE.Direct, MET Norway Locationforecast 2.0.
    Planlagt — Venus OS Large (Cerbo GX), InfluxDB, Node-RED, Tailscale VPN.
    Bygd og vedlikeholdt av Tom Erik Thorsen med Claude (Anthropic) som parprogrammerer.
  </div>`;
}

function archCard(icon, title, sub, body, tags) {
  return `<div class="arch-card">
    <div class="arch-card-head">
      <span class="arch-card-icon">${icon}</span>
      <div><div class="arch-card-title">${title}</div><div class="arch-card-sub">${sub}</div></div>
    </div>
    <div class="arch-card-body">
      ${body}
      <div>${tags.map(([cls, lbl]) => `<span class="arch-tag${cls?' '+cls:''}">${lbl}</span>`).join('')}</div>
    </div>
  </div>`;
}

function spec(title, rows) {
  return `<div class="sl">${title}</div>
    <div class="spg">${rows.map(([k,v,mono])=>`
      <div class="spc"><div class="spk">${k}</div><div class="spv${mono?' m':''}">${v}</div></div>`).join('')}
    </div>`;
}

function changelog() {
  const releases = [
    {
      date: '2026-04-08',
      label: 'v0.8 — AI og navigasjonsrydding',
      items: [
        ['feat', 'Summer-assistent chat med live SK-kontekst, turhistorikk og kostnader'],
        ['feat', 'Kvitteringsskanner: Claude Vision analyserer linjeposter og ruter til kostnadslogg, deler eller vedlikehold'],
        ['feat', 'Redigerbare linjeposter i skanner — OCR-feil korrigeres før lagring'],
        ['feat', 'Signal K MCP-server for Claude Desktop (kontekstdokument + oppsettguide)'],
        ['feat', 'AI-knapp direkte i toppstripa — åpner assistenten fra hvor som helst'],
        ['feat', 'Kompakt header: Summer + prep-generator | sol/tide sentrert | SK + knapper'],
        ['feat', 'Turplanlegger med distanse, dieselestimering, MET Norway-vær og AI-anbefaling (fane i Turer)'],
        ['feat', 'Sommers CV: rekorder, sesonghistorikk og AI-generert biografi (fane i Turer)'],
        ['feat', 'Motorhelse-trender som fane i #motor (fjernet som egen side)'],
        ['feat', 'Anomalideteksjon som fane i #logg (fjernet som egen side)'],
        ['feat', 'Reservedeler og vedlikehold slått sammen til én side (#service)'],
        ['feat', 'Navigasjon ryddet fra 20 til 14 sider'],
      ]
    },
    {
      date: '2026-04-07',
      label: 'v0.7 — AI-analyse',
      items: [
        ['feat', 'Anomalideteksjon: statistisk z-score-analyse av sensorhistorikk vs 30-dagers baseline'],
        ['feat', 'Motorhelse-trender: per-sesjon grafer for kjølevann, oljetrykk, forbruk og RPM'],
        ['feat', 'Vedlikeholdsmilepæler basert på gangtimer (200t, 400t, 1000t)'],
        ['feat', 'AI-tolkning per avvik: Claude forklarer årsak og gir konkrete tiltak'],
        ['feat', 'Koblingsskjema: Piranha P3 undervannslys og Anchorlift WS60 (36V-krets) lagt til'],
      ]
    },
    {
      date: '2026-04-07',
      label: 'v0.6 — Kostnader og dokumentarkiv',
      items: [
        ['feat', 'Kostnadslogg: CRUD med kategorier, drivstoffdetaljer (liter, pris/L, stasjon) og turkobling'],
        ['feat', 'Kostnadssammendrag: totaler per kategori, kost/nm, månedlig historikk'],
        ['feat', 'Årsnavigasjon med ← / → i kostnadslogg'],
        ['feat', 'Dokumentarkiv med Claude Vision-skanning og automatisk metadataekstraksjon'],
        ['feat', '📷 Skann kvittering-knapp i kostnadsloggen'],
      ]
    },
    {
      date: '2026-04-07',
      label: 'v0.5 — Fun layer og push-varsler',
      items: [
        ['feat', 'Sensorhumor: kontekstsensitive kvipp basert på live data (oppdateres hvert 30s)'],
        ['feat', 'Haiku-generator: Claude genererer norsk haiku fra sensordata'],
        ['feat', 'Dieselmoro-fakta: kreativt faktoid per tur basert på liter forbrukt'],
        ['feat', 'Sjøvettregel: tilfeldig maritim regel vises på dashboard'],
        ['feat', 'Sol og tidevann i header (Kartverket sehavnivaa.no + MET Norway)'],
        ['feat', 'Push-varsler med VAPID: bilgepumpe, lav batteri, motoralarmer, landstrøm'],
        ['feat', 'Preposisjonsgenerator med 78 alternativer (roterer hvert 4. sek)'],
      ]
    },
    {
      date: '2026-04-07',
      label: 'v0.4 — React Flow koblingsskjemaer',
      items: [
        ['feat', 'Elektrisk koblingsskjema: 18 noder — landstrøm, batterier, thruster, undervannslys, forbrukere'],
        ['feat', 'NMEA 2000-koblingsskjema: Cerbo GX, YDEG-04, VHF/AIS, GPS, ekkolodd → Signal K'],
        ['feat', 'Eget Vite + React + @xyflow/react diagram-app bygges til frontend/diagrams/'],
        ['feat', 'Custom BavNode-komponent med badge-system (installert / planlagt)'],
      ]
    },
    {
      date: '2026-04-07',
      label: 'v0.3 — Turer og historikk',
      items: [
        ['feat', 'Automatisk turdeteksjon via Haversine-basert tilstandsmaskin (tripTracker.js)'],
        ['feat', 'GPS-spor på kart (Leaflet) med seed-ruter rundt Kristiansand'],
        ['feat', 'Turdetaljer: 13 statistikk-kort og 4 mini-grafer (RPM, kjølevann, batteri, forbruk)'],
        ['feat', 'Aktiv tur-banner med live distanse, varighet, fart og GPS-punkter'],
        ['feat', 'Sensorhistorikk per tur med per-path query mot SQLite'],
      ]
    },
    {
      date: '2026-04-07',
      label: 'v0.2 — Motor og hendelseslogg',
      items: [
        ['feat', 'Motorside: RPM-bar, kjølevann, oljetrykk, motorlast, boost, forbruk, alternator'],
        ['feat', 'Aktive motormeldinger fra Signal K med alvorlighetsnivå (kritisk/advarsel/info)'],
        ['feat', 'Rekkevidde-estimat basert på tankinnhold og aktuelt forbruk'],
        ['feat', 'Hendelseslogg med auto-hendelser fra Signal K state-transitions'],
        ['feat', 'Grafer med Chart.js: sensorhistorikk per path med tidsvelger'],
        ['feat', 'Signal K mock-server for utvikling uten hardware (port 3000)'],
      ]
    },
    {
      date: '2026-04-07',
      label: 'v0.1 — Grunnmur',
      items: [
        ['feat', 'Prosjektoppsett: Node.js + Express backend, SQLite, frontend som statiske filer'],
        ['feat', 'Signal K REST-polling (5 sek) + WebSocket delta-stream for live data'],
        ['feat', 'PWA: manifest, Service Worker, offline-cache v5, installer fra Safari'],
        ['feat', 'Dashboard med live sensorkort for batteri, tanker, motor, navigasjon og miljø'],
        ['feat', 'Strøm-side: hus-, start- og thrusterbatteri, landstrøm, inverter, alternator'],
        ['feat', 'Tank-side: diesel, ferskvann, gråvann med visuelle nivåindikatorer'],
        ['feat', 'Vær-side: MET Norway Locationforecast 2.0 via proxy (inkl. 10-dagers varsel)'],
        ['feat', 'Kart-side: Leaflet med live posisjonssporing og GPS-historikk'],
        ['feat', 'Nattmodus (mørk bakgrunn) og båtmodus (store knapper)'],
        ['feat', 'Innstillinger: Signal K URL, backend URL, Anthropic API-nøkkel, posisjon, push'],
      ]
    },
    {
      date: '2026-04-07',
      label: 'Planleggingsfase',
      note: true,
      items: [
        ['plan', 'Teknisk analyse av Bavaria Sport 32 fra FINN.no-annonse og bilder om bord'],
        ['plan', 'Systemplan: Victron Cerbo GX + Signal K + Node-RED + InfluxDB-arkitektur'],
        ['plan', 'Navigasjonsplan: Garmin GPSMAP 1223xsv med GT15M-IH svinger og NMEA 2000-gateway'],
        ['plan', 'Sikkerhetsgjennomgang: MMSI-registrering, EPIRB, gassanlegg re-sertifisering'],
        ['plan', 'Handleliste: Cerbo GX, YDEG-04, TP-Link ruter, NMEA 2000 starter-kit og mer'],
        ['plan', 'BavApp-konseptet lansert som digital tvilling for familien Thorsen'],
      ]
    },
  ];

  return `
    <div class="cl-wrap">
      ${releases.map(r => `
        <div class="cl-release">
          <div class="cl-release-head">
            <div class="cl-date">${r.date}</div>
            <div class="cl-label${r.note ? ' cl-label-note' : ''}">${r.label}</div>
          </div>
          <div class="cl-items">
            ${r.items.map(([type, text]) => `
              <div class="cl-item">
                <span class="cl-badge cl-badge-${type}">${type}</span>
                <span class="cl-text">${text}</span>
              </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>

    <style>
      .cl-wrap { margin-bottom: 32px; }
      .cl-release { border: 1px solid var(--line); border-top: none; }
      .cl-release:first-child { border-top: 1px solid var(--line); }
      .cl-release-head {
        display: flex; align-items: baseline; gap: 12px;
        padding: 10px 14px; background: var(--surface);
        border-bottom: 1px solid var(--line);
      }
      .cl-date { font-family:'DM Mono',monospace; font-size:10px; color:var(--ink-light); flex-shrink:0; }
      .cl-label { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; letter-spacing:.04em; text-transform:uppercase; color:var(--blue); }
      .cl-label-note { color:var(--ink-light); }
      .cl-items { padding: 6px 0 10px; }
      .cl-item { display:flex; align-items:baseline; gap:10px; padding:4px 14px; }
      .cl-badge { font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:9px; letter-spacing:.12em; text-transform:uppercase; padding:2px 7px; border:1px solid; flex-shrink:0; }
      .cl-badge-feat     { color:var(--ok);     border-color:var(--ok);     background:var(--ok-tint); }
      .cl-badge-hardware { color:#7b1fa2;        border-color:#7b1fa2;       background:#f3e8ff; }
      .cl-badge-fix      { color:var(--warn);    border-color:var(--warn);   background:var(--warn-tint); }
      .cl-badge-plan     { color:var(--ink-light);border-color:var(--line);  background:var(--surface); }
      .cl-text { font-size:12px; color:var(--ink-medium); line-height:1.6; }
    </style>`;
}
