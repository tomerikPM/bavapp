// pages/scanner.js — universell kvitterings- og dokumentskanner
import { costs, parts, maintenance } from '../api.js';
import { toast, showPage } from '../app.js';

let _onResult = null;

export async function render(container) {
  container.innerHTML = buildShell();
  setupScanner(container, null);
}

export function openScanner(onResult) {
  _onResult = onResult || null;
  const existing = document.getElementById('scanner-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'scanner-modal';
  modal.innerHTML = `
    <div class="scan-modal-backdrop"></div>
    <div class="scan-modal-sheet">
      <div class="scan-modal-head">
        <div class="scan-modal-title">📷 Skann kvittering / dokument</div>
        <button class="scan-modal-close" id="scan-modal-close">✕</button>
      </div>
      <div id="scan-modal-body">${buildShell(true)}</div>
    </div>
    <style>
      .scan-modal-backdrop { position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:998; }
      .scan-modal-sheet { position:fixed;bottom:0;left:0;right:0;z-index:999;background:var(--white);max-height:92vh;overflow-y:auto;border-top:3px solid var(--blue);animation:slideUp .2s ease; }
      @keyframes slideUp { from{transform:translateY(100%)} to{transform:none} }
      .scan-modal-head { display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--white);z-index:1; }
      .scan-modal-title { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--blue); }
      .scan-modal-close { width:30px;height:30px;background:none;border:1px solid var(--line);cursor:pointer;font-size:.9rem; }
    </style>`;

  document.body.appendChild(modal);
  document.getElementById('scan-modal-close').onclick = () => modal.remove();
  modal.querySelector('.scan-modal-backdrop').onclick = () => modal.remove();
  setupScanner(modal.querySelector('#scan-modal-body'), () => modal.remove());
}

function buildShell(compact = false) {
  return `
    <div class="scan-wrap" style="padding:${compact ? '16px' : '0'}">
      ${!compact ? `<div class="ph"><div class="ph-t">Skanner</div><div class="ph-s">Kvitteringer, reservedeler, servicerapporter</div></div>` : ''}

      <div class="scan-drop" id="scan-drop">
        <div style="font-size:2rem;margin-bottom:8px">📷</div>
        <div class="scan-drop-label">Ta bilde eller last opp</div>
        <div class="scan-drop-sub">Kvittering · Reservedelsinfo · Servicerapport · PDF</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;justify-content:center">
          <button class="btn-primary" id="scan-camera-btn">📷 Kamera</button>
          <button class="btn-secondary" id="scan-file-btn">📎 Velg fil</button>
        </div>
        <input type="file" id="scan-camera-input" accept="image/*" capture="environment" style="display:none">
        <input type="file" id="scan-file-input" accept="image/*,application/pdf" style="display:none">
      </div>

      <div id="scan-preview-wrap" style="display:none;margin-bottom:12px">
        <img id="scan-preview-img" style="display:none;width:100%;max-height:200px;object-fit:contain;border:1px solid var(--line);margin-bottom:8px">
        <div id="scan-preview-name" style="font-family:'DM Mono',monospace;font-size:11px;color:var(--ink-light);margin-bottom:10px"></div>
        <button class="btn-primary" id="scan-analyze-btn" style="width:100%">🤖 Analyser med AI</button>
      </div>

      <div id="scan-result-wrap" style="display:none"></div>
    </div>

  <style>
    .scan-drop { border:2px dashed var(--line);padding:28px 16px;text-align:center;background:var(--surface);margin-bottom:12px;transition:border-color .2s; }
    .scan-drop.drag-over { border-color:var(--blue); }
    .scan-drop-label { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink);margin-bottom:4px; }
    .scan-drop-sub { font-size:11px;color:var(--ink-light); }

    .scan-summary-card { border:1px solid var(--line);border-top:3px solid var(--blue);background:var(--white);padding:16px;margin-bottom:12px; }
    .scan-summary-title { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin-bottom:12px; }
    .scan-field { margin-bottom:8px; }
    .scan-field-l { font-size:9.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-light);margin-bottom:2px; }
    .scan-field-v { font-size:13px;color:var(--ink); }

    .scan-items-title {
      font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;
      letter-spacing:.1em;text-transform:uppercase;color:var(--ink);
      margin:16px 0 4px;padding-top:12px;border-top:1px solid var(--line);
      display:flex;align-items:center;justify-content:space-between;
    }
    .scan-items-hint { font-size:10px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--ink-light); }

    .scan-item-row { display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--line); }
    .scan-item-row:last-child { border-bottom:none; }
    .scan-item-check { width:18px;height:18px;flex-shrink:0;margin-top:3px;accent-color:var(--blue); }
    .scan-item-body { flex:1;min-width:0; }

    /* Redigerbart navn */
    .scan-item-name-input {
      font-size:13px;font-weight:600;color:var(--ink);
      border:none;border-bottom:1.5px solid transparent;
      background:transparent;width:100%;outline:none;
      padding:1px 0;margin-bottom:3px;
      font-family:'Barlow',sans-serif;
    }
    .scan-item-name-input:hover { border-bottom-color:var(--line); }
    .scan-item-name-input:focus { border-bottom-color:var(--blue);background:var(--blue-tint);padding:1px 4px; }

    .scan-item-meta { font-size:11px;color:var(--ink-light);margin-bottom:5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap; }
    .scan-item-meta-edit {
      font-size:11px;color:var(--ink-light);border:none;border-bottom:1px dashed var(--line);
      background:transparent;outline:none;width:80px;font-family:'DM Mono',monospace;
    }
    .scan-item-meta-edit:focus { border-bottom-color:var(--blue);color:var(--ink); }

    .scan-item-dest {
      font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:11px;
      letter-spacing:.06em;text-transform:uppercase;
      border:1px solid var(--line);padding:4px 8px;background:var(--surface);
      color:var(--ink);cursor:pointer;outline:none;margin-top:4px;
    }
    .scan-item-amount { font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1rem;color:var(--ink);white-space:nowrap;flex-shrink:0; }

    .scan-register-bar { display:flex;align-items:center;justify-content:space-between;padding:12px 0 0;flex-wrap:wrap;gap:8px;border-top:1px solid var(--line);margin-top:8px; }
    .scan-register-summary { font-size:12px;color:var(--ink-light); }
  </style>`;
}

function setupScanner(container, onClose) {
  let _fileData = null;
  let _fileMime = null;
  let _fileName = null;
  let _fileBlob = null;

  const camInput  = container.querySelector('#scan-camera-input');
  const fileInput = container.querySelector('#scan-file-input');
  const drop      = container.querySelector('#scan-drop');

  container.querySelector('#scan-camera-btn').onclick = () => camInput.click();
  container.querySelector('#scan-file-btn').onclick   = () => fileInput.click();
  camInput.onchange  = e => handleFile(e.target.files[0]);
  fileInput.onchange = e => handleFile(e.target.files[0]);

  drop.ondragover  = e => { e.preventDefault(); drop.classList.add('drag-over'); };
  drop.ondragleave = () => drop.classList.remove('drag-over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); };

  function handleFile(file) {
    if (!file) return;
    _fileMime = file.type;
    _fileName = file.name;
    _fileBlob = file;
    const reader = new FileReader();
    reader.onload = e => {
      _fileData = e.target.result.split(',')[1];
      const prevWrap = container.querySelector('#scan-preview-wrap');
      const prevImg  = container.querySelector('#scan-preview-img');
      const prevName = container.querySelector('#scan-preview-name');
      prevWrap.style.display = '';
      if (file.type.startsWith('image/')) { prevImg.style.display = ''; prevImg.src = e.target.result; }
      else prevImg.style.display = 'none';
      prevName.textContent = `${file.name} · ${(file.size/1024).toFixed(0)} KB`;
      container.querySelector('#scan-result-wrap').style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  container.querySelector('#scan-analyze-btn').onclick = async () => {
    if (!_fileData) return;
    const apiKey = localStorage.getItem('api_key');
    if (!apiKey) { toast('API-nøkkel mangler — legg inn i ⚙ Innstillinger', 'err'); return; }
    const btn = container.querySelector('#scan-analyze-btn');
    btn.textContent = '⏳ Analyserer…';
    btn.disabled = true;
    try {
      const result = await analyzeWithClaude(_fileData, _fileMime, apiKey);
      renderResult(container, result, _fileBlob, _fileName, onClose);
    } catch(e) {
      toast('AI-analyse feilet: ' + e.message, 'err');
    } finally {
      btn.textContent = '🤖 Analyser på nytt';
      btn.disabled = false;
    }
  };
}

// ── Claude Vision — utvidet prompt med linjeposter ───────────────────────────
async function analyzeWithClaude(base64, mime, apiKey) {
  const isImage = mime.startsWith('image/');
  const isPDF   = mime === 'application/pdf';

  const prompt = `Du analyserer et dokument for en Bavaria Sport 32 båt (FAR999, "Summer").
Returner KUN et gyldig JSON-objekt. Ikke noe annet — ingen forklaring, ingen markdown.

{
  "type": "receipt | part_info | service_report | manual | invoice | other",
  "summary": "Kort norsk beskrivelse (1 setning)",
  "date": "YYYY-MM-DD eller null",
  "total_amount": number (totalbeløp inkl mva) eller null,
  "total_ex_vat": number (beløp eks mva) eller null,
  "vendor": "leverandørnavn eller null",
  "line_items": [
    {
      "description": "korrekt norsk produktnavn — rett opp OCR-feil og forkortelser",
      "part_number": "delenummer eller null",
      "quantity": number,
      "unit_price": number,
      "amount": number,
      "suggested_dest": "add_cost | add_part | add_maintenance | skip",
      "cost_category": "fuel | marina | maintenance | equipment | insurance | other" eller null,
      "part_category": "engine | electrical | navigation | hull | drive | comfort | safety | thruster | lighting | other" eller null,
      "part_system": "systemnavn f.eks. 'Anchorlift WS60' eller null"
    }
  ],
  "doc_category": "receipt | equipment | manual | certificate | other"
}

Regler:
- VIKTIG: Rett opp OCR-feil i description. Eksempel: "Kjoering" → "Kjøring", "Plenna" → "Piranha", "Lagt" → "Ladekabel 240V".
- Bruk korrekt norsk stavemåte og fullstendige produktnavn.
- Montering/arbeid/kjøring → suggested_dest: "add_cost", cost_category: "maintenance"
- Fysiske deler/komponenter → suggested_dest: "add_part"
- Aktuelle systemer: Anchorlift WS60 thruster (36V), Piranha P3 undervannslys, Volvo Penta D6 330hk`;

  const content = [
    ...(isImage ? [{ type:'image', source:{ type:'base64', media_type: mime, data: base64 }}] : []),
    ...(isPDF   ? [{ type:'document', source:{ type:'base64', media_type:'application/pdf', data: base64 }}] : []),
    { type:'text', text: prompt }
  ];

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
      max_tokens: 2000,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
  return JSON.parse(text.replace(/```json|```/g,'').trim());
}

// ── Resultat-UI med redigerbare linjeposter ──────────────────────────────────
function renderResult(container, r, fileBlob, fileName, onClose) {
  const wrap = container.querySelector('#scan-result-wrap');
  wrap.style.display = '';

  const typeLabel = {
    receipt:'🧾 Kvittering', part_info:'🔩 Reservedelinfo',
    service_report:'🔧 Servicerapport', manual:'📖 Manual',
    invoice:'📄 Faktura', other:'📋 Dokument',
  };

  const destOptions = [
    { value: 'add_cost',        label: '💰 Kostnadslogg' },
    { value: 'add_part',        label: '🔩 Reservedelliste' },
    { value: 'add_maintenance', label: '🔧 Vedlikeholdslogg' },
    { value: 'skip',            label: '— Hopp over' },
  ];

  const items = r.line_items || [];

  wrap.innerHTML = `
    <div class="scan-summary-card">
      <div class="scan-summary-title">${typeLabel[r.type] || '📋 Dokument'}</div>
      ${r.summary ? `<div class="scan-field"><div class="scan-field-l">Innhold</div><div class="scan-field-v">${r.summary}</div></div>` : ''}
      ${r.date    ? `<div class="scan-field"><div class="scan-field-l">Dato</div><div class="scan-field-v">${r.date}</div></div>` : ''}
      ${r.vendor  ? `<div class="scan-field"><div class="scan-field-l">Leverandør</div><div class="scan-field-v">${r.vendor}</div></div>` : ''}
      ${r.total_amount ? `<div class="scan-field"><div class="scan-field-l">Totalbeløp</div><div class="scan-field-v">${Math.round(r.total_amount).toLocaleString('no')} kr${r.total_ex_vat ? ` · eks. mva ${Math.round(r.total_ex_vat).toLocaleString('no')} kr` : ''}</div></div>` : ''}

      ${items.length ? `
        <div class="scan-items-title">
          Linjeposter
          <span class="scan-items-hint">✎ Klikk tekst for å redigere</span>
        </div>
        ${items.map((item, i) => `
          <div class="scan-item-row">
            <input type="checkbox" class="scan-item-check" id="scan-chk-${i}"
              ${item.suggested_dest !== 'skip' ? 'checked' : ''}>
            <div class="scan-item-body">
              <input
                type="text"
                class="scan-item-name-input"
                id="scan-name-${i}"
                value="${escAttr(item.description)}"
                title="Klikk for å redigere"
              >
              <div class="scan-item-meta">
                ${item.quantity && item.quantity !== 1 ? `<span>${item.quantity} stk</span>` : ''}
                ${item.part_number ? `<span style="font-family:'DM Mono',monospace">Art. <input type="text" class="scan-item-meta-edit" id="scan-pn-${i}" value="${escAttr(item.part_number)}" style="width:${Math.max(60, item.part_number.length * 8)}px"></span>` : ''}
                ${item.part_system ? `<span>${item.part_system}</span>` : ''}
              </div>
              <select class="scan-item-dest" id="scan-dest-${i}">
                ${destOptions.map(o => `<option value="${o.value}" ${item.suggested_dest === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
            <div class="scan-item-amount">
              ${item.amount ? Math.round(item.amount).toLocaleString('no') + ' kr' : ''}
            </div>
          </div>`).join('')}

        <div class="scan-register-bar">
          <div class="scan-register-summary" id="scan-reg-summary">
            ${items.filter(it => it.suggested_dest !== 'skip').length} poster valgt
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-secondary" id="scan-archive-btn">📁 Arkiver dokument</button>
            <button class="btn-primary" id="scan-register-btn">✓ Registrer valgte</button>
          </div>
        </div>
      ` : `
        <div class="scan-register-bar">
          <div></div>
          <button class="btn-secondary" id="scan-archive-btn">📁 Arkiver dokument</button>
        </div>
      `}
    </div>`;

  // Oppdater telletekst
  function updateSummary() {
    const n = wrap.querySelectorAll('.scan-item-check:checked').length;
    const el = wrap.querySelector('#scan-reg-summary');
    if (el) el.textContent = `${n} poster valgt`;
  }
  wrap.querySelectorAll('.scan-item-check').forEach(chk => chk.addEventListener('change', updateSummary));
  wrap.querySelectorAll('.scan-item-dest').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = sel.id.replace('scan-dest-','');
      const chk = wrap.querySelector(`#scan-chk-${i}`);
      if (chk) chk.checked = sel.value !== 'skip';
      updateSummary();
    });
  });

  // Arkiver
  wrap.querySelector('#scan-archive-btn').onclick = async () => {
    const btn = wrap.querySelector('#scan-archive-btn');
    btn.textContent = '⏳ Arkiverer…'; btn.disabled = true;
    try {
      await archiveDoc(fileBlob, fileName, r);
      toast('Dokument arkivert i Docs ✓', 'ok');
      btn.textContent = '✓ Arkivert';
    } catch(e) {
      toast('Arkivering feilet: ' + e.message, 'err');
      btn.textContent = '📁 Prøv igjen'; btn.disabled = false;
    }
  };

  // Registrer valgte — les redigerte verdier fra inputfeltene
  wrap.querySelector('#scan-register-btn')?.addEventListener('click', async () => {
    const btn = wrap.querySelector('#scan-register-btn');
    btn.textContent = '⏳ Registrerer…'; btn.disabled = true;

    let ok = 0, fail = 0;
    for (let i = 0; i < items.length; i++) {
      const chk  = wrap.querySelector(`#scan-chk-${i}`);
      if (!chk?.checked) continue;
      const dest = wrap.querySelector(`#scan-dest-${i}`)?.value;
      if (!dest || dest === 'skip') continue;

      // Les redigerte verdier
      const editedName = wrap.querySelector(`#scan-name-${i}`)?.value?.trim() || items[i].description;
      const editedPn   = wrap.querySelector(`#scan-pn-${i}`)?.value?.trim()   || items[i].part_number;

      const itemWithEdits = { ...items[i], description: editedName, part_number: editedPn || null };

      try { await registerItem(itemWithEdits, dest, r); ok++; }
      catch { fail++; }
    }

    btn.disabled = false; btn.textContent = '✓ Registrer valgte';
    if (ok > 0)   toast(`${ok} poster registrert ✓`, 'ok');
    if (fail > 0) toast(`${fail} poster feilet`, 'err');
    if (ok > 0) { if (_onResult) _onResult(r); if (onClose) setTimeout(onClose, 600); }
  });
}

// ── Hjelpere ──────────────────────────────────────────────────────────────────
function escAttr(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function archiveDoc(fileBlob, fileName, r) {
  const base = localStorage.getItem('backend_url') || 'http://localhost:3001';
  const fd   = new FormData();
  const title = r.vendor
    ? `${r.vendor}${r.date ? ' · ' + r.date : ''}${r.total_amount ? ' · ' + Math.round(r.total_amount) + ' kr' : ''}`
    : (r.summary || fileName || 'Skannet dokument');
  fd.append('title',       title);
  fd.append('category',    r.doc_category && ['receipt','engine','electrical','navigation','safety','comfort','manual','certificate','other'].includes(r.doc_category) ? r.doc_category : 'receipt');
  fd.append('description', r.summary || '');
  fd.append('doc_date',    r.date || '');
  fd.append('amount',      r.total_amount || '');
  fd.append('vendor',      r.vendor || '');
  if (fileBlob) fd.append('file', fileBlob, fileName || 'dokument');
  const res = await fetch(`${base}/api/docs`, { method: 'POST', body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

async function registerItem(item, dest, invoice) {
  const date   = invoice.date || new Date().toISOString().slice(0,10);
  const vendor = invoice.vendor || null;
  switch(dest) {
    case 'add_cost':
      await costs.create({
        category:    item.cost_category || 'other',
        date, description: item.description, amount: item.amount || 0,
        location: vendor,
        notes: `Skannet fra faktura${vendor ? ' · ' + vendor : ''}${item.part_number ? ' · Art. ' + item.part_number : ''}`,
      }); break;
    case 'add_part':
      await parts.create({
        name: item.description, part_number: item.part_number || null,
        category: item.part_category || 'other', system: item.part_system || null, vendor,
        notes: `Kjøpt ${date}${item.amount ? ' · kr ' + Math.round(item.amount) : ''}. Skannet inn.`,
      }); break;
    case 'add_maintenance':
      await maintenance.create({
        title: item.description, category: 'other', priority: 'medium', status: 'done',
        done_date: date, cost: item.amount || null, vendor,
        notes: `Registrert fra faktura${vendor ? ' · ' + vendor : ''}`,
      }); break;
  }
}
