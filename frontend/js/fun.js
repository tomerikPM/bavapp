// fun.js — morsom og nyttig tilleggsfunksjonalitet for Summer
import * as SK from './signalk.js';

// ── Sjøvettreglene ────────────────────────────────────────────────────────────
const SJOVETTREGEL = [
  { num: 1,  text: 'Ha alltid oversikt over din posisjon og hold god utkikk.' },
  { num: 2,  text: 'Sørg for at båten er i god stand og utstyrt for den tur du tar.' },
  { num: 3,  text: 'Ta alltid hensyn til været og de nautiske forholdene.' },
  { num: 4,  text: 'Bruk flytevest – den redder liv.' },
  { num: 5,  text: 'Ha nødvendig kunnskap om sjøveisreglene.' },
  { num: 6,  text: 'Informer noen om turplanen din.' },
  { num: 7,  text: 'Vit hvordan det nødvendige utstyret om bord virker.' },
  { num: 8,  text: 'Alle om bord bør kjenne til grunnleggende livredning.' },
  { num: 9,  text: 'Aldri kjør båt i påvirket tilstand.' },
  { num: 10, text: 'Vær hensynsfull mot andre trafikanter og ta hensyn til miljøet.' },
];

export function getMaritimeRule() {
  return SJOVETTREGEL[Math.floor(Math.random() * SJOVETTREGEL.length)];
}

// ── Sensorhumor ───────────────────────────────────────────────────────────────
export function getSensorQuip(state) {
  const soc     = SK.get.houseSoc(state);
  const on      = SK.get.engineOn(state);
  const rpm     = SK.get.rpm(state);
  const coolant = SK.get.coolant(state);
  const wind    = SK.get.windSpeed(state);
  const wt      = SK.get.waterTempC(state);
  const fuelPct = SK.get.fuelPct(state);
  const sogKn   = SK.get.sogKnots(state);
  const shore   = SK.get.shorepower(state);

  const pool = [];

  if (soc != null) {
    if (soc < 15)      pool.push('Batteriet holder på å gi opp livet. Lad nå.');
    else if (soc < 25) pool.push('Summer er sulten på strøm. Lad snart.');
    else if (soc < 40) pool.push('Batteriet begynner å gjespe litt.');
    else if (soc > 97) pool.push('Batteriet er 100 % fornøyd med seg selv.');
    else if (soc > 85) pool.push('Summer er stappfull av energi i dag.');
    else               pool.push('Batteriet holder seg fint.');
  }

  if (on) {
    if (rpm != null && rpm > 3200)       pool.push(`${rpm.toLocaleString('no')} RPM — hva flykter du fra?`);
    else if (rpm != null && rpm > 2500)  pool.push('Summer flyr avgårde 🚀');
    else if (rpm != null && rpm < 900)   pool.push('Motor varmer opp. Kaffe er klar om 5 min.');
    else                                 pool.push('Motoren surrer rolig og fornøyd.');

    if (coolant != null && coolant > 90) pool.push(`Kjølevann på ${coolant}°C. Summer er litt het akkurat nå.`);
    else if (coolant != null && coolant > 70) pool.push('Kjølevann er perfekt. Motor er happy.');
  } else {
    if (shore) pool.push('Motoren hviler og lader. Drømmer om neste tur.');
    else       pool.push('Motor av. Stille og fredfullt om bord.');
  }

  if (fuelPct != null && fuelPct < 15) pool.push(`Kun ${fuelPct} % diesel igjen. Ruter via pumpen?`);
  if (fuelPct != null && fuelPct > 92) pool.push('Tanken er stappfull. Klart for eventyr.');

  if (sogKn > 25)          pool.push(`${sogKn.toFixed(0)} knop! Der drar hun!`);
  else if (sogKn > 12)     pool.push(`${sogKn.toFixed(1)} knop. Bra kruising.`);
  else if (sogKn > 0.5)    pool.push(`${sogKn.toFixed(1)} knop. Rolig og nydelig.`);
  else if (on && sogKn < 0.5) pool.push('Motor på, fart null. Manøvrerer ut av havn.');

  if (wt != null) {
    if (wt > 21)      pool.push(`${wt}°C i sjøen — badesesong! 🏊`);
    else if (wt > 17) pool.push(`Sjøtemperatur ${wt}°C. Akseptabelt for de fleste.`);
    else if (wt < 8)  pool.push(`${wt}°C i vannet. Overlevelsesdrakt anbefales.`);
  }

  if (wind != null) {
    const bft = bftFromMs(wind);
    if (bft >= 8)       pool.push('Ganske friskt der ute. Understatement of the year.');
    else if (bft === 0) pool.push('Vindstille. Perfekt dag for å ikke seile.');
  }

  if (!pool.length) pool.push('Summer venter tålmodig på neste eventyr.');
  return pool[Math.floor(Math.random() * pool.length)];
}

