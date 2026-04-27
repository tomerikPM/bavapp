'use strict';
// routes/sauna.js — Smeigedag Sauna Bystranda (Kristiansand) ledighet
//
// Smeigedag bruker bookingsystemet Periode (Firebase/Firestore). Slot-data er
// offentlig lesbar via Firestore REST API uten auth — vi henter ledighet for
// uken framover for de fire badstuene på Bystranda:
//   • Drømmeren — privat (cap 1) + felles (cap 8)
//   • Oksøy     — privat (cap 1) + felles (cap 15)
//
// Slot-dokument: dateSlots/{merchantId}/manifests/{manifestId}/slots/{YYYY-MM-DD}
// Hvert dokument har en `slots`-array med en innførsel per startklokkeslett:
//   { time:18, length:1, available:1, booked:0, reserved:0, priceAdjustments:1, ... }
//
// Cache: 60s in-memory på slot-data (folk booker fortløpende, vi vil ikke vise
// stale data lenger enn nødvendig). Manifest-metadata (navn/pris) caches 24t.

const express = require('express');
const https   = require('https');
const router  = express.Router();

// ── Konfig ──────────────────────────────────────────────────────────────────
const PROJECT      = 'periode-prod';
const MERCHANT_ID  = 'YAadvG0POHdhx6Mf3qfI';
const FIRESTORE    = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// Bystranda-spesifikke booking-grupper (URL-er på smeigedagsauna.no/no/kristiansand)
const BOOKING_GROUPS = {
  privatBystranda: 'T2rYrnzoW7U3VTBJpV3o',  // Privat badstue Bystranda
  fellesBystranda: 'ctqelrzxGaYWMh4YFfZS',  // Felles badstue Bystranda
};

// De fire badstuene vi viser. Booking-URL bygges per manifest mot dens
// tilhørende booking-gruppe — Periode-app-en åpner alltid på dato.
const SAUNAS = [
  { id: 'S65MTAATSDzH1QpspfQn', name: 'Drømmeren', kind: 'Privat', groupId: BOOKING_GROUPS.privatBystranda, sortKey: 1 },
  { id: 'dIJcPbrfsFZ09StavEm2', name: 'Drømmeren', kind: 'Felles', groupId: BOOKING_GROUPS.fellesBystranda, sortKey: 2 },
  { id: '2puco5bimBtW2rwoVrDx', name: 'Oksøy',     kind: 'Privat', groupId: BOOKING_GROUPS.privatBystranda, sortKey: 3 },
  { id: 'BRXOrhpwIsm4boW2ZSK8', name: 'Oksøy',     kind: 'Felles', groupId: BOOKING_GROUPS.fellesBystranda, sortKey: 4 },
];

const SLOT_TTL_MS     = 60 * 1000;       // 60s — folk booker fortløpende
const MANIFEST_TTL_MS = 24 * 3600_000;   // 24t — navn/pris/kapasitet endrer seg sjelden
const FETCH_TIMEOUT   = 8000;
const CONCURRENCY     = 6;

// ── In-memory cache ─────────────────────────────────────────────────────────
const _slotCache     = new Map();   // key: `${manifestId}|${date}` → { ts, data }
const _manifestCache = new Map();   // key: manifestId               → { ts, data }

// ── HTTP helper ─────────────────────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: FETCH_TIMEOUT }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end',  () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('Ugyldig JSON: ' + e.message)); }
        } else if (res.statusCode === 404) {
          resolve(null);  // ingen slots på denne datoen — normalt
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Parallell fetch med concurrency-grense
async function parallelLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try { results[i] = await fn(items[i]); }
      catch (e) { results[i] = { error: e.message }; }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── Firestore-felt → JS-verdi ────────────────────────────────────────────────
// Firestore REST returnerer typede wrappers: { stringValue }, { integerValue },
// { mapValue: { fields: {...} } }, { arrayValue: { values: [...] } } osv.
function fsValue(v) {
  if (!v) return null;
  if ('stringValue'  in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue'  in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue'    in v) return null;
  if ('arrayValue'   in v) return (v.arrayValue.values || []).map(fsValue);
  if ('mapValue'     in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = fsValue(val);
    return out;
  }
  return null;
}

function fsFields(doc) {
  if (!doc || !doc.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) out[k] = fsValue(v);
  return out;
}

// ── Manifest-metadata (navn, pris, kapasitet, bilde) ────────────────────────
async function getManifest(manifestId) {
  const cached = _manifestCache.get(manifestId);
  if (cached && Date.now() - cached.ts < MANIFEST_TTL_MS) return cached.data;

  const doc = await fetchJson(`${FIRESTORE}/bookingManifests/${manifestId}`);
  const f   = fsFields(doc) || {};
  const data = {
    name:        f.name        || null,
    priceOre:    f.price       || null,            // pris i øre
    capacity:    f.capacity    || null,
    imageUrl:    f.imageUrl    || null,
    description: f.description || null,
  };
  _manifestCache.set(manifestId, { ts: Date.now(), data });
  return data;
}

// ── Slot-data per manifest per dato ─────────────────────────────────────────
async function getSlots(manifestId, dateStr) {
  const key    = `${manifestId}|${dateStr}`;
  const cached = _slotCache.get(key);
  if (cached && Date.now() - cached.ts < SLOT_TTL_MS) return cached.data;

  const doc = await fetchJson(
    `${FIRESTORE}/dateSlots/${MERCHANT_ID}/manifests/${manifestId}/slots/${dateStr}`,
  );
  const f = fsFields(doc);
  // Hvis ingen slot-dok → ingen åpne timer. Returner tom liste.
  const slots = (f && Array.isArray(f.slots)) ? f.slots : [];

  // Filter ut deleted/cancelled på Firestore-nivå er allerede gjort av appen,
  // men vi rydder selv også for sikkerhets skyld.
  const cleaned = slots
    .filter(s => !s.deleted && !s.cancelled)
    .map(s => ({
      time:             s.time             ?? 0,
      length:           s.length           ?? 1,
      available:        s.available        ?? 0,
      booked:           s.booked           ?? 0,
      reserved:         s.reserved         ?? 0,
      confirmed:        s.confirmed        ?? 0,
      onlyMembers:      !!s.onlyMembers,
      priceAdjustments: s.priceAdjustments ?? 1,
    }));

  _slotCache.set(key, { ts: Date.now(), data: cleaned });
  return cleaned;
}

// ── Hjelpere ────────────────────────────────────────────────────────────────
// Datoliste i Europe/Oslo for de neste N dagene (inkludert i dag).
function osloDateList(days) {
  const out = [];
  // sv-SE locale gir "YYYY-MM-DD" — uavhengig av server-TZ.
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 86400_000);
    const s = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
    out.push(s);
  }
  return out;
}

