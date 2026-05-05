'use strict';
// routes/fuel.js — Dieselpriser fra pumpepriser.no
//
// Skraping-strategi:
//   Sesong (15. april – 1. oktober):  hvert 12. time
//   Utenom sesong:                     én gang per uke
//
// Data-kilde: pumpepriser.no (HTML-skraping, ingen auth nødvendig)
// URL-struktur: /stasjonsdata/{id}/{navn}/{kommune}/{fylke}/{d1}/{d2}/{d3}/{d4}/{b1}/{b2}/{b3}/{b4}/nei/
//
// Nærhetssøk: Haversine-avstand fra båtens posisjon (default: Kristiansand).
// Kommunenavn → koordinater via innebygd oppslagstabell (~220 norske kystkommuber).

const express = require('express');
const https   = require('https');
const http    = require('http');
const db      = require('../db');
const { scrapeBunkring } = require('../scrapers/bunkring');
const router  = express.Router();

// ── Sesongregler (pumpepriser) ──────────────────────────────────────────────
const SEASON_START_MM = 4; const SEASON_START_DD = 15; // 15. april
const SEASON_END_MM   = 10; const SEASON_END_DD   = 1;  // 1. oktober
const TTL_SEASON_MS    = 12 * 3600_000;   // 12 timer i sesong
const TTL_OFFSEASON_MS = 7  * 86400_000;  // 7 dager utenom sesong
const TTL_BUNKRING_MS  = 24 * 3600_000;   // Bunkring oppdateres daglig (brukersubmittert)

// ── Scrape-radius rundt båtens siste kjente GPS-posisjon ────────────────────
// Begrenser bunkring-scraperen til marinaer nær båten for å spare requests.
// Siste posisjon oppdateres hver gang frontend kaller /prices (live GPS eller
// brukerkonfigurert hjemmehavn-fallback). Fallback hvis aldri kalt: Kristiansand.
const SCRAPE_RADIUS_KM = parseFloat(process.env.SCRAPE_RADIUS_KM) || 50;
const FALLBACK_LAT     = parseFloat(process.env.FALLBACK_LAT) || 58.1467;  // Kristiansand
const FALLBACK_LON     = parseFloat(process.env.FALLBACK_LON) || 7.9956;

let _lastKnownPosition = { lat: FALLBACK_LAT, lon: FALLBACK_LON, ts: null };

function isBoatSeason(d = new Date()) {
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const after  = mm > SEASON_START_MM || (mm === SEASON_START_MM && dd >= SEASON_START_DD);
  const before = mm < SEASON_END_MM   || (mm === SEASON_END_MM   && dd < SEASON_END_DD);
  return after && before;
}

function cacheTtlMs() {
  return isBoatSeason() ? TTL_SEASON_MS : TTL_OFFSEASON_MS;
}

// ── SQLite cache-tabell ─────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS fuel_cache (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    scraped_at   TEXT    NOT NULL,
    station_id   TEXT    NOT NULL,
    name         TEXT    NOT NULL,
    municipality TEXT    NOT NULL,
    county       TEXT    NOT NULL,
    diesel       REAL,
    petrol       REAL,
    lat          REAL,
    lon          REAL,
    UNIQUE(scraped_at, station_id)
  );
  CREATE INDEX IF NOT EXISTS idx_fuel_scraped ON fuel_cache(scraped_at DESC);
`);

// Migrasjon: legg til kolonner hvis de mangler
try {
  const cols = db.prepare(`PRAGMA table_info(fuel_cache)`).all();
  if (!cols.some(c => c.name === 'price_updated_at')) {
    db.exec(`ALTER TABLE fuel_cache ADD COLUMN price_updated_at TEXT`);
    console.log('[fuel] Migrasjon: la til kolonne price_updated_at');
  }
  if (!cols.some(c => c.name === 'raw_timestamp')) {
    db.exec(`ALTER TABLE fuel_cache ADD COLUMN raw_timestamp TEXT`);
    console.log('[fuel] Migrasjon: la til kolonne raw_timestamp');
  }
  if (!cols.some(c => c.name === 'source')) {
    db.exec(`ALTER TABLE fuel_cache ADD COLUMN source TEXT`);
    db.exec(`UPDATE fuel_cache SET source = 'pumpepriser' WHERE source IS NULL`);
    console.log('[fuel] Migrasjon: la til kolonne source (eksisterende rader = pumpepriser)');
  }
  if (!cols.some(c => c.name === 'fuel_grade')) {
    db.exec(`ALTER TABLE fuel_cache ADD COLUMN fuel_grade TEXT`);
    console.log('[fuel] Migrasjon: la til kolonne fuel_grade');
  }
  if (!cols.some(c => c.name === 'slug')) {
    db.exec(`ALTER TABLE fuel_cache ADD COLUMN slug TEXT`);
    console.log('[fuel] Migrasjon: la til kolonne slug');
  }
  if (!cols.some(c => c.name === 'coords_precise')) {
    db.exec(`ALTER TABLE fuel_cache ADD COLUMN coords_precise INTEGER DEFAULT 0`);
    db.exec(`UPDATE fuel_cache SET coords_precise = 1 WHERE source = 'bunkring'`);
    console.log('[fuel] Migrasjon: la til kolonne coords_precise (bunkring=1)');
  }
} catch (e) {
  console.error('[fuel] Migrasjonsfeil:', e.message);
}

// Stasjonshistorikk — cache av crowd-sourced bekreftelser fra pumpepriser.no
db.exec(`
  CREATE TABLE IF NOT EXISTS fuel_station_history (
    station_id                TEXT PRIMARY KEY,
    last_diesel_confirmed_at  TEXT,
    last_diesel_confirmed_by  TEXT,
    last_petrol_confirmed_at  TEXT,
    last_petrol_confirmed_by  TEXT,
    total_entries             INTEGER,
    history_json              TEXT,
    fetched_at                TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_station_history_fetched ON fuel_station_history(fetched_at DESC);
`);

const STATION_HISTORY_TTL_MS = 24 * 3600_000;  // 24 timer

// Parse norsk dato som "1. apr 2026" eller "14. mar 2026"
const NO_MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, mai: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, des: 11,
};
function parseNoDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\.\s*([a-zæøå]+)\s+(\d{4})$/i);
  if (!m) return null;
  const [, day, monStr, year] = m;
  const month = NO_MONTHS[monStr.toLowerCase().slice(0, 3)];
  if (month == null) return null;
  // Kl. 12:00 UTC for å unngå tidssoneforskjeller ved sammenligning
  return new Date(Date.UTC(+year, month, +day, 12, 0, 0)).toISOString();
}

// Analyser historikk-array og finn nyeste bekreftelse per drivstofftype
function analyzeHistory(history) {
  const withIso = history
    .map(h => ({ ...h, iso: parseNoDate(h.hdato) }))
    .filter(h => h.iso);

  const diesel = withIso
    .filter(h => h.drivstoff && h.drivstoff.toLowerCase() === 'diesel')
    .sort((a, b) => b.iso.localeCompare(a.iso))[0];

  const petrol = withIso
    .filter(h => h.drivstoff && h.drivstoff.toLowerCase() === 'bensin')
    .sort((a, b) => b.iso.localeCompare(a.iso))[0];

  return {
    last_diesel_confirmed_at: diesel?.iso || null,
    last_diesel_confirmed_by: diesel?.hperson || null,
    last_petrol_confirmed_at: petrol?.iso || null,
    last_petrol_confirmed_by: petrol?.hperson || null,
    total_entries: history.length,
  };
}

// Hent historikk fra pumpepriser.no for én stasjon
async function fetchStationHistoryRaw(stationId) {
  const url = `https://www.pumpepriser.no/database/stasjonsdata.php?id=${stationId}`;
  const r = await fetchUrl(url);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const parsed = JSON.parse(r.body);
  if (!Array.isArray(parsed)) throw new Error('Uventet respons-format');
  return parsed;
}

