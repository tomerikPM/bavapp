'use strict';
// routes/fuel-prices.js — Drivstoffpriser fra pumpepriser.no
//
// Skrapingsplan:
//   15. april – 1. oktober (båtsesong): hvert 12. time
//   Resten av året:                     én gang per uke
//
// Nærhetlogikk:
//   Bruker et kompakt kommune→koordinat-kart.
//   Haversine-distanse fra båtens posisjon til stasjonskommune.
//   Stasjoner uten kjent kommune sorteres bakerst.

const express = require('express');
const https   = require('https');
const http    = require('http');
const router  = express.Router();
const db      = require('../db');

// ── Kommune-koordinater (kyst-Norge, Haversine-grunnlag) ─────────────────────
const MUNI_COORDS = {
  // Agder
  Kristiansand:[58.147,7.996], Arendal:[58.461,8.772], Grimstad:[58.337,8.592],
  Lillesand:[58.249,8.382], Farsund:[58.095,6.801], Flekkefjord:[58.297,6.667],
  Mandal:[58.028,7.461], Lindesnes:[57.982,7.048], Risør:[58.721,9.234],
  Tvedestrand:[58.618,8.922], Lyngdal:[58.138,7.072], Vennesla:[58.279,7.967],
  Iveland:[58.422,8.013], Bygland:[58.888,7.804],
  // Vestfold og Telemark
  Larvik:[59.056,10.028], Sandefjord:[59.131,10.217], Tønsberg:[59.268,10.408],
  Horten:[59.416,10.480], Porsgrunn:[59.141,9.656], Bamble:[59.019,9.712],
  Kragerø:[58.869,9.409], Færder:[59.116,10.461], Holmestrand:[59.494,10.326],
  Stavern:[59.002,10.034], Nome:[59.245,9.126],
  // Viken / Oslo
  Fredrikstad:[59.211,10.955], Moss:[59.433,10.658], Halden:[59.122,11.388],
  Hvaler:[59.088,10.958], Sarpsborg:[59.284,11.110], Frogn:[59.654,10.662],
  Asker:[59.834,10.440], Bærum:[59.894,10.527], Vestby:[59.589,10.740],
  Råde:[59.346,10.836], Nesodden:[59.787,10.706], Oslo:[59.913,10.739],
  Nordre_Follo:[59.685,10.752],
  // Rogaland
  Stavanger:[58.970,5.733], Sandnes:[58.852,5.735], Haugesund:[59.413,5.268],
  Karmøy:[59.281,5.280], Eigersund:[58.455,6.007], Sola:[58.882,5.637],
  Strand:[59.049,6.038], Hjelmeland:[59.233,6.176], Suldal:[59.520,6.514],
  Tysvær:[59.424,5.527], Bokn:[59.295,5.484], Kvitsøy:[59.068,5.407],
  Vindafjord:[59.567,5.811], Sauda:[59.647,6.355],
  // Vestland
  Bergen:[60.391,5.324], Askøy:[60.473,5.184], Øygarden:[60.511,4.999],
  Stord:[59.782,5.499], Bømlo:[59.778,5.178], Austevoll:[60.097,5.258],
  Bjørnafjorden:[60.233,5.553], Alver:[60.669,5.355], Gulen:[61.103,5.391],
  Fjaler:[61.490,5.432], Askvoll:[61.346,5.067], Bremanger:[61.780,5.047],
  Kinn:[61.905,5.057], Kvam:[60.375,6.047], Ullensvang:[60.219,6.666],
  Etne:[59.678,5.953], Masfjorden:[60.875,5.469], Vik:[61.080,6.572],
  Luster:[61.466,7.527], Sogndal:[61.229,7.100], Hyllestad:[61.170,5.502],
  Sunnfjord:[61.455,5.848], Stad:[62.178,5.114], Stryn:[61.901,6.718],
  Osterøy:[60.528,5.572], Tysnes:[60.003,5.695], Ulvik:[60.569,6.908],
  Fedje:[60.773,4.720], Solund:[61.069,4.831], Aurland:[60.894,7.188],
  Vaksdal:[60.479,5.864],
  // Møre og Romsdal
  Ålesund:[62.473,6.155], Giske:[62.499,6.071], Haram:[62.580,6.317],
  Vestnes:[62.646,6.992], Gjemnes:[62.803,7.518], Herøy:[62.371,5.822],
  Ulstein:[62.344,5.852], Sande:[62.219,5.623], Sykkylven:[62.390,6.567],
  Molde:[62.737,7.160], Hustadvika:[63.066,7.219], Aure:[63.165,8.101],
  Smøla:[63.394,8.058], Kristiansund:[63.110,7.728], Surnadal:[62.977,8.739],
  Aukra:[62.837,7.028], Rauma:[62.566,7.709], Sunndalsøra:[62.680,8.560],
  // Trøndelag
  Trondheim:[63.430,10.395], Stjørdal:[63.472,10.918], Inderøy:[63.881,11.420],
  Steinkjer:[64.014,11.495], Namsos:[64.467,11.497], Verdal:[63.793,11.488],
  Frøya:[63.717,8.680], Hitra:[63.566,8.728], Heim:[63.284,9.282],
  Skaun:[63.405,10.143], Malvik:[63.434,10.734], Ørland:[63.699,9.600],
  Åfjord:[63.959,10.200], Indre_Fosen:[63.616,9.897], Nærøysund:[64.867,11.229],
  // Nordland
  Bodø:[67.282,14.405], Narvik:[68.437,17.427], Alstahaug:[65.967,12.567],
  Brønnøy:[65.468,12.212], Lurøy:[66.416,12.617], Hemnes:[66.226,14.185],
  Nesna:[66.200,13.019], Meløy:[66.904,13.738], Rødøy:[66.687,13.616],
  Hamarøy:[68.081,15.568], Steigen:[67.956,15.517], Moskenes:[67.888,12.952],
  Lødingen:[68.418,16.025], Hadsel:[68.556,14.878], Sortland:[68.695,15.415],
  Vefsn:[65.838,13.187], Rana:[66.313,14.153], Saltdal:[66.905,15.097],
  // Troms og Finnmark
  Tromsø:[69.649,18.956], Harstad:[68.799,16.542], Senja:[69.258,17.600],
  Lenvik:[69.300,17.983], Kvæfjord:[68.850,16.617], Tjeldsund:[68.573,16.530],
};

