// pages/docs.js — dokumentarkiv med AI-assistert opplasting
import { docs, askClaude } from '../api.js';
import { toast } from '../app.js';

const CAT_LABEL = {
  engine:'Motor og drev', electrical:'Batteri / inverter / lader',
  navigation:'Navigasjon og autopilot', communication:'VHF / MMSI',
  safety:'Gassanlegg / sikkerhet', comfort:'Webasto / komfort',
  thruster:'Thruster', toilet:'Toalett og installasjoner',
  insurance:'Forsikring / serienumre', receipt:'Kvitteringer',
  manual:'Manualer', certificate:'Sertifikater', other:'Annet'
};
const CATS = Object.keys(CAT_LABEL);

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Dokumentarkiv</div>
      <div class="ph-s">Kvitteringer, manualer, sertifikater og bilder</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn-primary" id="doc-upload-btn">+ Last opp dokument</button>
      <select id="doc-cat-filter" style="font-family:inherit;font-size:.8rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5)">
        <option value="">Alle seksjoner</option>
        ${CATS.map(c=>`<option value="${c}">${CAT_LABEL[c]}</option>`).join('')}
      </select>
    </div>

    <!-- Upload form (hidden initially) -->
    <div id="doc-upload-form" style="display:none" class="al" style="flex-direction:column;margin-bottom:16px">
      <div style="width:100%;display:flex;flex-direction:column;gap:10px">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;color:var(--B)">
          Last opp dokument
        </div>

        <!-- File picker -->
        <div id="drop-zone" style="border:2px dashed var(--G3);padding:24px;text-align:center;cursor:pointer;background:var(--G5)">
          <div style="font-size:1.5rem;margin-bottom:6px">📎</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;color:var(--G)">
            Klikk for å velge fil, eller dra og slipp
          </div>
          <div style="font-size:.68rem;color:var(--G2);margin-top:4px">PDF, JPEG, PNG, HEIC — maks 20 MB</div>
          <input type="file" id="doc-file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp" style="display:none">
        </div>
        <div id="file-preview" style="display:none;font-family:'DM Mono',monospace;font-size:.72rem;color:var(--B);padding:8px 0"></div>

        <!-- AI scan button -->
        <div id="ai-scan-wrap" style="display:none">
          <button class="btn-secondary" id="ai-scan-btn" style="width:100%">
            🤖 Scan med AI — hent metadata automatisk
          </button>
          <div id="ai-scan-result" style="display:none;margin-top:8px;font-size:.72rem;color:var(--G)"></div>
        </div>

        <!-- Metadata fields -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Tittel *</label>
            <input id="doc-title" placeholder="f.eks. Kvittering hekktruster" style="width:100%;font-family:inherit;font-size:.85rem;border:1px solid var(--G3);border-bottom:2px solid var(--B);padding:9px 12px;background:var(--G5);outline:none">
          </div>
          <div>
            <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Seksjon *</label>
            <select id="doc-cat" style="width:100%;font-family:inherit;font-size:.82rem;border:1px solid var(--G3);padding:9px 12px;background:var(--G5)">
              ${CATS.map(c=>`<option value="${c}">${CAT_LABEL[c]}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Dato på dokument</label>
            <input id="doc-date" type="date" style="width:100%;font-family:inherit;font-size:.82rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5);outline:none">
          </div>
          <div>
            <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Beløp (hvis kvittering)</label>
            <input id="doc-amount" type="number" placeholder="kr" style="width:100%;font-family:'DM Mono',monospace;font-size:.82rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5);outline:none">
          </div>
          <div>
            <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Leverandør</label>
            <input id="doc-vendor" style="width:100%;font-family:inherit;font-size:.82rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5);outline:none">
          </div>
        </div>
        <textarea id="doc-desc" placeholder="Beskrivelse (valgfritt)" rows="2" style="width:100%;font-family:inherit;font-size:.82rem;border:1px solid var(--G3);padding:9px 12px;background:var(--G5);outline:none;resize:vertical"></textarea>
        <div style="display:flex;gap:8px">
          <button class="btn-primary" id="doc-save-btn">Last opp</button>
          <button class="btn-secondary" id="doc-cancel-btn">Avbryt</button>
        </div>
      </div>
    </div>

    <div id="docs-list"><div class="wx-load"><div class="spin"></div>Laster…</div></div>`;

  await loadDocs();
  setupUploadForm();
  document.getElementById('doc-cat-filter').onchange = loadDocs;
}

function setupUploadForm() {
  const form     = document.getElementById('doc-upload-form');
  const dropZone = document.getElementById('drop-zone');
  const fileInput= document.getElementById('doc-file');
  let selectedFile = null;

  document.getElementById('doc-upload-btn').onclick = () => {
    form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    form.style.flexDirection = 'column';
  };
  document.getElementById('doc-cancel-btn').onclick = () => {
    form.style.display = 'none';
    selectedFile = null;
  };

  // File selection
  dropZone.onclick = () => fileInput.click();
  fileInput.onchange = () => handleFile(fileInput.files[0]);
  dropZone.ondragover = e => { e.preventDefault(); dropZone.style.borderColor = 'var(--B)'; };
  dropZone.ondragleave = () => { dropZone.style.borderColor = 'var(--G3)'; };
  dropZone.ondrop = e => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--G3)';
    handleFile(e.dataTransfer.files[0]);
  };

  function handleFile(file) {
    if (!file) return;
    selectedFile = file;
    document.getElementById('file-preview').style.display = '';
    document.getElementById('file-preview').textContent = `📎 ${file.name} (${(file.size/1024).toFixed(0)} KB)`;
    // Show AI scan button for images
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      document.getElementById('ai-scan-wrap').style.display = '';
    }
    // Pre-fill title from filename
    if (!document.getElementById('doc-title').value) {
      document.getElementById('doc-title').value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g,' ');
    }
  }

  // AI scan
  document.getElementById('ai-scan-btn').onclick = async () => {
    if (!selectedFile) return;
    const btn = document.getElementById('ai-scan-btn');
    const resultBox = document.getElementById('ai-scan-result');
    btn.textContent = '⏳ Scanner…';
    btn.disabled = true;
    resultBox.style.display = '';
    resultBox.textContent = 'Claude leser dokumentet…';

    try {
      const base64 = await fileToBase64(selectedFile);
      const isImage = selectedFile.type.startsWith('image/');
      const isPDF   = selectedFile.type === 'application/pdf';

      const messages = [{
        role: 'user',
        content: [
          ...(isImage ? [{ type:'image', source:{ type:'base64', media_type: selectedFile.type, data: base64 }}] : []),
          ...(isPDF   ? [{ type:'document', source:{ type:'base64', media_type:'application/pdf', data: base64 }}] : []),
          { type:'text', text:`Dette er et dokument for en Bavaria Sport 32 båt (FAR999).
Analyser dokumentet og returner KUN et JSON-objekt med disse feltene (ikke noe annet):
{
  "title": "beskrivende tittel",
  "category": "en av: engine|electrical|navigation|communication|safety|comfort|thruster|toilet|insurance|receipt|manual|certificate|other",
  "doc_date": "YYYY-MM-DD eller null",
  "amount": number eller null,
  "vendor": "leverandørnavn eller null",
  "description": "kort beskrivelse på norsk"
}` }
        ]
      }];

      const result = await askClaude(messages, 'Du er assistent for dokumentarkivet på en Bavaria Sport 32. Returner kun gyldig JSON.');
      const clean = result.replace(/```json|```/g,'').trim();
      const data  = JSON.parse(clean);

      // Fill in fields
      if (data.title)       document.getElementById('doc-title').value  = data.title;
      if (data.category)    document.getElementById('doc-cat').value    = data.category;
      if (data.doc_date)    document.getElementById('doc-date').value   = data.doc_date;
      if (data.amount)      document.getElementById('doc-amount').value = data.amount;
      if (data.vendor)      document.getElementById('doc-vendor').value = data.vendor;
      if (data.description) document.getElementById('doc-desc').value   = data.description;

      resultBox.textContent = '✓ Claude har fylt ut feltene basert på dokumentet. Kontroller og juster ved behov.';
      resultBox.style.color = 'var(--GR)';
    } catch(e) {
      resultBox.textContent = 'AI-scan feilet: ' + e.message + '. Fyll inn feltene manuelt.';
      resultBox.style.color = 'var(--R)';
    } finally {
      btn.textContent = '🤖 Scan med AI igjen';
      btn.disabled = false;
    }
  };

  // Upload
  document.getElementById('doc-save-btn').onclick = async () => {
    const title = document.getElementById('doc-title').value.trim();
    const cat   = document.getElementById('doc-cat').value;
    if (!title) { toast('Tittel er påkrevd', 'err'); return; }

    const fd = new FormData();
    fd.append('title',       title);
    fd.append('category',    cat);
    fd.append('description', document.getElementById('doc-desc').value.trim());
    fd.append('doc_date',    document.getElementById('doc-date').value);
    fd.append('amount',      document.getElementById('doc-amount').value);
    fd.append('vendor',      document.getElementById('doc-vendor').value.trim());
    if (selectedFile) fd.append('file', selectedFile);

    const btn = document.getElementById('doc-save-btn');
    btn.textContent = 'Laster opp…';
    btn.disabled = true;

    try {
      await docs.upload(fd);
      form.style.display = 'none';
      selectedFile = null;
      toast('Dokument lastet opp ✓', 'ok');
      await loadDocs();
    } catch(e) {
      toast('Feil: ' + e.message, 'err');
    } finally {
      btn.textContent = 'Last opp';
      btn.disabled = false;
    }
  };
}