// Hent cached historikk eller fetch hvis stale. Returnerer null ved feil.
async function getStationHistory(stationId) {
  const cached = db.prepare(
    `SELECT * FROM fuel_station_history WHERE station_id = ?`
  ).get(stationId);

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < STATION_HISTORY_TTL_MS) return cached;
  }

  try {
    const history  = await fetchStationHistoryRaw(stationId);
    const analysis = analyzeHistory(history);
    const row = {
      station_id:   String(stationId),
      ...analysis,
      history_json: JSON.stringify(history),
      fetched_at:   new Date().toISOString(),
    };
    db.prepare(`
      INSERT OR REPLACE INTO fuel_station_history
        (station_id, last_diesel_confirmed_at, last_diesel_confirmed_by,
         last_petrol_confirmed_at, last_petrol_confirmed_by,
         total_entries, history_json, fetched_at)
      VALUES
        (@station_id, @last_diesel_confirmed_at, @last_diesel_confirmed_by,
         @last_petrol_confirmed_at, @last_petrol_confirmed_by,
         @total_entries, @history_json, @fetched_at)
    `).run(row);
    return row;
  } catch (e) {
    console.warn(`[fuel] Kunne ikke hente historikk for stasjon ${stationId}:`, e.message);
    return cached || null;  // fallback til gammel cache hvis fetch feilet
  }
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