// ── Haversine ─────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R  = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Finn koordinater for en stasjon ───────────────────────────────────────────
function stationCoords(station) {
  const keys = [station.municipality, station.region, station.fjord];
  for (const key of keys) {
    if (!key) continue;
    // Direkte match
    if (MUNI_COORDS[key]) return MUNI_COORDS[key];
    // Partial match (fjerne mellomrom, store bokstaver)
    const norm = key.replace(/\s+/g, '_');
    if (MUNI_COORDS[norm]) return MUNI_COORDS[norm];
    // Soft match — finn nøkkel som inneholder eller er inneholdt i key
    for (const [k, v] of Object.entries(MUNI_COORDS)) {
      if (k.toLowerCase() === key.toLowerCase() ||
          key.toLowerCase().includes(k.toLowerCase()) ||
          k.toLowerCase().includes(key.toLowerCase())) {
        return v;
      }
    }
  }
  return null;
}

// ── Skrapingsplan-logikk ──────────────────────────────────────────────────────
function inSeason() {
  const now = new Date();
  const mm  = now.getMonth() + 1; // 1-12
  const dd  = now.getDate();
  // Sesong: 15. april – 1. oktober
  if (mm > 4 && mm < 10) return true;
  if (mm === 4 && dd >= 15) return true;
  if (mm === 10 && dd < 1) return true;
  return false;
}

function scrapeIntervalMs() {
  return inSeason() ? 12 * 3600_000 : 7 * 24 * 3600_000;
}

function shouldScrape() {
  const row = db.prepare('SELECT scraped_at FROM fuel_cache WHERE id = ?').get('singleton');
  if (!row) return true;
  const age = Date.now() - new Date(row.scraped_at).getTime();
  return age > scrapeIntervalMs();
}

// ── HTML-parser ───────────────────────────────────────────────────────────────
function parseHtml(html) {
  // Finn alle stasjonslenker: /stasjonsdata/{id}/{name}/{municipality}/{county}/{d1..d4}/{b1..b4}/nei/
  const re = /href="\/stasjonsdata\/(\d+)\/([^/]+)\/([^/]+)\/([^/]+)\/(\d)\/(\d)\/(\d)\/(\d)\/(\d)\/(\d)\/(\d)\/(\d)\/([^/"]+)\//g;
  const stations = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const id   = m[1];
    if (seen.has(id)) continue;
    seen.add(id);

    const name         = decodeURIComponent(m[2]).replace(/\+/g, ' ');
    const municipality = decodeURIComponent(m[3]).replace(/\+/g, ' ');
    const region       = decodeURIComponent(m[4]).replace(/\+/g, ' ');

    // Priser: fire siffer-segmenter → XX,XX
    const dieselStr = m[5] + m[6] + ',' + m[7] + m[8];
    const petrolStr = m[9] + m[10] + ',' + m[11] + m[12];

    const diesel = dieselStr !== '00,00' ? parseFloat(dieselStr.replace(',', '.')) : null;
    const petrol = petrolStr !== '00,00' ? parseFloat(petrolStr.replace(',', '.')) : null;

    // Fjord/område hentes fra den siste path-komponenten (nei = ingen)
    const fjord = m[13] !== 'nei' ? decodeURIComponent(m[13]).replace(/\+/g, ' ') : null;

    if (diesel !== null || petrol !== null) {
      stations.push({ id, name, municipality, region, fjord, diesel, petrol });
    }
  }
  return stations;
}

