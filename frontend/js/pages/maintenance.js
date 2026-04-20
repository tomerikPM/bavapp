// pages/maintenance.js — Vedlikehold + Reservedeler (faner)
import { maintenance, parts } from '../api.js';
import { toast } from '../app.js';

const PRIO_CLS = { critical:'pc', high:'pw', medium:'pi', low:'po' };
const PRIO_BAR = { critical:'c', high:'h', medium:'m', low:'m' };
const CAT_LABEL = {
  engine:'Motor', drive:'Drev', electrical:'Elektrisk',
  hull:'Skrog/undervanns', safety:'Sikkerhet', comfort:'Komfort', other:'Annet'
};

export async function render(container) {
  container.innerHTML = `
    <div class="ph">
      <div class="ph-t">Service og deler</div>
      <div class="ph-s">Vedlikeholdsoppgaver · reservedeler · serviceregister</div>
    </div>

    <div class="page-tabs">
      <button class="page-tab active" data-tab="mx">🔧 Vedlikehold</button>
      <button class="page-tab" data-tab="parts">⚙ Reservedeler</button>
    </div>

    <!-- Vedlikehold-fane -->
    <div id="mx-tab">
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn-primary" id="mx-add-btn">+ Ny oppgave</button>
        <select id="mx-status" class="set-inp" style="width:auto;border-bottom:1px solid var(--line);font-size:.8rem">
          <option value="open">Åpne</option>
          <option value="done">Fullførte</option>
          <option value="">Alle</option>
        </select>
      </div>
      <div id="mx-list"><div class="wx-load"><div class="spin"></div></div></div>
    </div>

    <!-- Reservedeler-fane -->
    <div id="parts-tab" style="display:none">
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
        <button class="btn-primary" id="part-add-btn">+ Legg til del</button>
        <select id="part-cat-filter" class="set-inp" style="width:auto;border-bottom:1px solid var(--line);font-size:.8rem">
          <option value="">Alle kategorier</option>
          ${Object.entries(CAT_LABEL).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
        </select>
        <label style="display:flex;align-items:center;gap:6px;font-size:.78rem;color:var(--ink-light)">
          <input type="checkbox" id="part-overdue"> Kun forfalt
        </label>
      </div>
      <div id="parts-list"><div class="wx-load"><div class="spin"></div>Laster…</div></div>
    </div>`;

  // Fane-logikk
  container.querySelectorAll('.page-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.page-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('mx-tab').style.display    = tab === 'mx'    ? '' : 'none';
      document.getElementById('parts-tab').style.display = tab === 'parts' ? '' : 'none';
      if (tab === 'parts') loadParts();
    });
  });

  // Vedlikehold
  await loadMx();
  document.getElementById('mx-status').onchange = loadMx;
  document.getElementById('mx-add-btn').onclick  = () => showMxForm();

  // Reservedeler
  document.getElementById('part-cat-filter').onchange = loadParts;
  document.getElementById('part-overdue').onchange    = loadParts;
  document.getElementById('part-add-btn').onclick     = () => showPartForm();
}

