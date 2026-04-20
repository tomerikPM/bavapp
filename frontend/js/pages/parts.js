// pages/parts.js — reservedels- og serviceregister
import { parts } from '../api.js';
import { toast } from '../app.js';

const CAT_LABEL = {
  engine:'Motor', drive:'Drev', electrical:'Elektrisk',
  hull:'Skrog/undervanns', safety:'Sikkerhet', comfort:'Komfort', other:'Annet'
};
const CATS = Object.keys(CAT_LABEL);

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Reservedeler</div>
      <div class="ph-s">Serviceregister og lagerstatus</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <button class="btn-primary" id="part-add-btn">+ Legg til del</button>
      <select id="part-cat-filter" style="font-family:inherit;font-size:.8rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5)">
        <option value="">Alle kategorier</option>
        ${CATS.map(c=>`<option value="${c}">${CAT_LABEL[c]}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:.78rem;color:var(--G)">
        <input type="checkbox" id="part-overdue"> Vis kun forfalt
      </label>
    </div>
    <div id="parts-list"><div class="wx-load"><div class="spin"></div>Laster…</div></div>`;

  await loadParts();
  document.getElementById('part-cat-filter').onchange = loadParts;
  document.getElementById('part-overdue').onchange    = loadParts;
  document.getElementById('part-add-btn').onclick     = () => showPartForm(container);
}

async function loadParts() {
  const box      = document.getElementById('parts-list');
  if (!box) return;
  const cat      = document.getElementById('part-cat-filter')?.value || '';
  const overdue  = document.getElementById('part-overdue')?.checked ? '1' : '';
  const params   = {};
  if (cat)     params.category = cat;
  if (overdue) params.overdue  = overdue;

  try {
    const { data } = await parts.list(params);
    if (!data.length) { box.innerHTML = '<div class="empty">Ingen deler funnet</div>'; return; }

    // Group by category
    const grouped = {};
    data.forEach(p => { (grouped[p.category] = grouped[p.category]||[]).push(p); });

    box.innerHTML = Object.entries(grouped).map(([cat, items]) => `
      <div class="sl" style="margin-top:20px">${CAT_LABEL[cat]||cat}</div>
      ${items.map(p => partRow(p)).join('')}
    `).join('');

    // Bind replace buttons
    box.querySelectorAll('[data-replace]').forEach(btn => {
      btn.onclick = () => showReplaceForm(btn.dataset.replace, btn.dataset.name, box);
    });
  } catch(e) {
    box.innerHTML = `<div class="empty">Feil: ${e.message}</div>`;
  }
}

function partRow(p) {
  const today = new Date().toISOString().slice(0,10);
  const overdue = p.next_due_date && p.next_due_date <= today;
  const dueSoon = p.next_due_date && !overdue &&
    new Date(p.next_due_date) <= new Date(Date.now() + 60*24*60*60*1000); // 60 days

  const statusCls = overdue ? 'pc' : dueSoon ? 'pw' : p.last_replaced ? 'po' : 'pi';
  const statusTxt = overdue ? 'Forfalt' : dueSoon ? 'Snart' : p.last_replaced ? 'OK' : 'Aldri byttet';

  return `
    <div class="dui">
      <div class="dub ${overdue?'c':dueSoon?'h':'m'}"></div>
      <div style="flex:1;min-width:0">
        <div class="dun">${p.name}</div>
        <div class="dum">${[p.system, p.part_number, p.vendor].filter(Boolean).join(' · ')}</div>
        ${p.last_replaced ? `<div class="dum">Sist byttet: ${p.last_replaced}</div>` : ''}
        ${p.next_due_date ? `<div class="dum">Neste: ${p.next_due_date}</div>` : ''}
        ${p.notes ? `<div class="dum" style="font-style:italic">${p.notes}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
        <span class="pill ${statusCls}">${statusTxt}</span>
        <button class="btn-secondary" style="font-size:.6rem;padding:4px 10px"
          data-replace="${p.id}" data-name="${p.name}">Registrer bytte</button>
      </div>
    </div>`;
}

function showReplaceForm(id, name, container) {
  // Remove existing form if open
  document.getElementById('replace-form-' + id)?.remove();

  const form = document.createElement('div');
  form.id = 'replace-form-' + id;
  form.className = 'al';
  form.style = 'margin:4px 0 8px;flex-direction:column;gap:8px';
  form.innerHTML = `
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.8rem;letter-spacing:.04em;text-transform:uppercase">
      Registrer bytte: ${name}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <div>
        <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Dato</label>
        <input id="rp-date-${id}" type="date" value="${new Date().toISOString().slice(0,10)}"
          style="font-family:inherit;font-size:.82rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5);outline:none">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Motortimer (valgfritt)</label>
        <input id="rp-hours-${id}" type="number" placeholder="f.eks. 1085"
          style="font-family:'DM Mono',monospace;font-size:.82rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5);outline:none;width:140px">
      </div>
    </div>
    <input id="rp-notes-${id}" placeholder="Notater (valgfritt)"
      style="width:100%;font-family:inherit;font-size:.82rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5);outline:none">
    <div style="display:flex;gap:8px">
      <button class="btn-primary" id="rp-save-${id}">Lagre bytte</button>
      <button class="btn-secondary" onclick="document.getElementById('replace-form-${id}').remove()">Avbryt</button>
    </div>`;

  // Insert after the part row's replace button
  const btn = container.querySelector(`[data-replace="${id}"]`);
  btn?.closest('.dui')?.after(form);

  document.getElementById('rp-save-' + id).onclick = async () => {
    const date  = document.getElementById('rp-date-' + id).value;
    const hours = document.getElementById('rp-hours-' + id).value;
    const notes = document.getElementById('rp-notes-' + id).value;
    await parts.replace(id, { date, hours: hours ? parseFloat(hours) : null, notes });
    form.remove();
    toast('Bytte registrert ✓', 'ok');
    await loadParts();
  };
}

function showPartForm(container) {
  const existing = document.getElementById('part-add-form');
  if (existing) { existing.remove(); return; }

  const form = document.createElement('div');
  form.id = 'part-add-form';
  form.className = 'al';
  form.style = 'margin-bottom:16px;flex-direction:column;gap:8px';
  form.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div>
        <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Navn *</label>
        <input id="pf-name" placeholder="f.eks. Oljefilter" style="width:100%;font-family:inherit;font-size:.85rem;border:1px solid var(--G3);border-bottom:2px solid var(--B);padding:9px 12px;background:var(--G5);outline:none">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Kategori *</label>
        <select id="pf-cat" style="width:100%;font-family:inherit;font-size:.82rem;border:1px solid var(--G3);padding:9px 12px;background:var(--G5)">
          ${CATS.map(c=>`<option value="${c}">${CAT_LABEL[c]}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">System</label>
        <input id="pf-sys" placeholder="f.eks. Volvo Penta D6" style="width:100%;font-family:inherit;font-size:.82rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5);outline:none">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Delenummer</label>
        <input id="pf-pno" style="width:100%;font-family:'DM Mono',monospace;font-size:.78rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5);outline:none">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Leverandør</label>
        <input id="pf-vendor" style="width:100%;font-family:inherit;font-size:.82rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5);outline:none">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Intervall (mnd)</label>
        <input id="pf-months" type="number" placeholder="f.eks. 12" style="width:100%;font-family:'DM Mono',monospace;font-size:.82rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5);outline:none">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--G);display:block;margin-bottom:3px">Intervall (timer)</label>
        <input id="pf-hours-int" type="number" placeholder="f.eks. 200" style="width:100%;font-family:'DM Mono',monospace;font-size:.82rem;border:1px solid var(--G3);padding:8px 10px;background:var(--G5);outline:none">
      </div>
    </div>
    <textarea id="pf-notes" placeholder="Notater" rows="2" style="width:100%;font-family:inherit;font-size:.82rem;border:1px solid var(--G3);padding:9px 12px;background:var(--G5);outline:none;resize:vertical"></textarea>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" id="pf-save">Lagre del</button>
      <button class="btn-secondary" onclick="document.getElementById('part-add-form').remove()">Avbryt</button>
    </div>`;

  document.getElementById('parts-list').before(form);

  document.getElementById('pf-save').onclick = async () => {
    const name  = document.getElementById('pf-name').value.trim();
    const cat   = document.getElementById('pf-cat').value;
    if (!name) return;
    await parts.create({
      name, category: cat,
      system:           document.getElementById('pf-sys').value.trim() || null,
      part_number:      document.getElementById('pf-pno').value.trim() || null,
      vendor:           document.getElementById('pf-vendor').value.trim() || null,
      interval_months:  document.getElementById('pf-months').value || null,
      interval_hours:   document.getElementById('pf-hours-int').value || null,
      notes:            document.getElementById('pf-notes').value.trim() || null,
    });
    form.remove();
    toast('Del lagt til', 'ok');
    await loadParts();
  };
}
