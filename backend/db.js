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

  CREATE TABLE IF NOT EXISTS router_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT NOT NULL,
    signal_dbm INTEGER,
    rx_bytes   INTEGER,
    tx_bytes   INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_router_history_ts ON router_history(ts DESC);

  CREATE TABLE IF NOT EXISTS device_traffic_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT NOT NULL,
    mac        TEXT NOT NULL,
    hostname   TEXT,
    ip         TEXT,
    rx_packets INTEGER,
    tx_packets INTEGER,
    signal_dbm INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_device_traffic_ts  ON device_traffic_history(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_device_traffic_mac ON device_traffic_history(mac, ts DESC);

  CREATE TABLE IF NOT EXISTS device_aliases (
    mac        TEXT PRIMARY KEY,
    alias      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS diag_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,
    tag       TEXT NOT NULL,
    message   TEXT NOT NULL,
    context   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_diag_events_ts  ON diag_events(ts);
  CREATE INDEX IF NOT EXISTS idx_diag_events_tag ON diag_events(tag);

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
    source      TEXT DEFAULT 'manual',         -- manual | scanner | parts | costs | system | feature
    auto        INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_changelog_date ON changelog(date DESC);

  -- ── Vessel items (spesifikasjoner + diagram-noder, forent modell) ───────
  CREATE TABLE IF NOT EXISTS vessel_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    slug             TEXT UNIQUE,                -- for diagram-referanse (kan være NULL for rene spec-rader)
    category         TEXT NOT NULL,              -- 'Elektrisk', 'Fremdrift', 'Identifikasjon' osv
    label            TEXT NOT NULL,              -- 'Husbatteri', 'Motor'
    value            TEXT,                       -- fri verdi: '8× Makspower LiFePO4 100Ah'
    notes            TEXT,
    model            TEXT,
    vendor           TEXT,
    serial_number    TEXT,
    install_date     TEXT,
    status           TEXT DEFAULT 'installed',   -- installed | planned | removed
    mono             INTEGER DEFAULT 0,          -- spec-rad vises i monospace
    sort_order       INTEGER DEFAULT 0,
    diagram_data     TEXT,                       -- JSON: { nodeType, x, y, sub, diagrams: ['electrical'], badge }
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_vessel_items_category ON vessel_items(category, sort_order);
  CREATE INDEX IF NOT EXISTS idx_vessel_items_slug     ON vessel_items(slug);

  CREATE TABLE IF NOT EXISTS vessel_connections (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    slug         TEXT,                           -- 'e1', 'e2', kan være NULL
    diagram      TEXT NOT NULL,                  -- 'electrical' | 'nmea'
    from_slug    TEXT NOT NULL,
    to_slug      TEXT NOT NULL,
    edge_data    TEXT,                           -- JSON: { label, animated, style: { stroke, strokeWidth, strokeDasharray } }
    sort_order   INTEGER DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_vessel_connections_diagram ON vessel_connections(diagram);

  -- ── Photos (bilder av tekniske installasjoner) ──────────────────────────
  CREATE TABLE IF NOT EXISTS photos (
    id               TEXT PRIMARY KEY,
    filename         TEXT NOT NULL,
    original_name    TEXT,
    mime_type        TEXT,
    file_size        INTEGER,
    title            TEXT,
    description      TEXT,
    ai_analyzed_at   TEXT,
    linked_to_type   TEXT,    -- 'vessel_spec' | 'part' | 'maintenance' | NULL
    linked_to_id     TEXT,    -- ID i mål-tabell
    linked_to_label  TEXT,    -- fri merkelapp f.eks. "Fremdrift:Motor"
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_photos_created    ON photos(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_photos_linked     ON photos(linked_to_type, linked_to_id);
  CREATE INDEX IF NOT EXISTS idx_photos_linked_lbl ON photos(linked_to_label);

  -- ── Features (planlagte + implementerte) ────────────────────────────────
  CREATE TABLE IF NOT EXISTS features (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    description  TEXT,
    priority     INTEGER NOT NULL DEFAULT 1,            -- 0 grønn, 1 gul, 2 oransje, 3 rød
    status       TEXT NOT NULL DEFAULT 'planned',       -- planned | in_progress | done | dropped
    completed_at      TEXT,
    completed_version TEXT,
    sort_order   INTEGER DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_features_status   ON features(status);
  CREATE INDEX IF NOT EXISTS idx_features_priority ON features(priority DESC);
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
    // v0.10
    { id:randomUUID(), date:'2026-04-21', version:'v0.10', type:'feat', title:'Dieselpriser fra bunkring.no', description:'Integrert marinefuel-priser med grade/farget-info. GPS-basert geofilter (50 km) for å begrense scraping. Dedup på tvers av pumpepriser + bunkring.', source:'system' },
    { id:randomUUID(), date:'2026-04-21', version:'v0.10', type:'feat', title:'Tåke-oversikt og havtåke-prognose', description:'Ny tab på værsiden. MET fog_area_fraction + egen havtåke-regel (duggpunkt vs sjøtemp + vind + fuktighet). 48-timers timeline med fargekoder og klikkbare forklaringer.', source:'system' },
    { id:randomUUID(), date:'2026-04-21', version:'v0.10', type:'feat', title:'Embeddet Windy visibility-kart', description:'Windy.com iframe sentrert på båtens GPS med visibility-lag (ECMWF), inne i tåke-tabben.', source:'system' },
    { id:randomUUID(), date:'2026-04-21', version:'v0.10', type:'feat', title:'Kystvarsel på værsiden', description:'MET textforecast 3.0 hentes og point-in-polygon finner området båten er i. Matchet område vises med full tekst, øvrige områder foldbart.', source:'system' },
    { id:randomUUID(), date:'2026-04-21', version:'v0.10', type:'feat', title:'Tidevann på værsiden', description:'Kartverket-tidevann med nærmeste høy-/lavvann flyttet fra header til egen seksjon på værsiden.', source:'system' },
    { id:randomUUID(), date:'2026-04-21', version:'v0.10', type:'fix', title:'Ryddet bort ikke-funksjonell sol/tide-header', description:'Fjernet .hdr-meta-raden og tilhørende dashboard-logikk. Sol opp/ned vises allerede på værsiden.', source:'system' },
  ]);
}

// ── Features: seed første gang ──────────────────────────────────────────────
const featCount = db.prepare('SELECT COUNT(*) as n FROM features').get().n;
if (featCount === 0) {
  const ins = db.prepare(`
    INSERT INTO features (title, description, priority, status, completed_at, completed_version, sort_order)
    VALUES (@title, @description, @priority, @status, @completed_at, @completed_version, @sort_order)
  `);
  const seed = db.transaction(rows => { for (const r of rows) ins.run(r); });

  const done = (title, description, version) => ({
    title, description, priority: 2, status: 'done',
    completed_at: '2026-04-21T09:00:00Z', completed_version: version, sort_order: 0,
  });
  const plan = (title, description, priority, sort = 0) => ({
    title, description, priority, status: 'planned',
    completed_at: null, completed_version: null, sort_order: sort,
  });

  seed([
    // ── Implementert (status=done) ─────────────────────────────────────────
    done('Live dashboard med sensordata',   'Batteri SOC, tanker, motor, nav, miljø fra Signal K.',                     'v0.1'),
    done('Strømside',                        'Batterispenning, SOC, lade-/forbrukstrøm, landstrøm.',                     'v0.1'),
    done('Tankside',                         'Diesel, ferskvann, gråvann med visuell tank-UI.',                          'v0.1'),
    done('Motorside med YDEG-04-data',       'RPM, kjølevann, oljetrykk, last, boost, forbruk, rekkevidde.',             'v0.2'),
    done('Webasto-fjernkontroll via W-Bus',  'Node-RED + serial. Start/stopp/ventilasjon + temperaturinnstilling.',      'v0.9'),
    done('Værside med MET Norway',           'Locationforecast + Oceanforecast + Sunrise 3.0.',                          'v0.1'),
    done('Kart (Leaflet)',                   'Leaflet-basert kart med live GPS.',                                        'v0.1'),
    done('Hendelseslogg',                    'Auto-hendelser fra Signal K state-transitions.',                           'v0.2'),
    done('Sensorhistorikk-grafer',           'Chart.js per sensorpath med tidsvelger.',                                  'v0.2'),
    done('Automatisk turdeteksjon',          'Haversine-basert tilstandsmaskin. GPS-spor på kart.',                      'v0.3'),
    done('Turdetaljer med 13 statistikker',  'Distanse, hastighet, motortid, forbruk. 4 mini-grafer per tur.',           'v0.3'),
    done('React Flow koblingsskjemaer',      'Elektrisk (18 noder) + NMEA 2000 diagram. Egen Vite-app.',                 'v0.4'),
    done('Sjøvettregel-bokser og haiku',     'Sensor-haiku via Claude API. Kontekstsensitive kvipp.',                    'v0.5'),
    done('Push-varsler',                     'VAPID web-push med abonnement-håndtering.',                                'v0.5'),
    done('Kostnadslogg med årsnavigasjon',   'CRUD, kategorier, drivstoffdetaljer, turkobling.',                         'v0.6'),
    done('Dokumentarkiv med Claude Vision',  'Skann kvitteringer og dokumenter. Automatisk metadata-ekstraksjon.',       'v0.6'),
    done('Anomalideteksjon (z-score)',       'Statistisk avvik vs 30-dagers baseline. AI-tolkning.',                     'v0.7'),
    done('Motorhelse-trender per sesjon',    'Grafer kjølevann, oljetrykk, forbruk, RPM.',                               'v0.7'),
    done('Summer-assistent chat',            'Live SK-kontekst, turhistorikk og kostnader i AI-samtale.',                'v0.8'),
    done('Turplanlegger + Sommers CV',       'AI-turplanlegger med MET. Biografi fra loggdata.',                         'v0.8'),
    done('Auto-changelog fra hendelser',     'SQLite changelog. Auto-logging fra skanner, deler og kostnader.',          'v0.9'),
    done('Dieselpriser fra pumpepriser.no',  'Skraper bil-dieselpriser. 12t cache i sesong, 7d utenom.',                 'v0.9'),
    done('Dieselpriser fra bunkring.no',     'Marine båtdiesel med grade-info. 50 km geo-filter rundt GPS.',             'v0.10'),
    done('Tåke-oversikt og havtåke-prognose','MET + egen havtåke-modell. 48-timers timeline med forklaringer.',          'v0.10'),
    done('Windy visibility-kart',            'Embeddet kart med visibility-lag sentrert på båtens GPS.',                 'v0.10'),
    done('Kystvarsel på værsiden',           'MET textforecast + point-in-polygon finner riktig område.',                'v0.10'),
    done('Tidevann på værsiden',             'Kartverket tidevann flyttet fra header til egen seksjon.',                 'v0.10'),

    // ── Planlagt (status=planned) ──────────────────────────────────────────
    // Prioritet 3 (rød): MÅ — sikkerhet og livsviktig
    plan('AIS-integrasjon',
         'Se nærliggende skip med kurs/fart i kart. Særlig nyttig i tåke. Kan hentes fra aishub.net eller Signal K hvis AIS-mottaker om bord.',
         3, 1),
    plan('Ankervakt',
         'GPS-alarm hvis båten drifter mer enn X meter fra ankringspunkt. Må-ha ved overnatting. Bruker eksisterende push-system.',
         3, 2),
    plan('MOB-knapp',
         'Ett trykk → drop waypoint, start klokke, log posisjon. Stor rød knapp i cockpit-modus.',
         3, 3),
    plan('MET farevarsler',
         'MET har /weatherapi/metalerts/2.0/ med faretype. Banner øverst når noe gjelder for båtens område.',
         3, 4),
    plan('Bilge-alarm',
         'Sensor i kjølrom → push-varsel hvis vann oppdages eller bilge-pumpa kjører unormalt ofte.',
         3, 5),
    plan('Log-in / autentisering',
         'Brukerautentisering for å beskytte appen ved ekstern eksponering. Multi-bruker-støtte for familien.',
         3, 6),

    // Prioritet 2 (oransje): BØR — stor daglig verdi
    plan('Ruteplanlegger med waypoints',
         'Plot rute med distanse, ETA og MET-prognose ved ankomst. Har allerede navigate-rute + trip-tracking.',
         2, 10),
    plan('Sjøkart offline',
         'Kartverkets sjøkart (WMS/WMTS) eller OpenSeaMap tiles. Kritisk i fjorder uten dekning.',
         2, 11),
    plan('Tidevannskurve',
         '24-/48-timers graf i stedet for bare neste høy/lav. Bruker samme data + Chart.js.',
         2, 12),
    plan('Sjekklister',
         'Pre-departure, docking, vinterlagring, vår-klargjøring. Gjenbrukes sesong til sesong.',
         2, 13),
    plan('Engine-hours auto-logging',
         'Automatisk øk motortime-teller når RPM > 0. Driver vedlikeholds-forfall.',
         2, 14),
    plan('Fuel econ-analyse',
         'Historikk L/nm, L/t, RPM-sweetspot. Data finnes i trips.fuel_used_l.',
         2, 15),
    plan('Kostnadsbudsjett per sesong',
         'Mål mot forbrukt. Rekkevidde-prognose på resterende budsjett.',
         2, 16),

    // Prioritet 1 (gul): NICE
    plan('Sesongsammendrag',
         'Auto-generert årbok: distanse, timer, turer, mest besøkte havn.',
         1, 20),
    plan('Havneinfo-database',
         'Dybder, gjestebrygge-plasser, fasiliteter, priser. Scrapes fra gjestehavn.no eller bygges manuelt.',
         1, 21),
    plan('Familie/gjestebok',
         'Hvem var med på turen. Auto-manifest kobler til trip-tracker.',
         1, 22),
    plan('Bro- og sluseåpninger',
         'Åpningstider for relevante broer og sluser (f.eks. Telemarkskanalen).',
         1, 23),

    // Prioritet 0 (grønn): FRAMTID
    plan('Auto-start Webasto',
         'Start varmen basert på vær + planlagt avgang. W-Bus-lag finnes allerede.',
         0, 30),
    plan('Apple Watch-komplikasjon',
         'Batteri %, diesel %, sjøtemp ved et blikk. PWA støtter ikke, trengs native wrapper.',
         0, 31),
    plan('Offentlig familie-sporing',
         'Valgfri deling av posisjon. Push til familiens telefoner når båten er på sjøen.',
         0, 32),
    plan('Predictive maintenance',
         'ML-modell på toppen av anomaly-deteksjonen. Lærer normale driftsverdier per last/omgivelse.',
         0, 33),
  ]);

  console.log(`[db] Seedet ${featCount === 0 ? 'features-tabell' : ''} med ${db.prepare('SELECT COUNT(*) as n FROM features').get().n} features`);
}

// ── Idempotent changelog-migrering for arbeid som ikke gikk via feature-complete
// Sjekker på tittel — hvis den allerede finnes, hoppes det over.
(function backfillChangelog() {
  const { randomUUID } = require('crypto');
  const exists = db.prepare('SELECT 1 FROM changelog WHERE title = ? LIMIT 1');
  const ins    = db.prepare(`
    INSERT INTO changelog (id, date, version, type, title, description, source, auto)
    VALUES (@id, @date, @version, @type, @title, @description, @source, 0)
  `);
  const rows = [
    // ── v0.10 (hvis seed kjørte først etter at tabellen allerede var fylt) ──
    { date:'2026-04-21', version:'v0.10', type:'feat',     title:'Dieselpriser fra bunkring.no',           description:'Integrert marinefuel-priser med grade/farget-info. GPS-basert geofilter (50 km). Dedup på tvers av pumpepriser + bunkring.' },
    { date:'2026-04-21', version:'v0.10', type:'feat',     title:'Tåke-oversikt og havtåke-prognose',      description:'Ny tab på værsiden. MET fog_area_fraction + egen havtåke-regel (duggpunkt vs sjø + vind + fuktighet). 48-timers timeline med fargekoder.' },
    { date:'2026-04-21', version:'v0.10', type:'feat',     title:'Embeddet Windy visibility-kart',         description:'Windy.com iframe sentrert på båtens GPS med visibility-lag (ECMWF), inne i tåke-tabben.' },
    { date:'2026-04-21', version:'v0.10', type:'feat',     title:'Kystvarsel på værsiden',                 description:'MET textforecast 3.0 hentes og point-in-polygon finner området båten er i.' },
    { date:'2026-04-21', version:'v0.10', type:'feat',     title:'Tidevann på værsiden',                    description:'Kartverket-tidevann flyttet fra header til egen seksjon på værsiden.' },
    { date:'2026-04-21', version:'v0.10', type:'fix',      title:'Ryddet bort ikke-funksjonell sol/tide-header', description:'Fjernet .hdr-meta-raden. Sol opp/ned vises på værsiden.' },
    // ── v0.11 — System-side, bilder, RUT200 PoC, auto-diagram ──
    { date:'2026-04-21', version:'v0.11', type:'feat',     title:'Ny System-side med tre tabs',            description:'Arkitektur, endringslogg og features flyttet fra #vessel til ny #system-side (🧩 i toppstripa). Eget tab for bilder.' },
    { date:'2026-04-21', version:'v0.11', type:'feat',     title:'Features-modul med auto-versjonsbump',   description:'CRUD for features. Priority 0-3 med tåke-farger. Ved "mark som ferdig" → auto-opprett changelog-entry + bump patch-versjon.' },
    { date:'2026-04-21', version:'v0.11', type:'feat',     title:'Bilder-feature med Claude Vision',       description:'Upload + Claude Vision-analyse foreslår beskrivende tekst på norsk. Kobles til vessel-items via dropdown eller fri merkelapp.' },
    { date:'2026-04-21', version:'v0.11', type:'feat',     title:'RUT200 PoC-integrasjon',                  description:'Ny /api/router-rute med JSON-RPC til OpenWrt ubus. Endepunkter: status, reboot, SMS, wifi-clients. Klar til bruk når ruteren kommer.' },
    { date:'2026-04-21', version:'v0.11', type:'feat',     title:'22 RUT200-features seedet',               description:'Planlagt AIS-integrasjon, ankervakt, MOB-knapp, MET farevarsler, bilge-alarm, data-til-server, remote-reboot m.fl.' },
    { date:'2026-04-21', version:'v0.11', type:'feat',     title:'vessel_items + vessel_connections som source-of-truth', description:'68 spec-rader + 41 diagramkoblinger migrert fra hardkodet til SQLite. Dekker spec-tabeller og begge koblingsskjemaer.' },
    { date:'2026-04-21', version:'v0.11', type:'feat',     title:'Auto-oppdaterende koblingsskjemaer',      description:'Diagram-appen (React Flow) fetcher fra /api/vessel/diagram/:type i stedet for hardkodet data. Oppdateres automatisk når enheter endres på #vessel.' },
    { date:'2026-04-21', version:'v0.11', type:'feat',     title:'Redigerbare spec-rader på #vessel',       description:'Inline-edit av alle felter + "Legg til enhet"-skjema. Checkbox for diagram-tilhørighet (elektrisk/NMEA) med koordinater og node-type.' },
    { date:'2026-04-21', version:'v0.11', type:'refactor', title:'Ryddet vessel.js',                        description:'Fjernet changelog-logikk og arkitektur-seksjonen. Siden fokuserer nå på båtspesifikk data (hero, diagrammer, spec-tabeller).' },
  ];
  let added = 0;
  for (const r of rows) {
    if (!exists.get(r.title)) {
      ins.run({ id: randomUUID(), source: 'system', ...r });
      added++;
    }
  }
  if (added) console.log('[db] Etter-fylte ' + added + ' changelog-entries (v0.10/v0.11)');
})();

// ── Vessel items + connections (fra seeds-modul) ────────────────────────────
try {
  require('./seeds/vessel_items').seedVesselItems(db);
} catch (e) {
  console.error('[db] vessel_items-seed feilet:', e.message);
}

// ── RUT200-features: idempotent seed (legger til hvis "RUT200:" ikke finnes) ──
const hasRut = db.prepare(`SELECT COUNT(*) as n FROM features WHERE title LIKE 'RUT200:%'`).get().n;
if (hasRut === 0) {
  const ins = db.prepare(`
    INSERT INTO features (title, description, priority, status, sort_order)
    VALUES (?, ?, ?, 'planned', ?)
  `);
  const tx = db.transaction(rows => { for (const r of rows) ins.run(r.title, r.description, r.priority, r.sort_order); });

  tx([
    // MÅ (priority 3)
    { title: 'RUT200: Konnektivitets-dashboard',     description: 'Signalstyrke (RSSI/SINR/RSRP), operatør, nettverkstype, aktivt band, failover-status. Henter via /ubus JSON-RPC.', priority: 3, sort_order: 50 },
    { title: 'RUT200: WAN-failover-varsling',        description: 'Push-varsel når ruteren bytter WAN-kilde (4G → WiFi → wired) eller mister all tilkobling.', priority: 3, sort_order: 51 },
    { title: 'RUT200: Datakvote-monitor med varsel', description: 'Vis daglig/månedlig SIM-forbruk + push-varsel ved 80/90 % av kvote.', priority: 3, sort_order: 52 },
    { title: 'RUT200: SMS som backup-varselkanal',   description: 'RUT200 sender SMS direkte via SIM. Kritiske varsler når push-server / internett er nede.', priority: 3, sort_order: 53 },

    // BØR (priority 2)
    { title: 'RUT200: Digital Input → event',        description: 'DI (0-30 V) leser én boolsk sensor (f.eks. landstrøm, bilge-flyter). Event til /api/events.', priority: 2, sort_order: 60 },
    { title: 'RUT200: Digital Output → fjernstyrt relé', description: 'DO styrer relé (30 V / 300 mA). Power-cycle båt-PC, styre lys eller pumpe.', priority: 2, sort_order: 61 },
    { title: 'RUT200: Wi-Fi-enheter om bord',        description: 'List tilkoblede enheter. Detekter familiens telefoner for auto-logging av personer om bord.', priority: 2, sort_order: 62 },
    { title: 'RUT200: Data-to-server-fallback',      description: 'RUT200 pusher telemetri via MQTT/HTTP direkte til backend. Robust datakilde uavhengig av Cerbo GX/Signal K.', priority: 2, sort_order: 63 },
    { title: 'RUT200: Remote-reboot av hele systemet', description: 'Hjemme-fra-knapp: reboot ruter via /ubus + power-cycle båt-PC via DO-relé.', priority: 2, sort_order: 64 },
    { title: 'RUT200: Hjemkomst-detektor',           description: 'Detekter «båten har ankommet hjemmehavn» via bytte til marina-WiFi. Auto-generer tur-slutt.', priority: 2, sort_order: 65 },

    // NICE (priority 1)
    { title: 'RUT200: Gjeste-WiFi med custom captive portal', description: 'Hotspot med "Velkommen om bord FAR999"-side. Knyttes til planlagt gjestebok-feature.', priority: 1, sort_order: 70 },
    { title: 'RUT200: SMS-fjernkommandoer',          description: 'SMS til båtens SIM: `WEBASTO ON`, `STATUS`, `REBOOT`. RUT200 ruter SMS → HTTP til backend.', priority: 1, sort_order: 71 },
    { title: 'RUT200: Signal-anomalideteksjon',      description: 'Plott signalstyrke over tid. Varsle ved brått dekning-tap (antenne-orientering i havn).', priority: 1, sort_order: 72 },
    { title: 'RUT200: WireGuard VPN til hjemmenett', description: 'RUT200 som WireGuard-klient. Sikker fjerntilgang uten å eksponere porter — avhjelper også login/auth-behov.', priority: 1, sort_order: 73 },
    { title: 'RUT200: NTP-server for båtens LAN',    description: 'RUT200 som NTP-kilde (presis tid via mobilnett). Signal K-enheter uten GPS får korrekt klokke.', priority: 1, sort_order: 74 },
    { title: 'RUT200: WiFi-signalkart om bord',      description: 'Logg klienters signalstyrke over tid → identifiser døde WiFi-soner på båten.', priority: 1, sort_order: 75 },

    // FRAMTID (priority 0)
    { title: 'RUT200: Node-RED på ruter selv',       description: 'Installere Node-RED via Package Manager. Kjør automasjonsflows lokalt som fallback hvis Cerbo GX er offline.', priority: 0, sort_order: 80 },
    { title: 'RUT200: Modbus-bridge',                description: 'RUT200 har Modbus TCP server + client. Integrere maritime Modbus-sensorer (solregulator, vindmåler).', priority: 0, sort_order: 81 },
    { title: 'RUT200: PoE-powered IP-kamera',        description: 'Passiv PoE ut på LAN1 (9-30 V). Driv et IP-kamera for salon/motorrom.', priority: 0, sort_order: 82 },
    { title: 'RUT200: Automatisk SIM-profil-bytte (eSIM)', description: 'eSIM-versjon har 7 profiler. Automatisk bytte til lokal operator i utlandet for å unngå roaming.', priority: 0, sort_order: 83 },
    { title: 'RUT200: Custom OpenWrt-pakke "bavapp-agent"', description: 'Egen Lua/C-pakke som eksponerer båt-spesifikke data i ett JSON-endepunkt.', priority: 0, sort_order: 84 },
    { title: 'RUT200: Failsafe status-side på ruter', description: 'Minimal "båt-status"-side hostet direkte på RUT200. Tilgjengelig selv om backend er nede.', priority: 0, sort_order: 85 },
  ]);
  console.log('[db] Seedet 22 RUT200-features');
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

