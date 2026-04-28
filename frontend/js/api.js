// api.js — alle kall mot Bavaria32 backend og Signal K

function autoBackendUrl() {
  const stored = localStorage.getItem('backend_url');
  if (stored) return stored;
  const { protocol, hostname, port } = window.location;
  if (port === '3001') return `${protocol}//${hostname}:3001`;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return window.location.origin;
  return 'http://localhost:3001';
}

const CFG = {
  backend:   autoBackendUrl(),
  signalk:   localStorage.getItem('signalk_url') || 'http://localhost:3000',
  anthropic: localStorage.getItem('api_key') || '',
};

export function setConfig(key, val) {
  CFG[key] = val;
  localStorage.setItem(key === 'backend' ? 'backend_url' :
                       key === 'signalk' ? 'signalk_url' : 'api_key', val);
}
export function getConfig() { return { ...CFG }; }

async function req(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = timeout ? setTimeout(() => controller.abort(new Error('Forespørselen tok for lang tid')), timeout) : null;
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (timer) clearTimeout(timer);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (e) {
    if (timer) clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error(e.cause?.message || 'Forespørselen tok for lang tid (timeout)');
    throw e;
  }
}

function b(path) { return `${CFG.backend}/api${path}`; }
function j(body) { return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function put(body) { return { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function patch(body) { return { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function del() { return { method: 'DELETE' }; }

export const health = () => req(b('/health'));

export const events = {
  list:   (params = {}) => req(b('/events?' + new URLSearchParams(params))),
  create: (data)        => req(b('/events'), j(data)),
  ack:    (id)          => req(b(`/events/${id}/ack`), patch({})),
  delete: (id)          => req(b(`/events/${id}`), del()),
};

export const docs = {
  list:   (params = {}) => req(b('/docs?' + new URLSearchParams(params))),
  get:    (id)          => req(b(`/docs/${id}`)),
  update: (id, data)    => req(b(`/docs/${id}`), patch(data)),
  delete: (id)          => req(b(`/docs/${id}`), del()),
  upload: (formData)    => req(b('/docs'), { method: 'POST', body: formData }, 60000),
};

export const parts = {
  list:    (params = {}) => req(b('/parts?' + new URLSearchParams(params))),
  get:     (id)          => req(b(`/parts/${id}`)),
  create:  (data)        => req(b('/parts'), j(data)),
  update:  (id, data)    => req(b(`/parts/${id}`), put(data)),
  replace: (id, data)    => req(b(`/parts/${id}/replace`), j(data)),
  delete:  (id)          => req(b(`/parts/${id}`), del()),
};

export const maintenance = {
  list:   (params = {}) => req(b('/maintenance?' + new URLSearchParams(params))),
  get:    (id)          => req(b(`/maintenance/${id}`)),
  create: (data)        => req(b('/maintenance'), j(data)),
  update: (id, data)    => req(b(`/maintenance/${id}`), put(data)),
  delete: (id)          => req(b(`/maintenance/${id}`), del()),
};

export const trips = {
  list:   (params = {}) => req(b('/trips?' + new URLSearchParams(params))),
  get:    (id)          => req(b(`/trips/${id}`)),
  create: (data)        => req(b('/trips'), j(data)),
  update: (id, data)    => req(b(`/trips/${id}`), put(data)),
  delete: (id)          => req(b(`/trips/${id}`), del()),
};

export const costs = {
  list:    (params = {}) => req(b('/costs?' + new URLSearchParams(params))),
  summary: (params = {}) => req(b('/costs/summary?' + new URLSearchParams(params))),
  get:     (id)          => req(b(`/costs/${id}`)),
  create:  (data)        => req(b('/costs'), j(data)),
  update:  (id, data)    => req(b(`/costs/${id}`), put(data)),
  delete:  (id)          => req(b(`/costs/${id}`), del()),
};

export const sensors = {
  latest:  ()             => req(b('/sensors/latest')),
  history: (path, params) => req(b(`/sensors/${encodeURIComponent(path)}/history?` + new URLSearchParams(params))),
  batch:   (readings)     => req(b('/sensors/batch'), j({ readings })),
};

export async function askClaude(messages, systemPrompt) {
  if (!CFG.anthropic) throw new Error('API-nøkkel mangler');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CFG.anthropic,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
    const data = await res.json();
    return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  } catch (e) { clearTimeout(timer); throw e; }
}
