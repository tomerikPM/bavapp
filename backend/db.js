'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './data/bavaria32.db';

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ─────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    ts          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    type        TEXT NOT NULL,
    category    TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT,
    source      TEXT,
    value       REAL,
    unit        TEXT,
    severity    TEXT DEFAULT 'info',
    ack         INTEGER DEFAULT 0,
    ack_ts      TEXT,
    trip_id     TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    subcategory TEXT,
    title       TEXT NOT NULL,
    description TEXT,
    filename    TEXT,
    original_name TEXT,
    mime_type   TEXT,
    file_size   INTEGER,
    tags        TEXT,
    extracted   TEXT,
    doc_date    TEXT,
    amount      REAL,
    currency    TEXT DEFAULT 'NOK',
    vendor      TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS parts (
    id                TEXT PRIMARY KEY,
    category          TEXT NOT NULL,
    system            TEXT,
    name              TEXT NOT NULL,
    part_number       TEXT,
    vendor            TEXT,
    vendor_url        TEXT,
    notes             TEXT,
    last_replaced     TEXT,
    last_replaced_hours REAL,
    interval_months   INTEGER,
    interval_hours    REAL,
    next_due_date     TEXT,
    next_due_hours    REAL,
    quantity_stock    INTEGER DEFAULT 0,
    quantity_min      INTEGER DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS maintenance (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT,
    category    TEXT NOT NULL,
    priority    TEXT DEFAULT 'medium',
    status      TEXT DEFAULT 'open',
    due_date    TEXT,
    done_date   TEXT,
    cost        REAL,
    currency    TEXT DEFAULT 'NOK',
    vendor      TEXT,
    part_id     TEXT REFERENCES parts(id),
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS trips (
    id            TEXT PRIMARY KEY,
    name          TEXT,
    start_ts      TEXT NOT NULL,
    end_ts        TEXT,
    start_lat     REAL,
    start_lon     REAL,
    end_lat       REAL,
    end_lon       REAL,
    distance_nm   REAL,
    max_speed_kn  REAL,
    avg_speed_kn  REAL,
    engine_hours  REAL,
    fuel_used_l   REAL,
    persons       INTEGER,
    notes         TEXT,
    track         TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS sensor_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,
    path      TEXT NOT NULL,
    value     REAL NOT NULL,
    unit      TEXT
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          TEXT PRIMARY KEY,
    endpoint    TEXT NOT NULL UNIQUE,
    auth        TEXT NOT NULL,
    p256dh      TEXT NOT NULL,
    user_agent  TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  -- ── Kostnadslogg ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS costs (
    id              TEXT PRIMARY KEY,
    date            TEXT NOT NULL,
    category        TEXT NOT NULL,  -- fuel | marina | maintenance | equipment | insurance | other
    description     TEXT NOT NULL,
    amount          REAL NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'NOK',
    -- Drivstoff-spesifikt
    liters          REAL,
    price_per_liter REAL,
    location        TEXT,
    -- Kobling
    trip_id         TEXT REFERENCES trips(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_events_ts       ON events(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
  CREATE INDEX IF NOT EXISTS idx_docs_category   ON documents(category);
  CREATE INDEX IF NOT EXISTS idx_parts_category  ON parts(category);
  CREATE INDEX IF NOT EXISTS idx_sensor_path_ts  ON sensor_history(path, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_trips_start     ON trips(start_ts DESC);
  CREATE INDEX IF NOT EXISTS idx_costs_date      ON costs(date DESC);
  CREATE INDEX IF NOT EXISTS idx_costs_category  ON costs(category);

  -- ── Changelog ────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS changelog (
    id          TEXT PRIMARY KEY,
    date        TEXT NOT NULL,
    version     TEXT,
    type        TEXT NOT NULL DEFAULT 'feat',  -- feat | hardware | fix
    title       TEXT NOT NULL,
    description TEXT,
    source      TEXT DEFAULT 'manual',         -- manual | scanner | parts | costs | system
    auto        INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_changelog_date ON changelog(date DESC);
`);

// ── Seed data ──────────────────────────────────────────────────────────────

const partsCount = db.prepare('SELECT COUNT(*) as n FROM parts').get().n;
if (partsCount === 0) {
  const insertPart = db.prepare(`
    INSERT INTO parts (id, category, system, name, part_number, vendor, interval_months, interval_hours, notes)
    VALUES (@id, @category, @system, @name, @part_number, @vendor, @interval_months, @interval_hours, @notes)
  `);
  const seedParts = db.transaction((parts) => { for (const p of parts) insertPart.run(p); });
  seedParts([
    { id: 'p-vp-oilfilter',   category: 'engine',  system: 'Volvo Penta D6 330', name: 'Oljefilter motor',      part_number: '3840525',    vendor: 'Volvo Penta', interval_months: 12, interval_hours: 200,  notes: 'Byttes med olje' },
    { id: 'p-vp-fuelfilter',  category: 'engine',  system: 'Volvo Penta D6 330', name: 'Dieselfilter primær',   part_number: '3840524',    vendor: 'Volvo Penta', interval_months: 12, interval_hours: 200,  notes: null },
    { id: 'p-vp-impeller',    category: 'engine',  system: 'Volvo Penta D6 330', name: 'Impeller',             part_number: '21951346',   vendor: 'Volvo Penta', interval_months: 24, interval_hours: 400,  notes: 'Sjøvannskjøling' },
    { id: 'p-vp-zincanode',   category: 'hull',    system: 'Volvo Penta DP-D',   name: 'Sinkanoder drev',      part_number: null,         vendor: null,          interval_months: 12, interval_hours: null, notes: 'Kontroller hvert år, bytt ved 50% slitasje' },
    { id: 'p-vp-bellows',     category: 'drive',   system: 'Volvo Penta DP-D',   name: 'Belg drev',            part_number: '3853807',    vendor: 'Volvo Penta', interval_months: 36, interval_hours: null, notes: 'Kritisk — sjekk hvert år' },
    { id: 'p-vp-driveoil',    category: 'drive',   system: 'Volvo Penta DP-D',   name: 'Olje drev',            part_number: '1141573',    vendor: 'Volvo Penta', interval_months: 24, interval_hours: 400,  notes: '1 liter' },
    { id: 'p-wbt-glow',       category: 'comfort', system: 'Webasto Evo 3900',   name: 'Glødeplugg Webasto',   part_number: '1322486A',   vendor: 'Webasto',     interval_months: 24, interval_hours: null, notes: null },
    { id: 'p-wbt-servicekit', category: 'comfort', system: 'Webasto Evo 3900',   name: 'Servicekit Webasto',   part_number: '1320429A',   vendor: 'Webasto',     interval_months: 24, interval_hours: null, notes: 'Filter + glødeplugg + pakninger' },
    { id: 'p-toilet-service', category: 'comfort', system: 'Jabsco toalett',     name: 'Servicepakke toalett', part_number: '29045-3000', vendor: 'Jabsco',      interval_months: 36, interval_hours: null, notes: 'Jokerventil + membrane' },
  ]);
}

const mxCount = db.prepare('SELECT COUNT(*) as n FROM maintenance').get().n;
if (mxCount === 0) {
  const insertMx = db.prepare(`
    INSERT INTO maintenance (id, title, category, priority, status, due_date, notes)
    VALUES (@id, @title, @category, @priority, @status, @due_date, @notes)
  `);
  const seedMx = db.transaction((items) => { for (const i of items) insertMx.run(i); });
  seedMx([
    { id: 'mx-gas',   title: 'Gassanlegg re-sertifisering',     category: 'safety',     priority: 'critical', status: 'open', due_date: '2012-10-25', notes: 'Sertifikat forfalt. Kontakt autorisert kontrollør. Krav: hvert 2. år.' },
    { id: 'mx-mmsi',  title: 'VHF MMSI-registrering',           category: 'navigation', priority: 'high',     status: 'open', due_date: null,         notes: 'Registrer på kystverket.no. Gratis. Nødvendig for DSC.' },
    { id: 'mx-epirb', title: 'Dokumenter EPIRB/PLB',            category: 'safety',     priority: 'high',     status: 'open', due_date: null,         notes: 'Registrer serienummer på 406mhz.no' },
    { id: 'mx-1223',  title: 'Installer Garmin GPSMAP 1223xsv', category: 'navigation', priority: 'medium',   status: 'open', due_date: null,         notes: 'GT15M-IH svinger + Volvo Penta NMEA 2000 gateway art. 3838617' },
    { id: 'mx-cerbo', title: 'Installer Victron Cerbo GX',      category: 'electrical', priority: 'medium',   status: 'open', due_date: null,         notes: 'Venus OS Large + Signal K + Node-RED. VE.Direct fra SmartShunt.' },
  ]);
}

// Seed historisk changelog fra vessel.js (kjøres kun én gang)
const clCount = db.prepare('SELECT COUNT(*) as n FROM changelog').get().n;
if (clCount === 0) {
  const ins = db.prepare(`INSERT INTO changelog (id,date,version,type,title,description,source,auto) VALUES (@id,@date,@version,@type,@title,@description,@source,0)`);
  const seed = db.transaction(rows => { for (const r of rows) ins.run(r); });
  const { randomUUID } = require('crypto');
  seed([
    // Planleggingsfase
    { id:randomUUID(), date:'2026-04-07', version:null,   type:'plan', title:'Teknisk analyse av Bavaria Sport 32', description:'Analyse fra FINN.no-annonse og bilder om bord. System- og utstyrsgjennomgang.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:null,   type:'plan', title:'Systemplan: Cerbo GX + Signal K + Node-RED', description:'Arkitektur: Victron Cerbo GX, Venus OS Large, Signal K, InfluxDB, Node-RED.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:null,   type:'plan', title:'Navigasjonsplan: Garmin GPSMAP 1223xsv', description:'GT15M-IH svinger, NMEA 2000-gateway art. 3838617.', source:'system' },
    // v0.1
    { id:randomUUID(), date:'2026-04-07', version:'v0.1', type:'feat', title:'Grunnmur: Node.js backend, SQLite, PWA', description:'Signal K REST+WebSocket, Service Worker, offline-cache.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:'v0.1', type:'feat', title:'Dashboard med live sensorkort', description:'Batteri, tanker, motor, navigasjon, miljø.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:'v0.1', type:'feat', title:'Strøm, Tanker, Vær, Kart', description:'Vær: MET Norway Locationforecast 2.0. Kart: Leaflet.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:'v0.1', type:'feat', title:'Nattmodus og båtmodus', description:'Mørk bakgrunn for nattseilas. Store knapper for cockpit.', source:'system' },
    // v0.2
    { id:randomUUID(), date:'2026-04-07', version:'v0.2', type:'feat', title:'Motorside med live YDEG-04 data', description:'RPM-bar, kjølevann, oljetrykk, motorlast, boost, forbruk, alternator, rekkevidde.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:'v0.2', type:'feat', title:'Hendelseslogg + Signal K mock-server', description:'Auto-hendelser fra Signal K state-transitions. Simulert hardware for utvikling.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:'v0.2', type:'feat', title:'Grafer: Chart.js sensorhistorikk', description:'Historikkvisning per sensorpath med tidsvelger.', source:'system' },
    // v0.3
    { id:randomUUID(), date:'2026-04-07', version:'v0.3', type:'feat', title:'Automatisk turdeteksjon', description:'Haversine-basert tilstandsmaskin. GPS-spor på kart.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:'v0.3', type:'feat', title:'Turdetaljer: statistikk + sensorgrafer', description:'13 statistikk-kort og 4 mini-grafer per tur (RPM, kjølevann, batteri, forbruk).', source:'system' },
    // v0.4
    { id:randomUUID(), date:'2026-04-07', version:'v0.4', type:'feat', title:'React Flow koblingsskjemaer', description:'Elektrisk (18 noder) og NMEA 2000 diagram. Vite + React + @xyflow/react.', source:'system' },
    // v0.5
    { id:randomUUID(), date:'2026-04-07', version:'v0.5', type:'feat', title:'Fun layer: haiku, humor, sjøvettregel', description:'Sensor-haiku via Claude API. Kontekstsensitive kvipp. Preposisjonsgenerator.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:'v0.5', type:'feat', title:'Sol, tidevann og push-varsler', description:'Kartverket tidevann. MET Norway soloppgang/solnedgang. VAPID push-varsler.', source:'system' },
    // v0.6
    { id:randomUUID(), date:'2026-04-07', version:'v0.6', type:'feat', title:'Kostnadslogg med årsnavigasjon', description:'CRUD med kategorier, drivstoffdetaljer, turkobling. Sammendrag per kategori.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:'v0.6', type:'feat', title:'Dokumentarkiv med Claude Vision', description:'Skann kvitteringer og dokumenter. Automatisk metadataekstraksjon.', source:'system' },
    // v0.7
    { id:randomUUID(), date:'2026-04-07', version:'v0.7', type:'feat', title:'Anomalideteksjon: z-score analyse', description:'Statistisk avvik vs 30-dagers baseline. AI-tolkning per avvik.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:'v0.7', type:'feat', title:'Motorhelse-trender per sesjon', description:'Grafer: kjølevann, oljetrykk, forbruk, RPM. Vedlikeholdsmilepæler.', source:'system' },
    { id:randomUUID(), date:'2026-04-07', version:'v0.7', type:'hardware', title:'Koblingsskjema: Piranha P3 + WS60 (36V)', description:'Lagt til undervannslys og thruster-batteri-krets i elektrisk diagram.', source:'system' },
    // v0.8
    { id:randomUUID(), date:'2026-04-08', version:'v0.8', type:'feat', title:'Summer-assistent chat', description:'Live SK-kontekst, turhistorikk og kostnader som grunnlag for AI-samtale.', source:'system' },
    { id:randomUUID(), date:'2026-04-08', version:'v0.8', type:'feat', title:'Kvitteringsskanner med redigerbare linjer', description:'Claude Vision OCR. Ruter til kostnadslogg, deler eller vedlikehold.', source:'system' },
    { id:randomUUID(), date:'2026-04-08', version:'v0.8', type:'feat', title:'Signal K MCP-server for Claude Desktop', description:'Kontekstdokument + oppsettguide for Claude Desktop-integrasjon.', source:'system' },
    { id:randomUUID(), date:'2026-04-08', version:'v0.8', type:'feat', title:'Kompakt header: Summer + sol/tide + AI-knapp', description:'Ny slank enkeltrad-header. AI-knapp gir direkte tilgang til assistenten.', source:'system' },
    { id:randomUUID(), date:'2026-04-08', version:'v0.8', type:'feat', title:'Turplanlegger + Sommers CV (faner i Turer)', description:'AI-turplanlegger med MET Norway. Biografi generert fra loggdata.', source:'system' },
    { id:randomUUID(), date:'2026-04-08', version:'v0.8', type:'feat', title:'Navigasjon ryddet fra 20 til 14 sider', description:'Helse, Avvik, Deler slått inn som faner. Service og Turer konsolidert.', source:'system' },
    // v0.9
    { id:randomUUID(), date:'2026-04-08', version:'v0.9', type:'feat', title:'Webasto fjernkontroll via W-Bus', description:'Node-RED + W-Bus serial. Start/stopp/ventilasjon, temperaturinnstilling, auto-poll 10 sek.', source:'system' },
    { id:randomUUID(), date:'2026-04-08', version:'v0.9', type:'feat', title:'Auto-changelog + diagram-patches system', description:'SQLite changelog. Auto-logging fra skanner, deler og kostnader. Diagram AI-assistent.', source:'system' },
    { id:randomUUID(), date:'2026-04-08', version:'v0.9', type:'hardware', title:'Diagram oppdatert: Node-RED + W-Bus + Webasto', description:'Elektrisk og NMEA-diagram oppdatert med Node-RED kontrolllag og W-Bus kjedet til Webasto.', source:'system' },
  ]);
}

// Migrer fuel_cache-tabellen om den har feil skjema (singleton-versjon)
try {
  const cols = db.prepare("PRAGMA table_info(fuel_cache)").all();
  const hasSingleton = cols.some(c => c.name === 'id' && c.dflt_value && c.dflt_value.includes('singleton'));
  const hasStationId = cols.some(c => c.name === 'station_id');
  if (hasSingleton && !hasStationId) {
    db.prepare('DROP TABLE fuel_cache').run();
    console.log('[db] Migrert fuel_cache: gammel singleton-tabell droppet');
  }
} catch {}

module.exports = db;

