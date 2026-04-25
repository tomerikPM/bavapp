// pages/events.js — Hendelseslogg + Anomalideteksjon (faner)
import { events } from '../api.js';
import { toast } from '../app.js';

const BASE = () => localStorage.getItem('backend_url') || 'http://localhost:3001';

const PATH_META = {
  'propulsion.port.temperature': { icon: '🌡', color: '#b01020', normal: '70–95°C' },
  'propulsion.port.oilPressure':        { icon: '⚙',  color: '#e65c00', normal: '2.0–5.5 bar' },
  'propulsion.port.fuel.rate':           { icon: '⛽', color: '#b86000', normal: '<70 L/h' },
  'electrical.batteries.279.capacity.stateOfCharge': { icon: '🔋', color: '#1a7040', normal: '20–100%' },
  'electrical.batteries.279.voltage':  { icon: '⚡', color: '#003b7e', normal: '12.2–14.8V' },
};

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Logg og avvik</div>
      <div class="ph-s">Hendelseslogg · anomalideteksjon · statistisk analyse</div>
    </div>

    <div class="page-tabs">
      <button class="page-tab active" data-tab="events">◷ Hendelser</button>
      <button class="page-tab" data-tab="anomaly">◉ Avvik</button>
    </div>

    <div id="ev-tab-events">
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn-secondary" id="ev-add-btn">+ Nytt notat</button>
        <select id="ev-filter" class="set-inp" style="width:auto;border-bottom:1px solid var(--line);font-size:.8rem">
          <option value="">Alle kategorier</option>
          <option value="engine">Motor</option>
          <option value="electrical">Strøm</option>
          <option value="navigation">Navigasjon</option>
          <option value="maintenance">Vedlikehold</option>
          <option value="alarm">Alarm</option>
          <option value="note">Notat</option>
        </select>
      </div>
      <div id="ev-add-form" style="display:none" class="al" style="margin-bottom:12px">
        <div style="width:100%">
          <input id="ev-title" placeholder="Tittel" style="width:100%;margin-bottom:8px;font-family:inherit;font-size:.85rem;border:none;border-bottom:2px solid var(--blue);padding:9px 12px;background:var(--surface);outline:none">
          <textarea id="ev-body" placeholder="Detaljer (valgfritt)" rows="3" style="width:100%;margin-bottom:8px;font-family:inherit;font-size:.82rem;border:none;border-bottom:2px solid var(--blue);padding:9px 12px;background:var(--surface);outline:none;resize:vertical"></textarea>
          <div style="display:flex;gap:8px">
            <button class="btn-primary" id="ev-save-btn">Lagre</button>
            <button class="btn-secondary" id="ev-cancel-btn">Avbryt</button>
          </div>
        </div>
      </div>
      <div id="ev-list"><div class="wx-load"><div class="spin"></div>Laster…</div></div>
    </div>

    <div id="ev-tab-anomaly" style="display:none">
      <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center">
        <button class="btn-primary" id="anom-run-btn">▶ Kjør analyse</button>
        <div style="font-size:11px;color:var(--ink-light)" id="anom-ts"></div>
      </div>
      <div id="anom-result"><div class="wx-load"><div class="spin"></div>Analyserer…</div></div>
    </div>

  <style>
    .anom-ok { background:var(--ok-tint);border:1px solid var(--ok);padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:12px; }
    .anom-card { background:var(--white);border:1px solid var(--line);margin-bottom:10px;overflow:hidden; }
    .anom-card.critical .anom-card-head { border-left:4px solid var(--danger);background:var(--danger-tint); }
    .anom-card.warning  .anom-card-head { border-left:4px solid var(--warn);background:var(--warn-tint); }
    .anom-card.info     .anom-card-head { border-left:4px solid var(--blue);background:var(--blue-tint); }
    .anom-card-head { display:flex;align-items:center;gap:10px;padding:12px 14px; }
    .anom-label { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink); }
    .anom-sev { font-size:9.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;padding:2px 8px;border-radius:99px;margin-left:auto;flex-shrink:0; }
    .anom-card.critical .anom-sev { background:var(--danger);color:#fff; }
    .anom-card.warning  .anom-sev { background:var(--warn);color:#fff; }
    .anom-card.info     .anom-sev { background:var(--blue);color:#fff; }
    .anom-body { padding:10px 14px;font-size:12px;color:var(--ink-medium);border-top:1px solid var(--line); }
    .anom-stats { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0;background:var(--surface);padding:10px; }
    .anom-stat-l { font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-light);margin-bottom:2px; }
    .anom-stat-v { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.1rem;color:var(--ink); }
    .anom-ai-btn { font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:5px 12px;border:1px solid var(--blue);background:none;color:var(--blue);cursor:pointer;margin:4px 14px 10px; }
    .anom-ai-resp { margin:0 14px 12px;font-size:12px;color:var(--ink-medium);line-height:1.7;background:var(--blue-tint);padding:10px 12px;border-left:3px solid var(--blue);display:none; }
  </style>`;

  // Fane-logikk
  container.querySelectorAll('.page-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.page-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('ev-tab-events').style.display  = tab === 'events'  ? '' : 'none';
      document.getElementById('ev-tab-anomaly').style.display = tab === 'anomaly' ? '' : 'none';
      if (tab === 'anomaly') runAnomaly();
    });
  });

  // Hendelser
  await loadEvents();
  document.getElementById('ev-add-btn').onclick = () => {
    document.getElementById('ev-add-form').style.display = 'flex';
    document.getElementById('ev-add-btn').style.display  = 'none';
  };
  document.getElementById('ev-cancel-btn').onclick = () => {
    document.getElementById('ev-add-form').style.display = 'none';
    document.getElementById('ev-add-btn').style.display  = '';
  };
  document.getElementById('ev-save-btn').onclick = async () => {
    const title = document.getElementById('ev-title').value.trim();
    const body  = document.getElementById('ev-body').value.trim();
    if (!title) return;
    await events.create({ type:'manual', category:'note', title, body, severity:'info' });
    document.getElementById('ev-title').value = '';
    document.getElementById('ev-body').value  = '';
    document.getElementById('ev-add-form').style.display = 'none';
    document.getElementById('ev-add-btn').style.display  = '';
    toast('Hendelse lagret');
    await loadEvents();
  };
  document.getElementById('ev-filter').onchange = loadEvents;
  document.getElementById('anom-run-btn').onclick = runAnomaly;
}

async function loadEvents() {
  const box = document.getElementById('ev-list');
  if (!box) return;
  const cat = document.getElementById('ev-filter')?.value || '';
  try {
    const { data } = await events.list({ limit: 50, ...(cat ? { category: cat } : {}) });
    if (!data.length) { box.innerHTML = '<div class="empty">Ingen hendelser ennå</div>'; return; }
    box.innerHTML = data.map(e => {
      const ts  = new Date(e.ts).toLocaleString('no', { day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit' });
      const sev = e.severity === 'critical' ? 'cr' : e.severity === 'warn' ? 'wn' : 'in';
      return `<div class="alar">
        <div class="alb ${sev}"></div>
        <div style="flex:1;min-width:0">
          <div class="alm">${e.title}</div>
          ${e.body ? `<div style="font-size:.7rem;color:var(--ink-light);margin-top:2px">${e.body}</div>` : ''}
          <div class="alt">${ts} · ${e.category}</div>
        </div>
        ${e.type==='alarm'&&!e.ack
          ? `<button class="btn-secondary" onclick="ackEvent('${e.id}',this)" style="font-size:.62rem;padding:4px 8px">Kvitter</button>`
          : (e.ack ? `<span class="pill po" style="font-size:.55rem">Kvittert</span>` : '')}
      </div>`;
    }).join('');
  } catch(e) {
    box.innerHTML = `<div class="empty">Feil: ${e.message}</div>`;
  }
}

async function runAnomaly() {
  const box = document.getElementById('anom-result');
  const ts  = document.getElementById('anom-ts');
  if (!box) return;
  box.innerHTML = `<div class="wx-load"><div class="spin"></div>Analyserer sensorhistorikk…</div>`;
  try {
    const res  = await fetch(`${BASE()}/api/anomaly/analyze`);
    const data = await res.json();
    const { anomalies, analyzed_at } = data;
    if (ts) ts.textContent = `Sist analysert: ${new Date(analyzed_at).toLocaleString('no')}`;

    if (!anomalies.length) {
      box.innerHTML = `
        <div class="anom-ok">
          <div style="font-size:1.8rem">✓</div>
          <div style="font-size:14px;color:var(--ok);font-weight:500">Ingen avvik funnet — alle sensorer innenfor normale grenser</div>
        </div>
        <div style="font-size:12px;color:var(--ink-light)">Analysen sammenligner siste 24t mot 30-dagers baseline. Trenger minst 10 datapunkter per sensor.</div>`;
      return;
    }

    const sevLabel = { critical:'Kritisk', warning:'Advarsel', info:'Info' };
    box.innerHTML = `
      <div style="font-size:12px;color:var(--ink-light);margin-bottom:12px">Funnet <strong>${anomalies.length}</strong> avvik</div>
      ${anomalies.map((a, i) => {
        const meta = PATH_META[a.path] || { icon:'◉', color:'#888', normal:'—' };
        return `
          <div class="anom-card ${a.severity}">
            <div class="anom-card-head">
              <div style="font-size:1.3rem">${meta.icon}</div>
              <div>
                <div class="anom-label">${a.label}</div>
                <div style="font-size:11px;color:var(--ink-light)">${a.message}</div>
              </div>
              <div class="anom-sev">${sevLabel[a.severity]}</div>
            </div>
            <div class="anom-body">
              <div class="anom-stats">
                <div><div class="anom-stat-l">Baseline 30d</div><div class="anom-stat-v">${a.baselineAvg.toFixed(1)} ${a.unit}</div></div>
                <div><div class="anom-stat-l">Siste 24t</div><div class="anom-stat-v">${a.recentAvg.toFixed(1)} ${a.unit}</div></div>
                <div><div class="anom-stat-l">Avvik</div><div class="anom-stat-v" style="color:${a.severity==='critical'?'var(--danger)':a.severity==='warning'?'var(--warn)':'var(--blue)'}">
                  ${a.direction==='høyere'?'+':'−'}${a.deviationPct}%
                </div></div>
              </div>
              <div style="font-size:10px;color:#bbb">Norm: ${meta.normal} · Z-score: ${a.zScore} · Datapunkter: ${a.sampleCount.recent}(24t) / ${a.sampleCount.baseline}(30d)</div>
            </div>
            <button class="anom-ai-btn" data-idx="${i}">🤖 Spør AI om årsak</button>
            <div class="anom-ai-resp" id="anom-ai-${i}"></div>
          </div>`;
      }).join('')}`;

    box.querySelectorAll('[data-idx]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        const a   = anomalies[idx];
        const respEl = document.getElementById(`anom-ai-${idx}`);
        const apiKey = localStorage.getItem('api_key');
        if (!apiKey) { toast('API-nøkkel mangler', 'err'); return; }
        btn.textContent = '⏳…'; btn.disabled = true;
        respEl.style.display = 'block'; respEl.textContent = '…';
        try {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method:'POST',
            headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
            body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:400,
              messages:[{role:'user',content:`Bavaria Sport 32 "Summer", Volvo Penta D6 330hk, ~1085t.
Anomali: ${a.label} · baseline ${a.baselineAvg.toFixed(1)} ${a.unit} → siste 24t ${a.recentAvg.toFixed(1)} ${a.unit} (${a.direction==='høyere'?'+':'−'}${a.deviationPct}%, z=${a.zScore})
Norm: ${PATH_META[a.path]?.normal||'—'}
Gi en kort vurdering på norsk (maks 4 setninger): årsak, alvorlighet, hva sjekkes?`}],
            }),
          });
          const d = await r.json();
          respEl.textContent = d.content?.[0]?.text || 'Ingen svar';
        } catch(e) { respEl.textContent = 'Feil: '+e.message; }
        finally { btn.textContent='🤖 Spør AI om årsak'; btn.disabled=false; }
      });
    });
  } catch(e) {
    box.innerHTML = `<div class="empty">Feil: ${e.message}</div>`;
  }
}

window.ackEvent = async (id, btn) => {
  await events.ack(id);
  btn.closest('.alar').querySelector('.alb').className = 'alb ok';
  btn.replaceWith(Object.assign(document.createElement('span'), { className:'pill po', style:'font-size:.55rem', textContent:'Kvittert' }));
};
