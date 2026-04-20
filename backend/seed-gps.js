#!/usr/bin/env node
'use strict';

/**
 * seed-gps.js — Generer realistiske GPS-spor for testturene
 * Kjør: node seed-gps.js  (fra /backend-mappen)
 *
 * Scriptet finner alle turer uten track-data i databasen og legger inn
 * GPS-punkter basert på rutens navn og kjente farvann rundt Kristiansand.
 */

const db = require('./db');

// ── Farledskoordinater rundt Kristiansand ─────────────────────────────────────
// Navn på punkt følger lokale navn i farvannet
const P = {
  havn:          [58.1467,  7.9956],   // Kristiansand gjestehavn
  odderoya:      [58.1156,  7.9853],   // Odderøyas spiss
  bragdoya:      [58.1161,  8.0253],   // Bragdøya østside
  ulvoysund:     [58.1878,  8.1512],   // Ulvøysund / Justøy
  gronningen:    [58.0700,  8.0710],   // Grønningen fyr
  gronnNord:     [58.1000,  8.0400],   // Nord for Grønningen
  flekk_n:       [58.0944,  7.9344],   // Flekkerøy nord
  flekk_v:       [58.0677,  7.9133],   // Flekkerøy vest/sør
  flekk_s:       [58.0570,  7.9250],   // Flekkerøy sørspiss
  ryvingenN:     [58.0450,  7.8100],   // Nord for Ryvingen
  ryvingen:      [58.0197,  7.7533],   // Ryvingen fyr
  ny_hellesund:  [58.0367,  7.8267],   // Ny-Hellesund
  oksoy:         [57.9922,  7.6764],   // Oksøy fyr
  mandal_ytre:   [58.0150,  7.5200],   // Ytre Mandal
  mandal:        [58.0293,  7.4597],   // Mandal havn
  lillesand_y:   [58.2100,  8.3200],   // Ytre Lillesand
  lillesand:     [58.2543,  8.3774],   // Lillesand havn
  tvedestrand:   [58.6120,  8.9330],   // Tvedestrand
  risoy:         [58.7190,  9.2349],   // Risør
  lyngoy:        [58.6303,  9.1392],   // Lyngør
  topdal_n:      [58.1700,  8.0000],   // Inn Topdalsfjorden nord
  topdal_mid:    [58.1600,  7.9800],   // Topdalsfjorden midt
};

// ── Rutedefinisjonar — navn matcher trips i databasen ─────────────────────────
// Hver rute er en liste av waypoints ([lat, lon])
// Returtur-ruter er speilt automatisk av generateTrack()
const ROUTES = {
  'Oksøy fyr tur-retur': {
    waypoints: [P.havn, P.odderoya, P.flekk_n, P.flekk_v, P.ryvingen, P.oksoy],
    avgSpeed: 16, returnTrip: true,
  },
  'Fisketur Ryvingen': {
    waypoints: [P.havn, P.odderoya, P.flekk_n, P.flekk_v, P.ryvingenN, P.ryvingen],
    avgSpeed: 14, returnTrip: true,
  },
  'Ny-Hellesund overnatting': {
    waypoints: [P.havn, P.odderoya, P.flekk_n, P.flekk_s, P.ny_hellesund],
    avgSpeed: 18, returnTrip: true,
  },
  'Kveldscruise Kristiansandsfjorden': {
    waypoints: [P.havn, P.bragdoya, P.gronningen, P.flekk_n, P.odderoya, P.havn],
    avgSpeed: 11, returnTrip: false,
  },
  'Mandal — sjøveien': {
    waypoints: [P.havn, P.flekk_n, P.flekk_v, P.ny_hellesund, P.ryvingen, P.mandal_ytre, P.mandal],
    avgSpeed: 19, returnTrip: true,
  },
  'Badeltur Ulvøysund': {
    waypoints: [P.havn, P.bragdoya, P.ulvoysund],
    avgSpeed: 13, returnTrip: true,
  },
  'Helgetur Lyngør': {
    waypoints: [P.havn, P.ulvoysund, P.lillesand_y, P.lillesand, P.tvedestrand, P.lyngoy, P.risoy],
    avgSpeed: 20, returnTrip: true,
  },
  'Høsttur Grønningen fyr': {
    waypoints: [P.havn, P.topdal_mid, P.topdal_n, P.gronnNord, P.gronningen],
    avgSpeed: 13, returnTrip: true,
  },
  'Prøvetur etter sjøsetting 2025': {
    waypoints: [P.havn, P.odderoya, P.flekk_n, P.havn],
    avgSpeed: 9, returnTrip: false,
  },
  'Flekkerøy rundt — solnedgang': {
    waypoints: [P.havn, P.odderoya, P.flekk_n, P.flekk_v, P.flekk_s, P.flekk_n, P.gronningen, P.havn],
    avgSpeed: 12, returnTrip: false,
  },
};