function bftFromMs(ms) {
  const l = [0.3,1.6,3.4,5.5,8,10.8,13.9,17.2,20.8,24.5,28.5,32.7];
  for (let i = 0; i < l.length; i++) if (ms < l[i]) return i;
  return 12;
}

// ── Diesel-moro per tur ───────────────────────────────────────────────────────
export function getDieselFunFact(litres) {
  if (!litres || litres < 1) return null;
  const l       = Math.round(litres * 10) / 10;
  const distKm  = Math.round(l / 0.067);
  const kWh     = Math.round(l * 10.7);
  const iphones = Math.round(kWh * 20);
  const webasto = Math.round(l / 0.3);
  const vekt    = (l * 0.84).toFixed(1);

  const facts = [
    `Tilsvarer en biltur på ${distKm.toLocaleString('no')} km i en vanlig bil.`,
    `${kWh} kWh energi — nok til å lade telefonen ${iphones.toLocaleString('no')} ganger.`,
    `Webasto-ovnen ville ha brent det samme på ${webasto} timer oppvarming.`,
    `${l} liter diesel veier ${vekt} kg. Du hadde med deg en middels stor hund ekstra.`,
  ];
  if (litres > 60)  facts.push(`${l} liter — omtrent tre fulle jerrycans. Summer er tørst.`);
  if (litres > 100) facts.push(`${l} liter diesel. Imponerende. Og litt dyrt.`);
  if (litres < 10)  facts.push(`Bare ${l} liter. Summer er svært ressursbevisst i dag.`);

  return facts[Math.floor(Math.random() * facts.length)];
}

// ── Haiku-generator via Claude API ────────────────────────────────────────────
export async function generateHaiku(state) {
  const apiKey = localStorage.getItem('api_key');
  if (!apiKey) throw new Error('Claude API-nøkkel mangler — legg inn i innstillinger ⚙');

  const lines = [
    SK.get.engineOn(state) ? `Motor: på · ${SK.get.rpm(state)?.toLocaleString('no') ?? '?'} RPM` : 'Motor: av',
    SK.get.houseSoc(state)    != null ? `Batteri: ${SK.get.houseSoc(state)}%`           : '',
    SK.get.fuelPct(state)     != null ? `Diesel: ${SK.get.fuelPct(state)}%`             : '',
    SK.get.coolant(state)     != null ? `Kjølevann: ${SK.get.coolant(state)}°C`         : '',
    SK.get.sogKnots(state)     > 0.3  ? `Fart: ${SK.get.sogKnots(state).toFixed(1)} kn`: 'Fart: stille',
    SK.get.waterTempC(state)  != null ? `Sjøtemp: ${SK.get.waterTempC(state)}°C`        : '',
    SK.get.waterDepth(state)  != null ? `Dybde: ${SK.get.waterDepth(state)} m`          : '',
    SK.get.windSpeed(state)   != null ? `Vind: ${SK.get.windSpeed(state).toFixed(1)} m/s` : '',
    SK.get.shorepower(state)          ? 'Landstrøm: tilkoblet'                          : '',
  ].filter(Boolean).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `Du er ombord på Bavaria Sport 32 som heter "Summer" (reg. FAR999), hjemmehavn Kristiansand.
Skriv én haiku på norsk (5–7–5 stavelser) basert på disse sensordataene:

${lines}

Svar med KUN selve haikuen — ingen tittel, ingen forklaring, ingen annen tekst.`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API feil: HTTP ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || 'Ingen haiku generert.';
}

