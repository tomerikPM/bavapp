// pages/anomaly.js — anomalideteksjon og motorhelse-trender
import { toast } from '../app.js';

const BASE = () => localStorage.getItem('backend_url') || 'http://localhost:3001';

const PATH_META = {
  'propulsion.port.temperature': { icon: '🌡', color: '#b01020', normal: '70–95°C' },
  'propulsion.port.oilPressure':        { icon: '⚙', color: '#e65c00', normal: '2.0–5.5 bar' },
  'propulsion.port.fuel.rate':           { icon: '⛽', color: '#b86000', normal: '<70 L/h' },
  'electrical.batteries.279.capacity.stateOfCharge': { icon: '🔋', color: '#1a7040', normal: '20–100%' },
  'electrical.batteries.279.voltage':  { icon: '⚡', color: '#003b7e', normal: '12.2–14.8V' },
};

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Anomalideteksjon</div>
      <div class="ph-s">Statistisk avviksanalyse · 24t vs 30-dagers baseline</div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <button class="btn-primary" id="anom-run-btn">▶ Kjør analyse nå</button>
      <div style="font-size:11px;color:var(--ink-light)" id="anom-ts"></div>
    </div>

    <div id="anom-result"><div class="wx-load"><div class="spin"></div>Analyserer…</div></div>

  <style>
    .anom-ok { background:var(--ok-tint);border:1px solid var(--ok);padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:12px; }
    .anom-ok-icon { font-size:1.8rem; }
    .anom-ok-text { font-size:14px;color:var(--ok);font-weight:500; }

    .anom-card { background:var(--white);border:1px solid var(--line);margin-bottom:10px;overflow:hidden; }
    .anom-card-head { display:flex;align-items:center;gap:10px;padding:12px 14px;border-left:4px solid var(--ac, #bbb); }
    .anom-card.critical .anom-card-head { border-left-color:var(--danger);background:var(--danger-tint); }
    .anom-card.warning  .anom-card-head { border-left-color:var(--warn);background:var(--warn-tint); }
    .anom-card.info     .anom-card-head { border-left-color:var(--blue);background:var(--blue-tint); }
    .anom-icon { font-size:1.4rem;flex-shrink:0; }
    .anom-label { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink); }
    .anom-sev { font-size:9.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;padding:2px 8px;border-radius:99px;margin-left:auto;flex-shrink:0; }
    .anom-card.critical .anom-sev { background:var(--danger);color:#fff; }
    .anom-card.warning  .anom-sev { background:var(--warn);color:#fff; }
    .anom-card.info     .anom-sev { background:var(--blue);color:#fff; }

    .anom-body { padding:10px 14px;font-size:12px;color:var(--ink-medium);border-top:1px solid var(--line); }
    .anom-stats { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0;background:var(--surface);padding:10px; }
    .anom-stat-l { font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-light);margin-bottom:2px; }
    .anom-stat-v { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.1rem;color:var(--ink); }
    .anom-normal { font-size:10px;color:var(--ink-light);margin-top:4px; }

    .anom-ai-wrap { padding:10px 14px 14px; }
    .anom-ai-btn { font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:5px 12px;border:1px solid var(--blue);background:none;color:var(--blue);cursor:pointer; }
    .anom-ai-btn:hover { background:var(--blue-tint); }
    .anom-ai-resp { margin-top:8px;font-size:12px;color:var(--ink-medium);line-height:1.7;background:var(--blue-tint);padding:10px 12px;border-left:3px solid var(--blue);display:none; }
  </style>`;

  runAnalysis();
  document.getElementById('anom-run-btn').onclick = runAnalysis;
}

async function runAnalysis() {
  const box = document.getElementById('anom-result');
  const ts  = document.getElementById('anom-ts');
  if (!box) return;
  box.innerHTML = `<div class="wx-load"><div class="spin"></div>Analyserer sensorhistorikk…</div>`;

  try {
    const res  = await fetch(`${BASE()}/api/anomaly/analyze`);
    const data = await res.json();
    const { anomalies, trends, analyzed_at } = data;

    if (ts) ts.textContent = `Sist analysert: ${new Date(analyzed_at).toLocaleString('no')}`;

    if (!anomalies.length) {
      box.innerHTML = `
        <div class="anom-ok">
          <div class="anom-ok-icon">✓</div>
          <div class="anom-ok-text">Ingen avvik funnet — alle sensorer innenfor normale grenser</div>
        </div>
        <div style="font-size:12px;color:var(--ink-light);padding:8px 0">
          Analysen sammenligner siste 24 timer mot 30-dagers baseline.
          Trenger minst 10 historiske datapunkter per sensor for å detektere avvik.
        </div>`;
      return;
    }

    const sevLabel = { critical: 'Kritisk', warning: 'Advarsel', info: 'Info' };
    box.innerHTML = `
      <div style="font-size:12px;color:var(--ink-light);margin-bottom:12px">
        Funnet <strong>${anomalies.length}</strong> avvik — sammenligner siste 24t mot 30-dagers baseline
      </div>
      ${anomalies.map((a, i) => {
        const meta = PATH_META[a.path] || { icon: '◉', color: '#888', normal: '—' };
        return `
          <div class="anom-card ${a.severity}" id="anom-card-${i}">
            <div class="anom-card-head">
              <div class="anom-icon">${meta.icon}</div>
              <div>
                <div class="anom-label">${a.label}</div>
                <div style="font-size:11px;color:var(--ink-light)">${a.message}</div>
              </div>
              <div class="anom-sev">${sevLabel[a.severity]}</div>
            </div>
            <div class="anom-body">
              <div class="anom-stats">
                <div><div class="anom-stat-l">Baseline 30d</div><div class="anom-stat-v">${a.baselineAvg.toFixed(1)} ${a.unit}</div></div>
                <div><div class="anom-stat-l">Siste 24t snitt</div><div class="anom-stat-v">${a.recentAvg.toFixed(1)} ${a.unit}</div></div>
                <div><div class="anom-stat-l">Avvik</div><div class="anom-stat-v" style="color:${a.severity==='critical'?'var(--danger)':a.severity==='warning'?'var(--warn)':'var(--blue)'}">
                  ${a.direction === 'høyere' ? '+' : '−'}${a.deviationPct}%
                </div></div>
              </div>
              <div class="anom-normal">Normalområde: ${meta.normal} · Z-score: ${a.zScore} · Datapunkter: ${a.sampleCount.recent} (24t) / ${a.sampleCount.baseline} (30d)</div>
            </div>
            <div class="anom-ai-wrap">
              <button class="anom-ai-btn" data-idx="${i}">🤖 Spør AI om årsak</button>
              <div class="anom-ai-resp" id="anom-ai-${i}"></div>
            </div>
          </div>`;
      }).join('')}`;

    // AI-tolkning per avvik
    box.querySelectorAll('[data-idx]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        const a   = anomalies[idx];
        const respEl = document.getElementById(`anom-ai-${idx}`);
        const apiKey = localStorage.getItem('api_key');
        if (!apiKey) { toast('API-nøkkel mangler', 'err'); return; }

        btn.textContent = '⏳ Analyserer…'; btn.disabled = true;
        respEl.style.display = 'block';
        respEl.textContent = '…';

        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type':'application/json',
              'x-api-key': apiKey,
              'anthropic-version':'2023-06-01',
              'anthropic-dangerous-direct-browser-access':'true',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 400,
              messages: [{
                role: 'user',
                content: `Bavaria Sport 32 "Summer", motor Volvo Penta D6 330hk, ~1085 gangtimer.

Anomali detektert:
- Sensor: ${a.label}
- Baseline 30 dager: ${a.baselineAvg.toFixed(1)} ${a.unit}
- Siste 24 timer: ${a.recentAvg.toFixed(1)} ${a.unit} (${a.direction === 'høyere' ? '+' : '−'}${a.deviationPct}% avvik, z-score ${a.zScore})
- Normalområde: ${PATH_META[a.path]?.normal || 'ukjent'}

Gi en kort, konkret vurdering på norsk (maks 5 setninger):
1. Hva kan forårsake dette avviket?
2. Er dette bekymringsfullt?
3. Hva bør sjekkes?`,
              }],
            }),
          });
          const d = await res.json();
          respEl.textContent = d.content?.[0]?.text || 'Ingen svar';
        } catch(e) {
          respEl.textContent = 'Feil: ' + e.message;
        } finally {
          btn.textContent = '🤖 Spør AI om årsak';
          btn.disabled = false;
        }
      });
    });

  } catch(e) {
    box.innerHTML = `<div class="empty">Analyse feilet: ${e.message}<br><span style="font-size:.7rem">Trenger sensorhistorikk — aktiver logging og kjør i noen dager</span></div>`;
  }
}