// ── GPS-spor-generator ────────────────────────────────────────────────────────
const KNOT_MS = 1852 / 3600; // m/s per knop
const EARTH_R = 6371000;     // m

function haversineM(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 +
               Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2-lon1)*Math.PI/180) * Math.cos(lat2*Math.PI/180);
  const x = Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180)
           - Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos((lon2-lon1)*Math.PI/180);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function generateTrack(waypoints, startIso, avgSpeedKn, returnTrip) {
  const pts    = returnTrip ? [...waypoints, ...[...waypoints].reverse().slice(1)] : waypoints;
  const track  = [];
  let   t      = new Date(startIso);
  const INTERVAL = 30; // sekunder mellom GPS-punkter

  for (let i = 0; i < pts.length - 1; i++) {
    const [lat1, lon1] = pts[i];
    const [lat2, lon2] = pts[i + 1];
    const distM        = haversineM(lat1, lon1, lat2, lon2);
    const hdg          = Math.round(bearing(lat1, lon1, lat2, lon2));
    const segTimeS     = distM / (avgSpeedKn * KNOT_MS);
    const nPoints      = Math.max(3, Math.round(segTimeS / INTERVAL));

    for (let j = 0; j < nPoints; j++) {
      const frac = j / nPoints;
      // Legg til realistisk GPS-støy (±15–20 m)
      const noiseLat = (Math.random() - 0.5) * 0.00030;
      const noiseLon = (Math.random() - 0.5) * 0.00040;
      const lat      = lat1 + (lat2 - lat1) * frac + noiseLat;
      const lon      = lon1 + (lon2 - lon1) * frac + noiseLon;
      // Fartsvariasjon ±10% rundt gjennomsnitt
      const sog      = +(avgSpeedKn * (0.92 + Math.random() * 0.16)).toFixed(1);

      track.push({
        lat: +lat.toFixed(5),
        lon: +lon.toFixed(5),
        ts:  t.toISOString(),
        sog,
        hdg,
      });
      t = new Date(t.getTime() + INTERVAL * 1000);
    }
  }

  // Siste punkt tilbake til start/slutt med null fart
  const last = pts[pts.length - 1];
  track.push({ lat: last[0], lon: last[1], ts: t.toISOString(), sog: 0, hdg: 0 });

  return track;
}

// ── Seed-logikk ───────────────────────────────────────────────────────────────
const rows = db.prepare('SELECT id, name, start_ts, track FROM trips ORDER BY start_ts').all();

if (rows.length === 0) {
  console.log('❌ Ingen turer i databasen. Kjør seed-trips.sh først:\n   bash seed-trips.sh\n');
  process.exit(0);
}

console.log(`\n⛵  GPS-spor-seeder — Bavaria Sport 32`);
console.log(`   ${rows.length} turer funnet i databasen\n`);

const updateStmt = db.prepare('UPDATE trips SET track = @track WHERE id = @id');
let seeded = 0, skipped = 0;

for (const row of rows) {
  if (row.track && row.track !== 'null') {
    console.log(`   ↷ Hopper over: "${row.name}" (har allerede GPS-spor)`);
    skipped++;
    continue;
  }

  const routeDef = ROUTES[row.name];
  if (!routeDef) {
    console.log(`   ? Ingen rutedefinisjon for: "${row.name}"`);
    continue;
  }

  const track = generateTrack(
    routeDef.waypoints,
    row.start_ts,
    routeDef.avgSpeed,
    routeDef.returnTrip
  );

  updateStmt.run({ id: row.id, track: JSON.stringify(track) });

  const distNm = ((track.length * 30) / 3600 * routeDef.avgSpeed).toFixed(1);
  console.log(`   ✓ "${row.name}" — ${track.length} GPS-punkter generert`);
  seeded++;
}

console.log(`\n   Ferdig: ${seeded} spor lagt inn, ${skipped} hoppet over`);
console.log(`   Åpne http://localhost:3001/#map for å se sporene\n`);