// ── Cross-source dedup ──────────────────────────────────────────────────────
// Samme marina registreres ofte på både pumpepriser.no og bunkring.no. Vi
// matcher på normalisert navn (lowercase, strippet for marina-/gjestehavn-
// suffikser) og beholder raden med nyeste bekreftelses-tidsstempel.
function normalizeStationName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+(marina|gjestehavn|småbåthavn|smabathavn|båtforening|batforening|bryggen?|havn|kai)$/i, '')
    .replace(/[^a-zæøå0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rowTimestamp(r) {
  // Nyeste pålitelige tidsstempel: bunkring bruker raw_timestamp, pumpepriser
  // har den ikke her (historikken hentes senere). Fall tilbake til price_updated_at.
  return r.raw_timestamp || r.price_updated_at || '';
}

function dedupeAcrossSources(rows) {
  const byKey = new Map();  // normName → [rows]
  for (const r of rows) {
    const key = normalizeStationName(r.name);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }

  const drop = new Set();  // station_ids som skal fjernes
  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    const hasBoth = group.some(r => r.source === 'bunkring') &&
                    group.some(r => r.source === 'pumpepriser');
    if (!hasBoth) continue;  // bare dedupliser når begge kilder har navnet
    group.sort((a, b) => rowTimestamp(b).localeCompare(rowTimestamp(a)));
    for (let i = 1; i < group.length; i++) drop.add(group[i].station_id);
  }
  return rows.filter(r => !drop.has(r.station_id));
}

// ── Haversine-avstand (km) ──────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2
          + Math.cos(lat1 * Math.PI / 180)
          * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Kommune → koordinater (kystlinje + innlandet) ──────────────────────────
// Dekker norske kystkommuber fra Halden til Hammerfest + viktige innlandskommuber
const MUNI_COORDS = {
  // ── Agder ──
  'Kristiansand': [58.15, 7.99], 'Lillesand': [58.25, 8.37], 'Grimstad': [58.34, 8.59],
  'Arendal': [58.46, 8.77], 'Tvedestrand': [58.62, 8.92], 'Risør': [58.72, 9.23],
  'Farsund': [58.10, 6.80], 'Flekkefjord': [58.30, 6.66], 'Lindesnes': [58.04, 7.07],
  'Mandal': [58.03, 7.45], 'Lyngdal': [58.14, 7.08], 'Kvinesdal': [58.32, 6.94],
  'Sirdal': [58.64, 6.86], 'Evje og Hornnes': [58.60, 7.72],

  // ── Vestfold og Telemark ──
  'Porsgrunn': [59.14, 9.66], 'Bamble': [59.04, 9.61], 'Kragerø': [58.87, 9.41],
  'Drangedal': [59.09, 9.08], 'Larvik': [59.05, 10.03], 'Sandefjord': [59.13, 10.22],
  'Tønsberg': [59.27, 10.41], 'Horten': [59.42, 10.50], 'Holmestrand': [59.49, 10.31],
  'Stavanger': [58.97, 5.73], 'Færder': [59.15, 10.35], 'Nome': [59.42, 9.17],
  'Midt-Telemark': [59.29, 9.15], 'Tokke': [59.45, 8.12], 'Kviteseid': [59.40, 8.48],

  // ── Viken / Østfold / Akershus ──
  'Hvaler': [59.08, 10.88], 'Fredrikstad': [59.22, 10.93], 'Sarpsborg': [59.28, 11.11],
  'Halden': [59.12, 11.39], 'Råde': [59.34, 10.86], 'Moss': [59.44, 10.66],
  'Vestby': [59.60, 10.75], 'Frogn': [59.61, 10.67], 'Nesodden': [59.67, 10.67],
  'Bærum': [59.90, 10.52], 'Asker': [59.83, 10.44], 'Nordre Follo': [59.72, 10.85],
  'Ås': [59.66, 10.79],

  // ── Oslo ──
  'Oslo': [59.91, 10.75],

  // ── Rogaland ──
  'Sola': [58.88, 5.60], 'Sandnes': [58.85, 5.73], 'Eigersund': [58.46, 6.01],
  'Karmøy': [59.28, 5.30], 'Haugesund': [59.41, 5.27], 'Tysvær': [59.38, 5.50],
  'Vindafjord': [59.55, 5.77], 'Suldal': [59.52, 6.40], 'Strand': [58.97, 6.04],
  'Hjelmeland': [59.23, 6.17], 'Sauda': [59.65, 6.35], 'Bokn': [59.22, 5.43],
  'Utsira': [59.31, 4.88], 'Kvitsøy': [59.07, 5.41],

  // ── Vestland ──
  'Bergen': [60.39, 5.32], 'Askøy': [60.39, 5.17], 'Øygarden': [60.52, 4.91],
  'Alver': [60.61, 5.36], 'Austrheim': [60.76, 5.07], 'Fedje': [60.77, 4.72],
  'Gulen': [60.98, 5.37], 'Solund': [61.08, 4.82], 'Askvoll': [61.35, 5.07],
  'Fjaler': [61.31, 5.36], 'Gaular': [61.36, 5.85], 'Jølster': [61.53, 6.03],
  'Gloppen': [61.76, 6.17], 'Stad': [62.18, 5.14], 'Kinn': [61.80, 5.02],
  'Bremanger': [61.84, 4.99], 'Vik': [61.07, 6.57], 'Aurland': [60.90, 7.18],
  'Lærdal': [61.10, 7.47], 'Sogndal': [61.23, 7.10], 'Luster': [61.43, 7.48],
  'Årdal': [61.25, 7.70], 'Høyanger': [61.22, 6.08], 'Ulvik': [60.57, 6.91],
  'Eidfjord': [60.46, 7.07], 'Ullensvang': [60.33, 6.65], 'Kvam': [60.37, 6.14],
  'Tysnes': [60.00, 5.50], 'Fitjar': [59.92, 5.54], 'Stord': [59.78, 5.50],
  'Bømlo': [59.71, 5.17], 'Etne': [59.67, 5.94], 'Samnanger': [60.38, 5.91],
  'Bjørnafjorden': [60.15, 5.49], 'Austevoll': [60.07, 5.26], 'Masfjorden': [60.85, 5.49],
  'Vaksdal': [60.49, 5.74], 'Osterøy': [60.52, 5.58], 'Lindås': [60.72, 5.32],
  'Radøy': [60.69, 5.00], 'Meland': [60.59, 5.04], 'Hyllestad': [61.17, 5.38],
  'Balestrand': [61.21, 6.52], 'Leikanger': [61.18, 6.81], 'Voss': [60.63, 6.42],
  'Granvin': [60.54, 6.72], 'Kvinnherad': [59.97, 5.89], 'Sæbø': [60.06, 5.56],
  'Odda': [60.07, 6.55], 'Rosendal': [59.98, 6.01],

  // ── Møre og Romsdal ──
  'Ålesund': [62.47, 6.15], 'Ulstein': [62.34, 5.86], 'Hareid': [62.37, 5.99],
  'Ørsta': [62.19, 6.14], 'Volda': [62.15, 6.07], 'Ørskog': [62.43, 6.79],
  'Skodje': [62.49, 6.75], 'Haram': [62.60, 6.43], 'Giske': [62.50, 6.06],
  'Sula': [62.44, 6.29], 'Sande': [62.13, 5.66], 'Herøy': [62.23, 5.48],
  'Vanylven': [62.02, 5.55], 'Sykkylven': [62.39, 6.60], 'Stranda': [62.31, 6.93],
  'Stordal': [62.40, 7.18], 'Norddal': [62.18, 7.22], 'Vestnes': [62.62, 7.05],
  'Rauma': [62.57, 7.72], 'Aukra': [62.84, 6.79], 'Molde': [62.74, 7.16],
  'Nesset': [62.65, 8.02], 'Fræna': [62.72, 6.97], 'Eide': [62.87, 7.23],
  'Averøy': [63.01, 7.59], 'Kristiansund': [63.11, 7.73], 'Aure': [63.04, 8.52],
  'Halsa': [63.10, 8.32], 'Smøla': [63.38, 8.01], 'Tingvoll': [62.91, 8.22],
  'Gjemnes': [62.88, 8.06], 'Hustadvika': [62.90, 7.12], 'Hitra': [63.55, 8.87],
  'Frøya': [63.71, 8.69], 'Sunndalsøra': [62.68, 8.56],

  // ── Trøndelag ──
  'Trondheim': [63.43, 10.39], 'Malvik': [63.44, 10.67], 'Stjørdal': [63.47, 11.01],
  'Inderøy': [63.98, 11.38], 'Verdal': [63.79, 11.49], 'Levanger': [63.75, 11.30],
  'Steinkjer': [64.01, 11.50], 'Namsos': [64.47, 11.50], 'Nærøysund': [64.78, 11.49],
  'Flatanger': [64.47, 10.84], 'Vikna': [64.87, 11.02], 'Leka': [65.10, 11.65],
  'Osen': [64.43, 10.48], 'Roan': [64.22, 10.25], 'Åfjord': [63.96, 10.13],
  'Ørland': [63.70, 9.60], 'Bjugn': [63.75, 9.69], 'Indre Fosen': [63.74, 10.12],
  'Frøya': [63.71, 8.69], 'Hitra': [63.55, 8.87], 'Snillfjord': [63.40, 9.42],
  'Hemne': [63.19, 9.17], 'Heim': [63.27, 9.08], 'Orkland': [63.30, 9.85],
  'Skaun': [63.38, 10.20], 'Melhus': [63.29, 10.28], 'Ranheim': [63.45, 10.52],

  // ── Nordland ──
  'Bodø': [67.28, 14.38], 'Fauske': [67.26, 15.39], 'Saltdal': [66.97, 15.13],
  'Meløy': [66.87, 14.16], 'Rødøy': [66.68, 13.56], 'Nesna': [66.20, 13.02],
  'Alstahaug': [65.87, 12.62], 'Brønnøy': [65.47, 12.21], 'Sømna': [65.22, 11.88],
  'Bindal': [65.11, 12.37], 'Leirfjord': [65.82, 13.21], 'Herøy': [65.89, 12.20],
  'Dønna': [66.11, 12.49], 'Træna': [66.50, 12.08], 'Lurøy': [66.42, 12.64],
  'Rana': [66.31, 14.17], 'Hattfjelldal': [65.59, 13.93], 'Grane': [65.44, 13.37],
  'Vefsn': [65.85, 13.17], 'Vevelstad': [65.55, 12.40], 'Hemnes': [66.23, 14.17],
  'Hamarøy': [68.07, 15.60], 'Narvik': [68.43, 17.43], 'Tysfjord': [68.10, 16.58],
  'Steigen': [67.87, 15.11], 'Lødingen': [68.42, 16.00], 'Tjeldsund': [68.58, 17.00],
  'Hadsel': [68.57, 14.84], 'Bø': [68.65, 14.54], 'Øksnes': [68.97, 14.88],
  'Sortland': [68.70, 15.42], 'Andøy': [69.10, 15.68], 'Moskenes': [68.09, 13.26],
  'Flakstad': [68.19, 13.43], 'Vestvågøy': [68.27, 13.73], 'Gimsøy': [68.24, 14.04],
  'Vågan': [68.21, 14.47], 'Røst': [67.53, 12.11], 'Værøy': [67.68, 12.68],
  'Evenes': [68.49, 17.05],

  // ── Troms og Finnmark ──
  'Tromsø': [69.65, 18.95], 'Harstad': [68.80, 16.54], 'Lenvik': [69.28, 17.99],
  'Berg': [69.45, 17.64], 'Torsken': [69.54, 17.04], 'Tranøy': [69.19, 17.39],
  'Dyrøy': [69.11, 17.77], 'Sørreisa': [69.14, 18.12], 'Bardu': [68.80, 18.35],
  'Salangen': [68.78, 17.49], 'Lavangen': [68.67, 17.31], 'Gratangen': [68.64, 17.08],
  'Ibestad': [68.71, 17.14], 'Skånland': [68.62, 17.35], 'Kvæfjord': [68.72, 16.62],
  'Bjarkøy': [68.82, 16.58], 'Senja': [69.20, 17.40], 'Alta': [69.97, 23.27],
  'Hammerfest': [70.66, 23.68], 'Nordkapp': [71.17, 25.79], 'Sør-Varanger': [69.73, 30.04],
  'Vadsø': [70.08, 29.75], 'Vardø': [70.37, 31.11], 'Båtsfjord': [70.63, 29.72],
  'Berlevåg': [70.86, 29.09], 'Gamvik': [71.06, 28.24], 'Lebesby': [70.86, 26.97],
  'Porsanger': [70.32, 25.81], 'Kvalsund': [70.28, 24.02], 'Måsøy': [71.09, 25.68],
  'Hasvik': [70.49, 22.16], 'Loppa': [70.33, 21.49], 'Karlsøy': [69.99, 19.44],
  'Lyngen': [69.82, 20.10], 'Storfjord': [69.70, 20.61], 'Kåfjord': [69.67, 21.05],
  'Skjervøy': [70.03, 20.98], 'Nordreisa': [69.76, 21.02], 'Kvænangen': [69.93, 21.97],
};

// ── Per-stasjon koordinat-overstyring for kjente marinaer ──────────────────
// Pumpepriser-kilden mangler lat/lon, og kommune-sentroide treffer ikke en
// spesifikk marina. Match på normalisert (lowercase) substring i stasjonsnavnet.
// Treff her markeres som coords_precise=1 og brukes i GPX/N2K-eksport.
const STATION_COORDS = {
  'korsvik': [58.14247307662066, 8.071205741829823],  // Korsvik båthavn, Kristiansand (verifisert)
};

function getStationCoords(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const [key, coords] of Object.entries(STATION_COORDS)) {
    if (n.includes(key)) return coords;
  }
  return null;
}