// ── HTTP-henting ──────────────────────────────────────────────────────────────
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bavaria32App/1.0; boat fuel price aggregator)',
        'Accept': 'text/html',
      },
    }, res => {
      // Følg redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── Skraping ──────────────────────────────────────────────────────────────────
async function scrape() {
  console.log('[fuel] Starter skraping av pumpepriser.no…');
  try {
    const html     = await fetchPage('https://www.pumpepriser.no/');
    const stations = parseHtml(html);
    if (stations.length < 10) throw new Error(`For få stasjoner: ${stations.length}`);

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO fuel_cache (id, scraped_at, data)
      VALUES ('singleton', ?, ?)
      ON CONFLICT(id) DO UPDATE SET scraped_at = excluded.scraped_at, data = excluded.data
    `).run(now, JSON.stringify(stations));

    console.log(`[fuel] Lagret ${stations.length} stasjoner (${now})`);
    return stations;
  } catch (e) {
    console.error('[fuel] Skraping feilet:', e.message);
    throw e;
  }
}

// ── Hent (fra cache eller skrap) ──────────────────────────────────────────────
async function getStations() {
  if (shouldScrape()) {
    try { return await scrape(); } catch {}
  }
  const row = db.prepare('SELECT data FROM fuel_cache WHERE id = ?').get('singleton');
  if (row) return JSON.parse(row.data);
  // Ingen cache og skraping feilet — siste utvei
  return await scrape();
}

// ── Planlegg neste skraping ───────────────────────────────────────────────────
function scheduleNext() {
  const delay = scrapeIntervalMs();
  setTimeout(async () => {
    try { await scrape(); } catch {}
    scheduleNext();
  }, delay);
}

// Start skraping ved oppstart hvis nødvendig, og planlegg fremtidig
(async () => {
  if (shouldScrape()) {
    try { await scrape(); } catch (e) { console.warn('[fuel] Oppstartssjekk:', e.message); }
  }
  scheduleNext();
})();

// ── GET /api/fuel-prices ──────────────────────────────────────────────────────
// Params: lat, lon, limit (antall nærmeste, default 20), diesel_only (boolean)
router.get('/', async (req, res) => {
  try {
    const lat         = parseFloat(req.query.lat) || 58.1467;
    const lon         = parseFloat(req.query.lon) || 7.9956;
    const limit       = Math.min(parseInt(req.query.limit) || 20, 100);
    const dieselOnly  = req.query.diesel_only === '1';
    const cache       = db.prepare('SELECT scraped_at FROM fuel_cache WHERE id = ?').get('singleton');

    const all = await getStations();

    // Filtrer ut stasjoner uten diesel hvis ønsket
    let filtered = dieselOnly ? all.filter(s => s.diesel != null) : all;

    // Beregn distanse for alle
    const withDist = filtered.map(s => {
      const coords = stationCoords(s);
      const dist   = coords ? haversine(lat, lon, coords[0], coords[1]) : 99999;
      return { ...s, dist_km: Math.round(dist) };
    });

    // Sorter nærmest først, ta N nærmeste
    withDist.sort((a, b) => a.dist_km - b.dist_km);
    const nearest = withDist.slice(0, limit);

    res.json({
      count:      nearest.length,
      total:      all.length,
      scraped_at: cache?.scraped_at || null,
      next_scrape_in_h: Math.round((scrapeIntervalMs() - (Date.now() - new Date(cache?.scraped_at || 0))) / 3600_000),
      in_season:  inSeason(),
      stations:   nearest,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── POST /api/fuel-prices/refresh ────────────────────────────────────────────
// Tving ny skraping (brukes manuelt fra UI)
router.post('/refresh', async (req, res) => {
  try {
    const stations = await scrape();
    res.json({ ok: true, count: stations.length, scraped_at: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