// ── Vedlikehold ──────────────────────────────────────────────────────────────
async function loadMx() {
  const box = document.getElementById('mx-list');
  if (!box) return;
  const status = document.getElementById('mx-status')?.value;
  try {
    const { data } = await maintenance.list(status ? { status } : {});
    if (!data.length) { box.innerHTML = '<div class="empty">Ingen oppgaver</div>'; return; }
    box.innerHTML = data.map(m => `
      <div class="dui" id="mx-row-${m.id}">
        <div class="dub ${PRIO_BAR[m.priority]||'m'}"></div>
        <div style="flex:1;min-width:0">
          <div class="dun">${m.title}</div>
          <div class="dum">${[CAT_LABEL[m.category]||m.category, m.notes||m.description||''].filter(Boolean).join(' · ')}</div>
          ${m.due_date ? `<div class="dum">⏰ Frist: ${m.due_date.slice(0,10)}</div>` : ''}
          ${m.cost     ? `<div class="dum">💰 ${Math.round(m.cost).toLocaleString('no')} kr</div>` : ''}
          ${m.done_date? `<div class="dum">✓ Fullført: ${m.done_date.slice(0,10)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
          <span class="pill ${PRIO_CLS[m.priority]||'pi'}">${{critical:'Kritisk',high:'Høy',medium:'Medium',low:'Lav'}[m.priority]||m.priority}</span>
          <div style="display:flex;gap:4px">
            ${m.status==='open' ? `
              <button class="rb" onclick="editTask('${m.id}')" title="Rediger">✏️</button>
              <button class="rb" onclick="doneTask('${m.id}')" title="Fullført">✓</button>
            ` : ''}
            <button class="rb" onclick="deleteTask('${m.id}')" title="Slett" style="color:var(--danger);border-color:var(--danger)">×</button>
          </div>
        </div>
      </div>`).join('');
  } catch(e) {
    box.innerHTML = `<div class="empty">Feil: ${e.message}</div>`;
  }
}

function showMxForm(existing = null) {
  document.getElementById('mx-form')?.remove();
  const form = document.createElement('div');
  form.id = 'mx-form';
  form.className = 'al';
  form.style.cssText = 'margin-bottom:16px;flex-direction:column;gap:8px';
  form.innerHTML = `
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);margin-bottom:4px">
      ${existing ? 'Rediger oppgave' : 'Ny oppgave'}
    </div>
    <input id="mxf-title" placeholder="Oppgave *" value="${existing?.title||''}" style="width:100%;font-family:inherit;font-size:.85rem;border:none;border-bottom:2px solid var(--blue);padding:9px 12px;background:var(--surface);outline:none">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <select id="mxf-priority" class="set-inp" style="border-bottom:1px solid var(--line)">
        <option value="critical" ${existing?.priority==='critical'?'selected':''}>Kritisk</option>
        <option value="high"     ${existing?.priority==='high'    ?'selected':''}>Høy</option>
        <option value="medium"   ${!existing||existing?.priority==='medium'?'selected':''}>Medium</option>
        <option value="low"      ${existing?.priority==='low'    ?'selected':''}>Lav</option>
      </select>
      <select id="mxf-category" class="set-inp" style="border-bottom:1px solid var(--line)">
        <option value="safety"     ${existing?.category==='safety'    ?'selected':''}>Sikkerhet</option>
        <option value="engine"     ${existing?.category==='engine'    ?'selected':''}>Motor</option>
        <option value="electrical" ${existing?.category==='electrical'?'selected':''}>Elektrisk</option>
        <option value="navigation" ${existing?.category==='navigation'?'selected':''}>Navigasjon</option>
        <option value="hull"       ${existing?.category==='hull'      ?'selected':''}>Skrog</option>
        <option value="comfort"    ${existing?.category==='comfort'   ?'selected':''}>Komfort</option>
        <option value="other"      ${existing?.category==='other'     ?'selected':''}>Annet</option>
      </select>
    </div>
    <input id="mxf-due" type="date" value="${existing?.due_date?.slice(0,10)||''}" class="set-inp" style="border-bottom:1px solid var(--line)" placeholder="Frist (valgfri)">
    <textarea id="mxf-notes" placeholder="Notater" rows="2" style="width:100%;font-family:inherit;font-size:.82rem;border:none;border-bottom:1px solid var(--line);padding:9px 12px;background:var(--surface);outline:none;resize:vertical">${existing?.notes||existing?.description||''}</textarea>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" id="mxf-save">${existing ? 'Lagre endringer' : 'Opprett oppgave'}</button>
      <button class="btn-secondary" id="mxf-cancel">Avbryt</button>
    </div>`;

  // Sett inn rett sted
  if (existing) {
    document.getElementById('mx-row-' + existing.id)?.after(form);
  } else {
    document.getElementById('mx-list').before(form);
  }

  document.getElementById('mxf-cancel').onclick = () => form.remove();
  document.getElementById('mxf-save').onclick = async () => {
    const title = document.getElementById('mxf-title').value.trim();
    if (!title) return;
    const payload = {
      title,
      priority: document.getElementById('mxf-priority').value,
      category: document.getElementById('mxf-category').value,
      due_date: document.getElementById('mxf-due').value || null,
      notes:    document.getElementById('mxf-notes').value.trim(),
    };
    if (existing) {
      await maintenance.update(existing.id, payload);
      toast('Oppgave oppdatert ✓', 'ok');
    } else {
      await maintenance.create(payload);
      toast('Oppgave opprettet ✓', 'ok');
    }
    form.remove();
    await loadMx();
  };
}

window.editTask = async (id) => {
  // Lukk evt. åpent skjema
  document.getElementById('mx-form')?.remove();
  const row = await maintenance.get(id);
  showMxForm(row);
};

window.doneTask = async (id) => {
  await maintenance.update(id, { status:'done', done_date: new Date().toISOString().slice(0,10) });
  toast('Oppgave fullført ✓', 'ok');
  await loadMx();
};

window.deleteTask = async (id) => {
  if (!confirm('Slett denne oppgaven?')) return;
  await maintenance.delete(id);
  toast('Oppgave slettet');
  await loadMx();
};

// ── Reservedeler ─────────────────────────────────────────────────────────────
async function loadParts() {
  const box = document.getElementById('parts-list');
  if (!box) return;
  const cat     = document.getElementById('part-cat-filter')?.value || '';
  const overdue = document.getElementById('part-overdue')?.checked ? '1' : '';
  const params  = {};
  if (cat)     params.category = cat;
  if (overdue) params.overdue  = overdue;

  try {
    const { data } = await parts.list(params);
    if (!data.length) { box.innerHTML = '<div class="empty">Ingen deler funnet</div>'; return; }

    const grouped = {};
    data.forEach(p => { (grouped[p.category] = grouped[p.category]||[]).push(p); });

    box.innerHTML = Object.entries(grouped).map(([cat, items]) => `
      <div class="sl">${CAT_LABEL[cat]||cat}</div>
      ${items.map(p => partRow(p)).join('')}
    `).join('');

    box.querySelectorAll('[data-replace]').forEach(btn => {
      btn.onclick = () => showReplaceForm(btn.dataset.replace, btn.dataset.name);
    });
  } catch(e) {
    box.innerHTML = `<div class="empty">Feil: ${e.message}</div>`;
  }
}

function partRow(p) {
  const today   = new Date().toISOString().slice(0,10);
  const overdue = p.next_due_date && p.next_due_date <= today;
  const dueSoon = p.next_due_date && !overdue && new Date(p.next_due_date) <= new Date(Date.now() + 60*24*60*60*1000);
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

function showReplaceForm(id, name) {
  document.getElementById('replace-form-'+id)?.remove();
  const form = document.createElement('div');
  form.id = 'replace-form-'+id;
  form.className = 'al';
  form.style.cssText = 'margin:4px 0 8px;flex-direction:column;gap:8px';
  form.innerHTML = `
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.8rem;letter-spacing:.04em;text-transform:uppercase">Registrer bytte: ${name}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <div>
        <label style="font-size:.65rem;color:var(--ink-light);display:block;margin-bottom:3px">Dato</label>
        <input id="rp-date-${id}" type="date" value="${new Date().toISOString().slice(0,10)}" class="set-inp" style="width:auto;border-bottom:1px solid var(--line)">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--ink-light);display:block;margin-bottom:3px">Motortimer</label>
        <input id="rp-hours-${id}" type="number" placeholder="1085" class="set-inp" style="width:120px;border-bottom:1px solid var(--line)">
      </div>
    </div>
    <input id="rp-notes-${id}" placeholder="Notater" class="set-inp" style="border-bottom:1px solid var(--line)">
    <div style="display:flex;gap:8px">
      <button class="btn-primary" id="rp-save-${id}">Lagre bytte</button>
      <button class="btn-secondary" onclick="document.getElementById('replace-form-${id}').remove()">Avbryt</button>
    </div>`;

  const btn = document.querySelector(`[data-replace="${id}"]`);
  btn?.closest('.dui')?.after(form);

  document.getElementById('rp-save-'+id).onclick = async () => {
    await parts.replace(id, {
      date:  document.getElementById('rp-date-'+id).value,
      hours: document.getElementById('rp-hours-'+id).value ? parseFloat(document.getElementById('rp-hours-'+id).value) : null,
      notes: document.getElementById('rp-notes-'+id).value,
    });
    form.remove();
    toast('Bytte registrert ✓', 'ok');
    await loadParts();
  };
}

function showPartForm() {
  const existing = document.getElementById('part-add-form');
  if (existing) { existing.remove(); return; }
  const form = document.createElement('div');
  form.id = 'part-add-form';
  form.className = 'al';
  form.style.cssText = 'margin-bottom:16px;flex-direction:column;gap:8px';
  form.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div>
        <label style="font-size:.65rem;color:var(--ink-light);display:block;margin-bottom:3px">Navn *</label>
        <input id="pf-name" placeholder="f.eks. Oljefilter" class="set-inp" style="border-bottom:2px solid var(--blue)">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--ink-light);display:block;margin-bottom:3px">Kategori</label>
        <select id="pf-cat" class="set-inp" style="border-bottom:1px solid var(--line)">
          ${Object.entries(CAT_LABEL).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--ink-light);display:block;margin-bottom:3px">System</label>
        <input id="pf-sys" placeholder="Volvo Penta D6" class="set-inp" style="border-bottom:1px solid var(--line)">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--ink-light);display:block;margin-bottom:3px">Delenummer</label>
        <input id="pf-pno" class="set-inp" style="font-family:'DM Mono',monospace;border-bottom:1px solid var(--line)">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--ink-light);display:block;margin-bottom:3px">Intervall (mnd)</label>
        <input id="pf-months" type="number" class="set-inp" style="border-bottom:1px solid var(--line)">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--ink-light);display:block;margin-bottom:3px">Intervall (timer)</label>
        <input id="pf-hours-int" type="number" class="set-inp" style="border-bottom:1px solid var(--line)">
      </div>
    </div>
    <textarea id="pf-notes" placeholder="Notater" rows="2" style="font-family:inherit;font-size:.82rem;border:none;border-bottom:1px solid var(--line);padding:9px 12px;background:var(--surface);outline:none;resize:vertical"></textarea>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" id="pf-save">Lagre del</button>
      <button class="btn-secondary" onclick="document.getElementById('part-add-form').remove()">Avbryt</button>
    </div>`;

  document.getElementById('parts-list').before(form);
  document.getElementById('pf-save').onclick = async () => {
    const name = document.getElementById('pf-name').value.trim();
    if (!name) return;
    await parts.create({
      name, category: document.getElementById('pf-cat').value,
      system:          document.getElementById('pf-sys').value.trim() || null,
      part_number:     document.getElementById('pf-pno').value.trim() || null,
      interval_months: document.getElementById('pf-months').value    || null,
      interval_hours:  document.getElementById('pf-hours-int').value  || null,
      notes:           document.getElementById('pf-notes').value.trim()|| null,
    });
    form.remove();
    toast('Del lagt til', 'ok');
    await loadParts();
  };
}