// ── Oppslag med fuzzy match for å håndtere variasjoner ──────────────────────
function getMuniCoords(municipality) {
  if (!municipality) return null;
  const clean = municipality.trim();
  // Eksakt match
  if (MUNI_COORDS[clean]) return MUNI_COORDS[clean];
  // Delvis match (f.eks. "Kristiansand Agder" → "Kristiansand")
  for (const [key, coords] of Object.entries(MUNI_COORDS)) {
    if (clean.toLowerCase().startsWith(key.toLowerCase()) ||
        key.toLowerCase().startsWith(clean.toLowerCase())) {
      return coords;
    }
  }
  return null;
}

// ── Hent JSON fra pumpepriser.no database-API ───────────────────────────────
// Endepunkt funnet via JS-kilde: database/pumpepriser.php returnerer JSON-array
function fetchStationsJson() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://www.pumpepriser.no/database/pumpepriser.php', {
      headers: {
        'User-Agent':  'Mozilla/5.0 (compatible; Bavaria32App/1.0)',
        'Accept':      'application/json, text/plain, */*',
        'Referer':     'https://www.pumpepriser.no/',
        'Origin':      'https://www.pumpepriser.no',
      },
      timeout: 30000,
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseStations(raw) {
  // Responsen er [[],[ {stid, navn, kommune, fylke, diesel, bensin, ...}, ... ]]
  // Første element er tomt array (sannsynligvis brukerspesifikke favoritter)
  let arr;
  try {
    const parsed = JSON.parse(raw);
    arr = Array.isArray(parsed[1]) ? parsed[1] : (Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    throw new Error('JSON-parsing feilet: ' + e.message);
  }

  return arr
    .filter(s => s && s.stid)
    .map(s => ({
      station_id:   String(s.stid),
      name:         s.navn        || '',
      municipality: s.kommune     || '',
      county:       s.fylke       || '',
      diesel:  s.diesel && s.diesel !== '00,00' ? parseFloat(s.diesel.replace(',', '.')) : null,
      petrol:  s.bensin && s.bensin !== '00,00' ? parseFloat(s.bensin.replace(',', '.')) : null,
      diesel_trend: s.dieselfarge || null,
      petrol_trend: s.bensinfarge || null,
      area:         s.sted        || null,
    }))
    .filter(s => s.diesel !== null || s.petrol !== null);
}

// ── Lagre til cache-tabell ───────────────────────────────────────────────────
// Ingen av kildene gir tidsstempel per pris, så vi sporer selv:
// pris lik forrige skraping → behold forrige price_updated_at.
// pris endret / ny stasjon  → sett price_updated_at = now.
//
// Kilder:
//   pumpepriser  — stasjoner har numeric station_id; koordinater slås opp fra kommune
//   bunkring     — stasjoner har "bunkring-{id}" station_id; lat/lon kommer direkte
function saveToCache(stations, scrapedAt, source = 'pumpepriser') {
  const prevStmt = db.prepare(`
    SELECT diesel, petrol, price_updated_at
    FROM fuel_cache
    WHERE station_id = ?
    ORDER BY scraped_at DESC
    LIMIT 1
  `);

  const ins = db.prepare(`
    INSERT OR REPLACE INTO fuel_cache
      (scraped_at, station_id, name, municipality, county, diesel, petrol,
       lat, lon, coords_precise, price_updated_at, raw_timestamp, source, fuel_grade, slug)
    VALUES
      (@scraped_at, @station_id, @name, @municipality, @county, @diesel, @petrol,
       @lat, @lon, @coords_precise, @price_updated_at, @raw_timestamp, @source, @fuel_grade, @slug)
  `);
  const tx = db.transaction(rows => { for (const r of rows) ins.run(r); });

  let changed = 0, unchanged = 0, newlySeen = 0;

  const rows = stations.map(s => {
    // Koordinater: bunkring leverer dem; pumpepriser trenger oppslag.
    // coords_precise=1 betyr at posisjonen er stasjonens egen (bunkring eller
    // STATION_COORDS-overlay). =0 er kommune-sentroide-fallback — duger til
    // distansesortering, men ikke til GPX-export eller N2K-navigasjon.
    let lat = s.lat ?? null;
    let lon = s.lon ?? null;
    let coordsPrecise = (lat != null && lon != null) ? 1 : 0;
    if (!coordsPrecise) {
      const stationCoords = getStationCoords(s.name);
      if (stationCoords) {
        lat = stationCoords[0]; lon = stationCoords[1];
        coordsPrecise = 1;
      } else if (s.municipality) {
        const muniCoords = getMuniCoords(s.municipality);
        if (muniCoords) { lat = muniCoords[0]; lon = muniCoords[1]; }
      }
    }

    const prev = prevStmt.get(s.station_id);
    let priceChangedAt;
    if (!prev) {
      priceChangedAt = scrapedAt;
      newlySeen++;
    } else if (prev.diesel === s.diesel && prev.petrol === s.petrol) {
      priceChangedAt = prev.price_updated_at || scrapedAt;
      unchanged++;
    } else {
      priceChangedAt = scrapedAt;
      changed++;
    }

    return {
      scraped_at:       scrapedAt,
      station_id:       s.station_id,
      name:             s.name,
      municipality:     s.municipality,
      county:           s.county,
      diesel:           s.diesel,
      petrol:           s.petrol,
      lat,
      lon,
      coords_precise:   coordsPrecise,
      price_updated_at: priceChangedAt,
      raw_timestamp:    s.raw_timestamp || null,
      source:           s.source || source,
      fuel_grade:       s.fuel_grade || null,
      slug:             s.slug       || null,
    };
  });
  tx(rows);
  console.log(`[fuel:${source}] Lagret ${rows.length} stasjoner (${scrapedAt}) — ${changed} endret, ${unchanged} uendret, ${newlySeen} nye`);
}

// ── Sjekk om cache er gyldig (per kilde) ────────────────────────────────────
function getLatestScrapeTime(source) {
  const row = source
    ? db.prepare(`SELECT MAX(scraped_at) as ts FROM fuel_cache WHERE source = ?`).get(source)
    : db.prepare(`SELECT MAX(scraped_at) as ts FROM fuel_cache`).get();
  return row?.ts || null;
}

function cacheIsValid(source) {
  const latest = getLatestScrapeTime(source);
  if (!latest) return false;
  const age = Date.now() - new Date(latest).getTime();
  const ttl = source === 'bunkring' ? TTL_BUNKRING_MS : cacheTtlMs();
  return age < ttl;
}

// ── Skrape-funksjoner per kilde ──────────────────────────────────────────────
let _scraping         = false;
let _scrapingBunkring = false;

async function scrapeAndCache() {
  if (_scraping) return;
  _scraping = true;
  const startTime = Date.now();
  try {
    console.log('[fuel:pumpepriser] Starter henting fra pumpepriser.no…');
    const raw      = await fetchStationsJson();
    const stations = parseStations(raw);
    if (stations.length < 50) throw new Error(`For få stasjoner parsert: ${stations.length}`);

    const scrapedAt = new Date().toISOString();
    saveToCache(stations, scrapedAt, 'pumpepriser');
    console.log(`[fuel:pumpepriser] Ferdig: ${stations.length} stasjoner på ${Date.now()-startTime}ms`);
    return { ok: true, count: stations.length, scrapedAt };
  } catch (e) {
    console.error('[fuel:pumpepriser] Feilet:', e.message);
    return { ok: false, error: e.message };
  } finally {
    _scraping = false;
  }
}

async function scrapeBunkringAndCache() {
  if (_scrapingBunkring) return;
  _scrapingBunkring = true;
  const startTime = Date.now();
  try {
    const { lat: centerLat, lon: centerLon } = _lastKnownPosition;
    console.log(`[fuel:bunkring] Starter henting (radius ${SCRAPE_RADIUS_KM}km rundt ${centerLat.toFixed(3)},${centerLon.toFixed(3)})…`);
    const stations = await scrapeBunkring({
      centerLat,
      centerLon,
      maxRadiusKm: SCRAPE_RADIUS_KM,
    });
    if (stations.length === 0) throw new Error('Ingen marinaer med priser');

    const scrapedAt = new Date().toISOString();
    saveToCache(stations, scrapedAt, 'bunkring');
    console.log(`[fuel:bunkring] Ferdig: ${stations.length} marinaer på ${Date.now()-startTime}ms`);
    return { ok: true, count: stations.length, scrapedAt };
  } catch (e) {
    console.error('[fuel:bunkring] Feilet:', e.message);
    return { ok: false, error: e.message };
  } finally {
    _scrapingBunkring = false;
  }
}

// ── Periodisk scheduler ───────────────────────────────────────────────────────
let _schedulerTimer = null;

async function refreshIfStale() {
  if (!cacheIsValid('pumpepriser')) {
    const season = isBoatSeason();
    const ttlH   = season ? 12 : 168;
    console.log(`[fuel:pumpepriser] Cache utløpt (${season ? 'sesong' : 'vinter'}, TTL ${ttlH}t) — skraper…`);
    await scrapeAndCache();
  }
  if (!cacheIsValid('bunkring')) {
    console.log('[fuel:bunkring] Cache utløpt (TTL 24t) — skraper…');
    await scrapeBunkringAndCache();
  }
}

function startScheduler() {
  // Sjekk hvert 30. minutt om noen av kildene trenger oppdatering
  _schedulerTimer = setInterval(() => { refreshIfStale().catch(() => {}); }, 30 * 60_000);

  // Initial sjekk ved oppstart (etter 5 sekunder for å ikke forsinke oppstart)
  setTimeout(() => {
    const pump  = getLatestScrapeTime('pumpepriser');
    const bunk  = getLatestScrapeTime('bunkring');
    if (pump) console.log(`[fuel:pumpepriser] Siste skrape: ${pump}`);
    if (bunk) console.log(`[fuel:bunkring] Siste skrape: ${bunk}`);
    refreshIfStale().catch(() => {});
  }, 5000);
}

function stopScheduler() {
  if (_schedulerTimer) { clearInterval(_schedulerTimer); _schedulerTimer = null; }
}

// ── Hent stasjonens detaljside (med historikk) ───────────────────────────
function buildStationUrl(station) {
  // URL-format fra pumpepriser.no:
  // /stasjonsdata/{stid}/{navn}/{kommune}/{fylke}/{d1}/{d2}/{d3}/{d4}/{b1}/{b2}/{b3}/{b4}/nei/
  const enc = v => encodeURIComponent(String(v ?? '').trim());
  const dStr = (station.diesel != null ? station.diesel.toFixed(2) : '00.00').replace('.', '');
  const bStr = (station.petrol != null ? station.petrol.toFixed(2) : '00.00').replace('.', '');
  const [d1, d2, d3, d4] = [dStr[0]||'0', dStr[1]||'0', dStr[2]||'0', dStr[3]||'0'];
  const [b1, b2, b3, b4] = [bStr[0]||'0', bStr[1]||'0', bStr[2]||'0', bStr[3]||'0'];
  return `https://www.pumpepriser.no/stasjonsdata/${station.station_id}/${enc(station.name)}/${enc(station.municipality)}/${enc(station.county)}/${d1}/${d2}/${d3}/${d4}/${b1}/${b2}/${b3}/${b4}/nei/`;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bavaria32App/1.0)',
        'Accept':     'text/html,application/json,*/*',
        'Referer':    'https://www.pumpepriser.no/',
      },
      timeout: 30000,
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end',  () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── API-endepunkter ───────────────────────────────────────────────────────────

