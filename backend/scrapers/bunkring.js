'use strict';
// scrapers/bunkring.js — Marine diesel/petrol prices from bunkring.no
//
// Flow:
//   1. GET /api/locations            → list [{id, lat, long, name, place, municipal, category[]}]
//   2. filter category.includes(1)   → diesel stations only
//   3. GET /Home/Location?id={id}    → HTML fragment with prices, grade, slug
//
// Returns station rows compatible with fuel_cache schema, with source='bunkring'.

const https = require('https');

const BASE_URL    = 'https://bunkring.no';
const USER_AGENT  = 'Bavaria32App/1.0 (+contact: tom.erik.thorsen@gmail.com)';
const THROTTLE_MS = 1000;
const CAT_DIESEL  = 1;
const CAT_BENSIN  = 2;

// Haversine-avstand (km) — duplisert her for å unngå sirkulær avhengighet til fuel.js
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2
          + Math.cos(lat1 * Math.PI / 180)
          * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept':     'application/json, text/html, */*',
      },
      timeout: 15000,
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end',  () => resolve({
        status: res.statusCode,
        body:   Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchLocationList() {
  const r = await fetchUrl(`${BASE_URL}/api/locations`);
  if (r.status !== 200) throw new Error(`/api/locations HTTP ${r.status}`);
  const arr = JSON.parse(r.body);
  if (!Array.isArray(arr)) throw new Error('/api/locations: uventet respons');
  return arr;
}

function decodeHtml(s) {
  if (!s) return s;
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g,         (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

// Parse one <li> line. Examples:
//   "Diesel (EN590) farget: 17,00 kr l."   → { type: 'diesel', price: 17.00, grade: 'EN590_farget' }
//   "Diesel: 14,50 kr l."                  → { type: 'diesel', price: 14.50, grade: null }
//   "Bensin 95: 22,25 kr l."               → { type: 'bensin', price: 22.25, grade: '95' }
function parseFuelLine(raw) {
  const line = decodeHtml(raw);
  const m = line.match(/^(Diesel|Bensin)(?:\s*\(([^)]+)\))?\s*([^:]*?):\s*([\d.,]+)\s*kr/i);
  if (!m) return null;
  const [, type, parenGrade, modifier, priceStr] = m;
  const price = parseFloat(priceStr.replace(/\s/g, '').replace(',', '.'));
  if (!isFinite(price) || price <= 0) return null;

  const mod = (modifier || '').trim().toLowerCase();
  let grade = null;
  if (parenGrade && mod) grade = `${parenGrade.trim()}_${mod}`;
  else if (parenGrade)   grade = parenGrade.trim();
  else if (mod)          grade = mod;

  return { type: type.toLowerCase(), price, grade };
}

function parseLocationDetail(html) {
  const liMatches = [...html.matchAll(/<li[^>]*>([^<]+)<\/li>/g)]
    .map(m => m[1].trim())
    .map(parseFuelLine)
    .filter(Boolean);

  const diesel = liMatches.find(f => f.type === 'diesel');
  const bensin = liMatches.find(f => f.type === 'bensin');

  const slugMatch = html.match(/href="\/marinaer\/([^"]+)"/);
  const nameMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  const regMatch  = html.match(/<h3[^>]*>([^<]+)<\/h3>/);

  return {
    slug:          slugMatch ? slugMatch[1] : null,
    name:          nameMatch ? decodeHtml(nameMatch[1]) : null,
    region:        regMatch  ? decodeHtml(regMatch[1])  : null,
    diesel_price:  diesel?.price ?? null,
    diesel_grade:  diesel?.grade ?? null,
    petrol_price:  bensin?.price ?? null,
    petrol_grade:  bensin?.grade ?? null,
  };
}

async function fetchLocationDetail(id) {
  const r = await fetchUrl(`${BASE_URL}/Home/Location?id=${id}`);
  if (r.status !== 200) return null;
  return parseLocationDetail(r.body);
}

// Parse relativ dato ("for 9 dager siden", "for 2 uker siden") → ISO-tidsstempel.
// "for X <unit> siden" — unit: time(r), dag(er), uke(r), måned(er), år
function relativeToIso(n, unit, now = Date.now()) {
  const u = unit.toLowerCase();
  let ms = 0;
  if      (u.startsWith('time'))                  ms = n * 3_600_000;
  else if (u.startsWith('dag'))                   ms = n * 86_400_000;
  else if (u.startsWith('uke'))                   ms = n * 7  * 86_400_000;
  else if (u.startsWith('måned') || u.startsWith('maaned') || u.startsWith('maned')) ms = n * 30 * 86_400_000;
  else if (u.startsWith('år')    || u.startsWith('aar')    || u.startsWith('ar'))    ms = n * 365 * 86_400_000;
  else return null;
  return new Date(now - ms).toISOString();
}

// Parse /marinaer/{slug}-siden for per-drivstoff-tidsstempel.
// HTML-struktur:
//   <b>Tilgjengelig drivstoff</b>
//   <ul>
//     <li> Diesel ... <strong>for 9 dager siden</strong> </li>
//     <li> Bensin ... <strong>for 8 dager siden</strong> </li>
//   </ul>
function parseMarinaTimestamps(html) {
  const result = { diesel: null, petrol: null };
  const sect = html.match(/<b>\s*Tilgjengelig drivstoff\s*<\/b>\s*<ul>([\s\S]*?)<\/ul>/i);
  if (!sect) return result;

  // Dekod HTML-entiteter (å = &#xE5;, æ = &#xE6;, ø = &#xF8;) før regex,
  // ellers feiler matchingen av "år", "måneder" osv.
  const sectDecoded = decodeHtml(sect[1]);

  const liRe = /<li[^>]*>\s*(Diesel|Bensin)[\s\S]*?<strong>\s*for\s+(\d+)\s+([a-zæøå]+)[^<]*<\/strong>/gi;
  let m;
  while ((m = liRe.exec(sectDecoded))) {
    const fuel = m[1].toLowerCase();
    const iso  = relativeToIso(parseInt(m[2], 10), m[3]);
    if (!iso) continue;
    if (fuel === 'diesel' && !result.diesel) result.diesel = iso;
    if (fuel === 'bensin' && !result.petrol) result.petrol = iso;
  }
  return result;
}

async function fetchMarinaTimestamps(slug) {
  if (!slug) return { diesel: null, petrol: null };
  const r = await fetchUrl(`${BASE_URL}/marinaer/${slug}`);
  if (r.status !== 200) return { diesel: null, petrol: null };
  return parseMarinaTimestamps(r.body);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Scrape all diesel-capable marinas inside an optional radius around a center point.
// opts.centerLat/centerLon/maxRadiusKm → geo-filter before issuing per-marina requests.
// Without opts, scrapes everything (kan være hundrevis av forespørsler — bruk med varsomhet).
async function scrapeBunkring(opts = {}) {
  const { centerLat, centerLon, maxRadiusKm } = opts;
  const list = await fetchLocationList();

  let diesel = list.filter(l =>
    Array.isArray(l.category) && l.category.includes(CAT_DIESEL)
  );

  if (centerLat != null && centerLon != null && maxRadiusKm != null) {
    const before = diesel.length;
    diesel = diesel.filter(l =>
      haversineKm(centerLat, centerLon, l.lat, l.long) <= maxRadiusKm
    );
    console.log(`[bunkring] Geo-filter ${maxRadiusKm}km rundt (${centerLat.toFixed(3)},${centerLon.toFixed(3)}): ${diesel.length}/${before} marinaer`);
  }

  const stations = [];
  let failed = 0;

  for (let i = 0; i < diesel.length; i++) {
    const loc = diesel[i];
    try {
      const detail = await fetchLocationDetail(loc.id);
      if (detail && (detail.diesel_price != null || detail.petrol_price != null)) {
        // Hent per-drivstoff-tidsstempel fra detaljsiden (ett ekstra kall per marina)
        await sleep(THROTTLE_MS);
        const ts = await fetchMarinaTimestamps(detail.slug);

        stations.push({
          station_id:   `bunkring-${loc.id}`,
          name:         detail.name || loc.name || `Marina ${loc.id}`,
          municipality: loc.municipal || loc.place || '',
          county:       detail.region || '',
          diesel:       detail.diesel_price,
          petrol:       detail.petrol_price,
          lat:          loc.lat,
          lon:          loc.long,
          source:       'bunkring',
          fuel_grade:   detail.diesel_grade,
          slug:         detail.slug,
          raw_timestamp: ts.diesel,   // ISO: når prisen sist ble oppdatert av en bruker
        });
      }
    } catch (e) {
      failed++;
      console.warn(`[bunkring] id=${loc.id} feilet: ${e.message}`);
    }
    if (i < diesel.length - 1) await sleep(THROTTLE_MS);
  }

  console.log(`[bunkring] ${stations.length}/${diesel.length} marinaer skrapet (${failed} feilet)`);
  return stations;
}

module.exports = {
  scrapeBunkring,
  parseLocationDetail,
  parseFuelLine,
  parseMarinaTimestamps,
  relativeToIso,
};