// ── Tidevann (Kartverket vannstand.kartverket.no/tideapi.php) ────────────────
export async function fetchTides(lat, lon) {
  const base = localStorage.getItem('backend_url') || 'http://localhost:3001';

  const now  = new Date();
  const from = now.toISOString().slice(0, 16);
  const to   = new Date(now.getTime() + 48 * 3600_000).toISOString().slice(0, 16);

  // Ny URL: vannstand.kartverket.no/tideapi.php — returnerer XML
  const params = new URLSearchParams({
    lat: lat.toString(), lon: lon.toString(),
    fromtime: from, totime: to,
    datatype: 'pre', refcode: 'cd',
    interval: '60', lang: 'nb', dst: '0',
    tide_request: 'locationdata',
  });

  const ac2  = new AbortController();
  const tid2 = setTimeout(() => ac2.abort(), 8000);
  let xmlText;
  try {
    const res = await fetch(`${base}/tide?${params}`, { signal: ac2.signal });
    clearTimeout(tid2);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xmlText = await res.text();
  } catch (e) {
    clearTimeout(tid2);
    throw new Error(`Tide proxy: ${e.message}`);
  }

  // Parse XML med DOMParser
  const doc   = new DOMParser().parseFromString(xmlText, 'application/xml');
  const nodes = [...doc.querySelectorAll('waterlevel')];
  if (!nodes.length) throw new Error('Ingen tidevannsdata i XML-respons');

  const series = nodes
    .map(n => ({
      t: new Date(n.getAttribute('time') ?? ''),
      v: parseFloat(n.getAttribute('value') ?? 'NaN'),
    }))
    .filter(p => !isNaN(p.v) && !isNaN(p.t.getTime()) && p.t > now);

  if (series.length < 3) throw new Error(`For få datapunkter (${series.length})`);

  // Finn nærmeste høy- og lavvann
  let nextHigh = null, nextLow = null;
  for (let i = 1; i < series.length - 1; i++) {
    const pv = series[i-1].v, cv = series[i].v, nv = series[i+1].v;
    if (!nextHigh && cv > pv && cv > nv) nextHigh = series[i];
    if (!nextLow  && cv < pv && cv < nv) nextLow  = series[i];
    if (nextHigh && nextLow) break;
  }

  const stationName = doc.querySelector('location')?.getAttribute('name') ?? 'ukjent';
  return { nextHigh, nextLow, stationName };
}

// ── Sol fra MET Norway ────────────────────────────────────────────────────────
export async function fetchSunrise(lat, lon) {
  const { hostname } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const metBase = isLocal ? 'https://api.met.no' : (localStorage.getItem('backend_url') || 'http://localhost:3001') + '/met';

  const today  = new Date().toISOString().slice(0, 10);
  const rawOff = -new Date().getTimezoneOffset();
  const h      = String(Math.floor(Math.abs(rawOff)/60)).padStart(2,'0');
  const m      = String(Math.abs(rawOff)%60).padStart(2,'0');
  const offset = encodeURIComponent((rawOff >= 0 ? '+' : '-') + h + ':' + m);

  const url = `${metBase}/weatherapi/sunrise/3.0/sun?lat=${lat}&lon=${lon}&date=${today}&offset=${offset}`;

  const ac  = new AbortController();
  const tid = setTimeout(() => ac.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: isLocal ? { 'User-Agent': 'Bavaria32App/1.0 tom.erik.thorsen@gmail.com' } : {},
      signal: ac.signal,
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const fmt  = iso => iso ? new Date(iso).toLocaleTimeString('no', { hour:'2-digit', minute:'2-digit' }) : '—';
    return { sunrise: fmt(data?.properties?.sunrise?.time), sunset: fmt(data?.properties?.sunset?.time) };
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}