// GET /api/fuel/debug-html — vis rå HTML (dev-only)
router.get('/debug-html', async (req, res) => {
  try {
    const html = await fetchPage();
    // Finn første stasjonsdata-lenke
    const idx  = html.indexOf('stasjonsdata');
    const snip = idx >= 0 ? html.slice(Math.max(0, idx-50), idx+300) : 'INGEN STASJONSDATA FUNNET';
    res.json({
      size:    html.length,
      snippet: snip,
      hasLinks: html.includes('stasjonsdata'),
      linkCount: (html.match(/stasjonsdata/g)||[]).length,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fuel/prices?lat=58.15&lon=7.99&radius=150&limit=30&source=all&withHistory=1
//
// source: 'all' (default) | 'road' (pumpepriser) | 'marine' (bunkring)
router.get('/prices', async (req, res) => {
  const lat         = parseFloat(req.query.lat || String(FALLBACK_LAT));
  const lon         = parseFloat(req.query.lon || String(FALLBACK_LON));
  const radius      = parseFloat(req.query.radius || '50'); // km
  const limit       = parseInt(req.query.limit || '40');

  // Oppdater siste kjente båtposisjon så scheduleren kan fokusere neste bunkring-scrape
  if (isFinite(lat) && isFinite(lon) && Math.abs(lat) > 1) {
    _lastKnownPosition = { lat, lon, ts: new Date().toISOString() };
  }
  const withHistory = req.query.withHistory !== '0';
  const sourceParam = (req.query.source || 'all').toLowerCase();
  const wantRoad    = sourceParam === 'all' || sourceParam === 'road';
  const wantMarine  = sourceParam === 'all' || sourceParam === 'marine';

  const latestPump     = wantRoad   ? getLatestScrapeTime('pumpepriser') : null;
  const latestBunkring = wantMarine ? getLatestScrapeTime('bunkring')    : null;

  if (!latestPump && !latestBunkring) {
    if (wantRoad)   scrapeAndCache().catch(() => {});
    if (wantMarine) scrapeBunkringAndCache().catch(() => {});
    return res.json({
      data: [], status: 'scraping',
      message: 'Henter priser første gang — prøv igjen om 1–2 minutter.',
    });
  }

  const rowsQuery = db.prepare(`
    SELECT * FROM fuel_cache
    WHERE scraped_at = ? AND source = ?
      AND (diesel IS NOT NULL OR petrol IS NOT NULL)
  `);

  let rows = [];
  if (latestPump)     rows = rows.concat(rowsQuery.all(latestPump,     'pumpepriser'));
  if (latestBunkring) rows = rows.concat(rowsQuery.all(latestBunkring, 'bunkring'));

  // Dedupliser: samme marina kan finnes i begge kilder. Match på normalisert navn,
  // behold raden med nyeste bekreftelses-/tidsstempel. Innen samme kilde finnes
  // ikke duplikater (station_id er unik).
  const deduped = dedupeAcrossSources(rows);

  // Avstand + filtrering + sortering
  const withDist = deduped
    .map(r => ({
      ...r,
      source:     r.source || 'pumpepriser',
      distanceKm: (r.lat && r.lon) ? haversine(lat, lon, r.lat, r.lon) : 9999,
    }))
    .filter(r => r.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  // Stasjonshistorikk gjelder bare pumpepriser (crowd-sourced bekreftelser)
  let histories = new Array(withDist.length).fill(null);
  if (withHistory && withDist.length) {
    const t0 = Date.now();
    histories = await parallelLimit(withDist, 5, async s => {
      if (s.source !== 'pumpepriser') return null;
      return getStationHistory(s.station_id);
    });
    const fetched = histories.filter(h => h && !h.error).length;
    console.log(`[fuel] Historikk hentet for ${fetched}/${withDist.length} stasjoner på ${Date.now()-t0}ms`);
  }

  res.json({
    data: withDist.map((s, i) => {
      const h = histories[i];
      // Bunkring eksponerer raw_timestamp som lastDieselConfirmedAt så frontend
      // kan bruke samme freshness-UI for begge kilder.
      const isBunkring = s.source === 'bunkring';
      return {
        ...s,
        priceChangedAt:        s.price_updated_at,
        lastDieselConfirmedAt: isBunkring ? (s.raw_timestamp || null) : (h?.last_diesel_confirmed_at || null),
        lastDieselConfirmedBy: isBunkring ? 'bunkring.no'             : (h?.last_diesel_confirmed_by || null),
        lastPetrolConfirmedAt: isBunkring ? null                      : (h?.last_petrol_confirmed_at || null),
        lastPetrolConfirmedBy: isBunkring ? null                      : (h?.last_petrol_confirmed_by || null),
      };
    }),
    count:   withDist.length,
    total:   rows.length,
    sources: {
      pumpepriser: latestPump     ? { scrapedAt: latestPump,     ttlHours: cacheTtlMs() / 3600_000 } : null,
      bunkring:    latestBunkring ? { scrapedAt: latestBunkring, ttlHours: TTL_BUNKRING_MS / 3600_000 } : null,
    },
    scrapedAt: latestPump || latestBunkring,  // for bakoverkompatibilitet
    season:    isBoatSeason(),
    position:  { lat, lon, radiusKm: radius },
  });
});

// GET /api/fuel/station-debug/:stid — undersøk stasjonens detaljside og se etter historikk-endepunkter
router.get('/station-debug/:stid', async (req, res) => {
  const stid = req.params.stid;

  // Finn stasjonen i cache
  const latest = getLatestScrapeTime();
  if (!latest) return res.status(404).json({ error: 'Ingen priser i cache — kjør /refresh først' });

  const station = db.prepare(`
    SELECT * FROM fuel_cache WHERE station_id = ? AND scraped_at = ?
  `).get(stid, latest);
  if (!station) return res.status(404).json({ error: 'Stasjonen finnes ikke i cache' });

  const results = {};

  // Test 1: Stasjonsdata-siden (HTML)
  const stationUrl = buildStationUrl(station);
  results.stationPage = { url: stationUrl };
  try {
    const r = await fetchUrl(stationUrl);
    results.stationPage.status  = r.status;
    results.stationPage.size    = r.body.length;
    results.stationPage.isHtml  = /^<!doctype html|<html/i.test(r.body.trim());
    results.stationPage.hasHistorikk = /historikk/i.test(r.body);
    // Hvis vi finner "historikk", returner konteksten rundt
    if (results.stationPage.hasHistorikk) {
      const idx = r.body.toLowerCase().indexOf('historikk');
      results.stationPage.historikkContext = r.body.slice(Math.max(0, idx - 100), idx + 3000);
    } else {
      results.stationPage.firstChars = r.body.slice(0, 2000);
    }
  } catch (e) {
    results.stationPage.error = e.message;
  }

  // Test 2: Sannsynlige JSON-endepunkter for historikk
  const jsonCandidates = [
    `https://www.pumpepriser.no/database/historikk.php?id=${stid}`,
    `https://www.pumpepriser.no/database/historikk.php?stid=${stid}`,
    `https://www.pumpepriser.no/database/stasjon.php?id=${stid}`,
    `https://www.pumpepriser.no/database/stasjon.php?stid=${stid}`,
    `https://www.pumpepriser.no/database/stasjonsdata.php?stid=${stid}`,
  ];
  results.jsonTests = [];
  for (const url of jsonCandidates) {
    try {
      const r = await fetchUrl(url);
      const isJson = /^\s*[\[{]/.test(r.body);
      results.jsonTests.push({
        url,
        status:   r.status,
        size:     r.body.length,
        isJson,
        snippet:  r.body.slice(0, 400),
      });
    } catch (e) {
      results.jsonTests.push({ url, error: e.message });
    }
  }

  res.json({ station, ...results });
});

// GET /api/fuel/raw — debug: returner åtte eksempelstasjoner med ALLE råfelt fra API-et
router.get('/raw', async (req, res) => {
  try {
    const raw = await fetchStationsJson();
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed[1]) ? parsed[1] : (Array.isArray(parsed) ? parsed : []);
    res.json({
      totalStations: arr.length,
      availableKeys: arr[0] ? Object.keys(arr[0]) : [],
      sample: arr.slice(0, 8),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/fuel/status — cache-status og scheduler-info
router.get('/debug-html', async (req, res) => {
  try {
    const html = await fetchPage();
    // Vis de første 3000 tegnene og tell href-treff
    const hrefCount = (html.match(/href=/g) || []).length;
    const stasjonCount = (html.match(/stasjonsdata/g) || []).length;
    res.json({
      length: html.length,
      hrefCount,
      stasjonCount,
      sample: html.slice(0, 2000),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/fuel/status — cache-status og scheduler-info per kilde
router.get('/status', (req, res) => {
  function statusFor(source, ttl) {
    const latest = getLatestScrapeTime(source);
    const age    = latest ? Date.now() - new Date(latest).getTime() : null;
    const count  = latest
      ? db.prepare('SELECT COUNT(*) as n FROM fuel_cache WHERE scraped_at = ? AND source = ?').get(latest, source)?.n
      : 0;
    return {
      cacheValid:   cacheIsValid(source),
      scrapedAt:    latest,
      ageMinutes:   age != null ? Math.round(age / 60_000) : null,
      ttlHours:     ttl / 3600_000,
      nextScrapeIn: age != null ? Math.round(Math.max(0, ttl - age) / 60_000) + ' min' : 'nå',
      stationCount: count,
    };
  }

  res.json({
    pumpepriser: { ...statusFor('pumpepriser', cacheTtlMs()), scraping: _scraping },
    bunkring:    { ...statusFor('bunkring',    TTL_BUNKRING_MS), scraping: _scrapingBunkring },
    season:      isBoatSeason(),
    seasonText:  isBoatSeason() ? 'Sesong (pumpepriser 2x/dag)' : 'Vintersesong (pumpepriser 1x/uke)',
  });
});

// POST /api/fuel/refresh — tving pumpepriser-oppdatering (admin)
router.post('/refresh', async (req, res) => {
  if (_scraping) return res.json({ ok: false, message: 'Skraping pågår allerede' });
  const result = await scrapeAndCache();
  res.json(result);
});

// POST /api/fuel/refresh-bunkring — tving bunkring-oppdatering (admin)
router.post('/refresh-bunkring', async (req, res) => {
  if (_scrapingBunkring) return res.json({ ok: false, message: 'Bunkring-skraping pågår allerede' });
  const result = await scrapeBunkringAndCache();
  res.json(result);
});

module.exports = router;
module.exports.startScheduler = startScheduler;
module.exports.stopScheduler  = stopScheduler;