function osloHourNow() {
  const s = new Date().toLocaleString('en-GB', {
    timeZone: 'Europe/Oslo', hour: '2-digit', hour12: false,
  });
  return parseInt(s, 10);
}

function bookingUrl(sauna, dateStr) {
  return `https://minside.periode.no/bookinggroups/${MERCHANT_ID}/${sauna.groupId}/${dateStr}`;
}

// ── API: GET /api/sauna/week ─────────────────────────────────────────────────
// Returnerer 7 dager × 4 badstuer med ledighet per time.
router.get('/week', async (req, res) => {
  const days       = Math.max(1, Math.min(14, parseInt(req.query.days || '7', 10)));
  const dates      = osloDateList(days);
  const todayStr   = dates[0];
  const hourNow    = osloHourNow();

  try {
    // Fetch manifest-metadata parallelt
    const manifests = await parallelLimit(SAUNAS, CONCURRENCY, s => getManifest(s.id));

    // Fetch slots: 4 saunas × 7 dager = 28 requests, med concurrency-cap
    const tasks = [];
    for (const sauna of SAUNAS) {
      for (const date of dates) tasks.push({ sauna, date });
    }
    const slotResults = await parallelLimit(tasks, CONCURRENCY, async ({ sauna, date }) => {
      const slots = await getSlots(sauna.id, date);
      return { saunaId: sauna.id, date, slots };
    });

    // Bygg respons: én entry per badstue, med dager nestet
    const slotMap = new Map();  // saunaId → date → slots
    for (const r of slotResults) {
      if (!r || r.error) continue;
      if (!slotMap.has(r.saunaId)) slotMap.set(r.saunaId, new Map());
      slotMap.get(r.saunaId).set(r.date, r.slots);
    }

    const saunas = SAUNAS.map((s, i) => {
      const m = manifests[i] || {};
      const priceNok = m.priceOre ? Math.round(m.priceOre / 100) : null;
      const dayList  = dates.map(date => {
        const slots = (slotMap.get(s.id) || new Map()).get(date) || [];
        const enriched = slots.map(slot => {
          const slotPriceNok = priceNok != null
            ? Math.round(priceNok * (slot.priceAdjustments || 1))
            : null;
          const isPast  = (date === todayStr) && (slot.time + slot.length <= hourNow);
          const remaining = Math.max(0, slot.available);
          return {
            time:        slot.time,
            length:      slot.length,
            available:   remaining,
            isPast,
            isFull:      remaining === 0,
            onlyMembers: slot.onlyMembers,
            priceNok:    slotPriceNok,
          };
        }).sort((a, b) => a.time - b.time);

        return {
          date,
          slots:        enriched,
          totalSlots:   enriched.length,
          openSlots:    enriched.filter(x => !x.isPast && !x.isFull).length,
        };
      });

      return {
        id:        s.id,
        name:      s.name,
        kind:      s.kind,
        capacity:  m.capacity || null,
        priceNok,
        imageUrl:  m.imageUrl || null,
        groupId:   s.groupId,
        bookingUrl: bookingUrl(s, todayStr),
        days:      dayList,
      };
    });

    res.json({
      saunas,
      fetchedAt: new Date().toISOString(),
      today:     todayStr,
      hourNow,
      timezone:  'Europe/Oslo',
      source:    'periode.no',
    });
  } catch (e) {
    console.error('[sauna] /week feilet:', e.message);
    res.status(502).json({ error: 'Kunne ikke hente badstue-data', detail: e.message });
  }
});

// GET /api/sauna/status — debug: cache-stats
router.get('/status', (req, res) => {
  res.json({
    slotCacheEntries:     _slotCache.size,
    manifestCacheEntries: _manifestCache.size,
    slotTtlSeconds:       SLOT_TTL_MS / 1000,
    manifestTtlHours:     MANIFEST_TTL_MS / 3600_000,
    saunas:               SAUNAS.map(s => ({ id: s.id, name: s.name, kind: s.kind })),
  });
});

module.exports = router;