async function loadDocs() {
  const box = document.getElementById('docs-list');
  if (!box) return;
  const cat = document.getElementById('doc-cat-filter')?.value || '';
  try {
    const { data } = await docs.list(cat ? { category: cat } : {});
    if (!data.length) {
      box.innerHTML = '<div class="empty">Ingen dokumenter ennå<br><span style="font-size:.7rem;font-weight:300">Last opp kvitteringer, manualer og sertifikater</span></div>';
      return;
    }

    // Group by category
    const grouped = {};
    data.forEach(d => { (grouped[d.category] = grouped[d.category]||[]).push(d); });

    box.innerHTML = Object.entries(grouped).map(([cat, items]) => `
      <div class="sl" style="margin-top:20px">${CAT_LABEL[cat]||cat}</div>
      ${items.map(d => docRow(d)).join('')}
    `).join('');

    box.querySelectorAll('[data-doc-delete]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm(`Slett "${btn.dataset.docTitle}"?`)) return;
        await docs.delete(btn.dataset.docDelete);
        toast('Dokument slettet');
        await loadDocs();
      };
    });
  } catch(e) {
    box.innerHTML = `<div class="empty">Feil: ${e.message}</div>`;
  }
}

function docRow(d) {
  const backendUrl = localStorage.getItem('backend_url') || 'http://localhost:3001';
  const fileUrl    = d.filename ? `${backendUrl}/uploads/${d.filename}` : null;
  const isImg      = d.mime_type?.startsWith('image/');
  const isPDF      = d.mime_type === 'application/pdf';
  const icon       = isPDF ? '📄' : isImg ? '🖼️' : '📎';
  const dateStr    = d.doc_date ? d.doc_date.slice(0,10) : d.created_at.slice(0,10);

  return `
    <div class="dui" style="align-items:flex-start;gap:12px">
      <div style="width:36px;height:36px;background:var(--BL);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.1rem">${icon}</div>
      <div style="flex:1;min-width:0">
        <div class="dun">${d.title}</div>
        <div class="dum">${[d.vendor, d.amount ? 'kr '+d.amount.toLocaleString('no') : null, dateStr].filter(Boolean).join(' · ')}</div>
        ${d.description ? `<div class="dum" style="margin-top:2px">${d.description}</div>` : ''}
        ${d.original_name ? `<div class="dum" style="font-family:'DM Mono',monospace;font-size:.6rem">${d.original_name}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0;align-items:flex-end">
        ${fileUrl ? `<a href="${fileUrl}" target="_blank" class="btn-secondary" style="font-size:.6rem;padding:4px 10px;text-decoration:none">Åpne</a>` : ''}
        <button class="btn-secondary" style="font-size:.6rem;padding:4px 10px;color:var(--R);border-color:var(--R)"
          data-doc-delete="${d.id}" data-doc-title="${d.title}">Slett</button>
      </div>
    </div>`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
