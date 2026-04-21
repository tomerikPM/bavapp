'use strict';
// seeds/vessel_items.js — Seed vessel_items + vessel_connections fra hardkodet spec og diagram-data
//
// Kilde:
//   - frontend/js/pages/vessel.js (spec-rader)
//   - diagram-app/src/electricalData.js (noder + edges)
//   - diagram-app/src/nmeaData.js      (noder + edges)
//
// Merger ved slug når det er naturlig (eksempel: diagramnode 'shunt' er
// samme som "Batterimonitor 1" i spec-tabellen — én rad med begge felt).

function seedVesselItems(db) {
  const hasAny = db.prepare('SELECT COUNT(*) as n FROM vessel_items').get().n;
  if (hasAny > 0) return;

  const insItem = db.prepare(`
    INSERT INTO vessel_items
      (slug, category, label, value, notes, model, vendor, serial_number, install_date,
       status, mono, sort_order, diagram_data)
    VALUES
      (@slug, @category, @label, @value, @notes, @model, @vendor, @serial_number, @install_date,
       @status, @mono, @sort_order, @diagram_data)
  `);

  const insConn = db.prepare(`
    INSERT INTO vessel_connections (slug, diagram, from_slug, to_slug, edge_data, sort_order)
    VALUES (@slug, @diagram, @from_slug, @to_slug, @edge_data, @sort_order)
  `);

  const tx = db.transaction(() => {
    for (let i = 0; i < ITEMS.length; i++) {
      const it = ITEMS[i];
      insItem.run({
        slug:          it.slug || null,
        category:      it.category,
        label:         it.label,
        value:         it.value || null,
        notes:         it.notes || null,
        model:         it.model || null,
        vendor:        it.vendor || null,
        serial_number: it.serial || null,
        install_date:  it.install_date || null,
        status:        it.status || 'installed',
        mono:          it.mono ? 1 : 0,
        sort_order:    i,
        diagram_data:  it.diagram ? JSON.stringify(it.diagram) : null,
      });
    }
    for (let i = 0; i < CONNECTIONS.length; i++) {
      const c = CONNECTIONS[i];
      insConn.run({
        slug:       c.slug || null,
        diagram:    c.diagram,
        from_slug:  c.from,
        to_slug:    c.to,
        edge_data:  JSON.stringify(c.edge_data || {}),
        sort_order: i,
      });
    }
  });
  tx();
  console.log(`[db] Seedet ${ITEMS.length} vessel_items + ${CONNECTIONS.length} vessel_connections`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS — spec-rader og diagram-noder kombinert
// ─────────────────────────────────────────────────────────────────────────────
// diagram-feltet inneholder React Flow-node-data når raden også skal tegnes.
// { nodeType, x, y, sub, badge, diagrams: ['electrical'|'nmea'] }

const ITEMS = [
  // ── Identifikasjon ─────────────────────────────────────────────────────
  { category: 'Identifikasjon', label: 'Hull ID',           value: 'DE-BAVE32A7K213', mono: true },
  { category: 'Identifikasjon', label: 'Registreringsnr.',  value: 'FAR999',          mono: true },
  { category: 'Identifikasjon', label: 'Modell',            value: 'Bavaria Sport 32' },
  { category: 'Identifikasjon', label: 'Byggeår',           value: '2013' },

  // ── Fremdrift ──────────────────────────────────────────────────────────
  { slug: 'engine',   category: 'Fremdrift', label: 'Motor',       value: 'Volvo Penta D6 330 hk (243 kW)',
    model: 'Volvo Penta D6 330', vendor: 'Volvo Penta',
    diagram: { nodeType:'engine', x:850, y:460, sub:'330 hk · 12V start\n1 085 gangtimer', badge:'installed', diagrams:['electrical'] }},
  { category: 'Fremdrift', label: 'Motor S/N',  value: '21918547',       mono: true, serial: '21918547' },
  { category: 'Fremdrift', label: 'Chassis ID', value: 'VV 050736',      mono: true },
  { slug: 'evc',      category: 'Fremdrift', label: 'EVC PCU',     value: '21722886 · R1I', mono: true, serial:'21722886',
    diagram: { nodeType:'engine', x:0, y:360, sub:'D6 · Motor-PC\nPGN: RPM, temp, olje\nforbruk, last%', badge:'installed', diagrams:['nmea'] }},
  { category: 'Fremdrift', label: 'Drev',       value: 'Volvo Penta DP-D 1.76' },
  { category: 'Fremdrift', label: 'Drive S/N',  value: '3G20301186',     mono: true, serial:'3G20301186' },
  { category: 'Fremdrift', label: 'Dieseltank', value: '370 liter (Mastpol 2013)' },
  { category: 'Fremdrift', label: 'Tankgiver',  value: 'Wema S5-E790 · 0–190 Ω' },

  // ── Elektrisk (med diagram-kobling) ────────────────────────────────────
  { slug:'shore',      category: 'Elektrisk', label: 'Landstrøm', value: '230V · 3× B16 ABL Sursum',
    diagram: { nodeType:'source', x:60, y:0, sub:'230V AC · 16A\nMarina / kai', badge:'installed', diagrams:['electrical'] }},
  { slug:'alternator', category: 'Elektrisk', label: 'Alternator', value: 'Volvo Penta D6 · 12V 115A',
    diagram: { nodeType:'source', x:700, y:0, sub:'12V DC · 115A\nVolvo Penta D6', badge:'installed', diagrams:['electrical'] }},
  { slug:'charger',    category: 'Elektrisk', label: 'Lader 1 (Victron)', value: 'Victron Blue Smart IP22 12/30 · Li-ION-modus',
    model: 'Blue Smart IP22 12/30', vendor: 'Victron',
    diagram: { nodeType:'controller', x:60, y:140, sub:'Victron Blue Smart\nIP22 · 12/30 · Li-ION', badge:'installed', diagrams:['electrical'] }},
  { category: 'Elektrisk', label: 'Lader 2', value: 'Cristec (modell ikke bekreftet)', vendor:'Cristec' },
  { slug:'combiner',   category: 'Elektrisk', label: 'Batterikobler', value: 'VSR splitter · 12V smart relay',
    diagram: { nodeType:'controller', x:700, y:140, sub:'VSR splitter\n12V smart relay', badge:'installed', diagrams:['electrical'] }},
  { slug:'bat1',       category: 'Elektrisk', label: 'Husbank A', value: '4× Makspower LiFePO4 100Ah 12V = 400Ah',
    vendor:'Makspower', install_date:'2020-05',
    diagram: { nodeType:'battery', x:60, y:300, sub:'4× Makspower LiFePO4\n100Ah 12V = 400Ah\nMai 2020 · Bruenech', badge:'installed', diagrams:['electrical'] }},
  { slug:'bat2',       category: 'Elektrisk', label: 'Husbank B', value: '4× Makspower LiFePO4 100Ah 12V = 400Ah · parallell',
    vendor:'Makspower',
    diagram: { nodeType:'battery', x:260, y:300, sub:'4× Makspower LiFePO4\n100Ah 12V = 400Ah\nParallell · totalt 800Ah', badge:'installed', diagrams:['electrical'] }},
  { slug:'batstart',   category: 'Elektrisk', label: 'Startbatteri', value: 'AGM 60Ah · 12V',
    diagram: { nodeType:'battery', x:700, y:300, sub:'AGM 60Ah · 12V\nBank 2', badge:'installed', diagrams:['electrical'] }},
  { slug:'batthruster',category: 'Elektrisk', label: 'Thrusterbatteri', value: '36V Lithium · dedikert bank',
    diagram: { nodeType:'battery', x:980, y:300, sub:'36V Lithium\nDedikert bank\nAnchorlift WS60', badge:'installed', diagrams:['electrical'] }},
  { slug:'shunt',      category: 'Elektrisk', label: 'Batterimonitor 1', value: 'Victron SmartShunt 500A',
    model: 'SmartShunt 500A', vendor:'Victron',
    diagram: { nodeType:'controller', x:60, y:460, sub:'500A · Bluetooth\nVE.Direct → Cerbo GX', badge:'installed', diagrams:['electrical'] }},
  { slug:'bmv712',     category: 'Elektrisk', label: 'Batterimonitor 2', value: 'Victron BMV-712 Smart',
    model: 'BMV-712 Smart', vendor:'Victron',
    diagram: { nodeType:'controller', x:60, y:580, sub:'Smart · Bluetooth\nVE.Direct → Cerbo GX', badge:'installed', diagrams:['electrical'] }},
  { slug:'cerbo',      category: 'Elektrisk', label: 'Cerbo GX', value: 'Victron Cerbo GX · Venus OS Large (planlagt)',
    model:'Cerbo GX', vendor:'Victron', status:'planned',
    diagram: { nodeType:'controller', x:260, y:460, sub:'Venus OS Large\nSignal K · Node-RED', badge:'planned', diagrams:['electrical','nmea'] }},
  { slug:'panel',      category: 'Elektrisk', label: 'Sikringsskap', value: 'Bryterrad + automater · 12V fordeling',
    diagram: { nodeType:'panel', x:500, y:460, sub:'Bryterrad + automater\n12V fordeling', badge:'installed', diagrams:['electrical'] }},
  { category: 'Elektrisk', label: 'Ladespenning',  value: '14,4 V' },
  { category: 'Elektrisk', label: 'BMS',           value: 'Innebygd 150A per celle' },
  { category: 'Elektrisk', label: 'Ladeseparator', value: 'Quick ECS1' },
  { category: 'Elektrisk', label: 'Fjernbryter',   value: 'Blue Sea ML-RBS 500A' },
  { category: 'Elektrisk', label: 'Inverter',      value: '2900W Pure Sine Wave' },

  // ── Forbrukere (diagramnoder som ikke er i spec) ──────────────────────
  { slug:'bilge',      category: 'Elektrisk', label: 'Bilgepumpe', value: 'Rule 800 · auto',
    diagram: { nodeType:'consumer', x:0, y:640, sub:'Rule 800 · auto', diagrams:['electrical'] }},
  { slug:'navlights',  category: 'Elektrisk', label: 'Navigasjonslys', value: 'Styrbord / babord · hekk · toplys',
    diagram: { nodeType:'consumer', x:320, y:640, sub:'Styrbord / babord\nHekk · Toplys', diagrams:['electrical'] }},
  { slug:'piranha',    category: 'Elektrisk', label: 'Undervannslys', value: 'Piranha P3 SM White · 2 stk · 12V (Art. p3w)',
    diagram: { nodeType:'consumer', x:480, y:640, sub:'Piranha P3 White\n2 stk · 12V\nArt. p3w', badge:'installed', diagrams:['electrical'] }},
  { slug:'anchor',     category: 'Elektrisk', label: 'Ankervinsj', value: 'High current 12V',
    diagram: { nodeType:'consumer', x:960, y:640, sub:'High current 12V', diagrams:['electrical'] }},
  { slug:'thrusterpanel', category: 'Hekktruster', label: 'Thruster-panel', value: 'Joystick double w/on-off · Art. 92804',
    diagram: { nodeType:'panel', x:1140, y:460, sub:'Joystick double\nw/on-off\nArt. 92804', badge:'installed', diagrams:['electrical'] }},
  { slug:'thruster',   category: 'Hekktruster', label: 'Hekktruster (motor)', value: 'Anchorlift WS60 · 36V · 60+ kg skyv',
    model:'Anchorlift WS60', install_date:'2022-05-26',
    diagram: { nodeType:'engine', x:980, y:640, sub:'Hekktruster · 36V\n60+ kg skyv · brushless\nInstallert 26.05.2022', badge:'installed', diagrams:['electrical'] }},

  // ── Navigasjon og autopilot ────────────────────────────────────────────
  { category: 'Navigasjon', label: 'Chartplotter (nå)',   value: 'Garmin GPSmap 4010 · planlagt erstattet', status:'installed' },
  { slug:'chartplotter', category: 'Navigasjon', label: 'Chartplotter (ny)', value: 'Garmin GPSMAP 1223xsv + GT15M-IH svinger',
    model:'GPSMAP 1223xsv', vendor:'Garmin', status:'planned',
    diagram: { nodeType:'consumer', x:800, y:640, sub:'GPSMAP · 12V\nNMEA 2000', badge:'planned', diagrams:['electrical'] }},
  { slug:'garmin_nmea', category: 'Navigasjon', label: 'Garmin på N2K-bus', value: 'GPSMAP 1223xsv · GPS, sonar, NMEA',
    status:'planned',
    diagram: { nodeType:'consumer', x:200, y:250, sub:'GPSMAP · chartplotter\nGPS, sonar, NMEA', badge:'planned', diagrams:['nmea'] }},
  { category: 'Navigasjon', label: 'Autopilot display', value: 'Garmin GHC 20', vendor:'Garmin' },
  { category: 'Navigasjon', label: 'Autopilot ECU',     value: 'GHP Compact Reactor · S/N 4P5001717', mono:true, serial:'4P5001717', vendor:'Garmin' },
  { category: 'Navigasjon', label: 'GPS-antenne',       value: 'Garmin GPS 19x NMEA 2000', vendor:'Garmin' },
  { slug:'ydeg',       category: 'Navigasjon', label: 'NMEA 2000 gateway', value: 'YDEG-04 (planlagt)',
    model:'YDEG-04', vendor:'Yacht Devices', status:'planned',
    diagram: { nodeType:'controller', x:0, y:200, sub:'Yacht Devices\nEVC gateway\nVolvo Penta → N2K', badge:'planned', diagrams:['nmea'] }},

  // ── Kommunikasjon ──────────────────────────────────────────────────────
  { slug:'vhf',        category: 'Kommunikasjon', label: 'VHF-radio', value: 'Std. Horizon GX2200 · AIS innebygget',
    model:'GX2200', vendor:'Standard Horizon',
    diagram: { nodeType:'consumer', x:640, y:640, sub:'Std. Horizon GX2200\nAIS innebygget', badge:'installed', diagrams:['electrical'] }},
  { slug:'vhf_nmea',   category: 'Kommunikasjon', label: 'VHF / AIS på N2K', value: 'Std. Horizon GX2200 · AIS type B',
    diagram: { nodeType:'consumer', x:600, y:200, sub:'Std. Horizon GX2200\nAIS type B innebygd\nNMEA 0183 → N2K', badge:'installed', diagrams:['nmea'] }},
  { category: 'Kommunikasjon', label: 'MMSI',        value: '⚠ Ikke registrert — kystverket.no' },
  { category: 'Kommunikasjon', label: 'AIS',         value: 'Planlagt installasjon', status:'planned' },
  { category: 'Kommunikasjon', label: 'WiFi-ruter',  value: 'TP-Link TL-MR6400 · 9V buck converter (planlagt)', status:'planned' },

  // ── Komfort og interiør ────────────────────────────────────────────────
  { slug:'webasto',    category: 'Komfort', label: 'Varmeovn (Webasto)', value: 'Webasto AirTop Evo 3900 Marine · W-Bus 2',
    model:'AirTop Evo 3900 Marine', vendor:'Webasto',
    diagram: { nodeType:'consumer', x:160, y:640, sub:'Evo 3900 · 12V\nW-Bus 2', badge:'installed', diagrams:['electrical','nmea'] }},
  { category: 'Komfort', label: 'Protokoll (Webasto)', value: 'W-Bus (K-line) · MC04/05 panel' },
  { category: 'Komfort', label: 'Varmtvann', value: 'Sigmar Boiler Termoinox', vendor:'Sigmar' },
  { category: 'Komfort', label: 'Toalett',   value: 'Jabsco elektrisk',         vendor:'Jabsco' },
  { category: 'Komfort', label: 'Stereo',    value: 'Fusion MS-CD600 + BT100 (A2DP)', vendor:'Fusion' },

  // ── Digital infrastruktur / N2K-noder ──────────────────────────────────
  { slug:'term1',      category: 'Digital', label: 'N2K terminator (topp)', value: '120Ω aktiv · NMEA 2000 ende',
    diagram: { nodeType:'network', x:400, y:0, sub:'120Ω · aktiv\nNMEA 2000 enden', diagrams:['nmea'] }},
  { slug:'backbone',   category: 'Digital', label: 'N2K Backbone', value: 'Micro-C · 12V bus · 9 noder · 1× trunk',
    diagram: { nodeType:'network', x:400, y:130, sub:'Micro-C · 12V bus\n9 noder · 1× trunk', diagrams:['nmea'] }},
  { slug:'term2',      category: 'Digital', label: 'N2K terminator (bunn)', value: '120Ω aktiv · NMEA 2000 ende',
    diagram: { nodeType:'network', x:400, y:560, sub:'120Ω · aktiv\nNMEA 2000 enden', diagrams:['nmea'] }},
  { slug:'depth',      category: 'Digital', label: 'Ekkolodd / Vind', value: 'PGN: temp, dybde, SOG',
    diagram: { nodeType:'consumer', x:600, y:370, sub:'Dybde · vindretning\nPGN: temp, dybde, sog', badge:'installed', diagrams:['nmea'] }},
  { slug:'signalk',    category: 'Digital', label: 'Signal K server', value: 'Venus OS Large på Cerbo GX (planlagt)', status:'planned',
    diagram: { nodeType:'network', x:800, y:460, sub:'REST + WebSocket\nFAR999 · port 3000\nBavApp backend', badge:'planned', diagrams:['nmea'] }},
  { slug:'bavapp',     category: 'Digital', label: 'BavApp backend', value: 'Node.js + Express + SQLite',
    diagram: { nodeType:'controller', x:800, y:600, sub:'Node.js + Express\nSQLite · PWA\nlocalhost:3001', badge:'planned', diagrams:['nmea'] }},
  { slug:'nodered',    category: 'Digital', label: 'Node-RED', value: 'Cerbo GX · W-Bus kontroll (HTTP :1880)', status:'planned',
    diagram: { nodeType:'controller', x:160, y:800, sub:'Venus OS Large · Cerbo GX\nW-Bus kontroll\nHTTP API :1880', badge:'planned', diagrams:['electrical','nmea'] }},
  { slug:'wbus',       category: 'Digital', label: 'W-Bus / K-line', value: 'USB KKL-adapter · 2400 baud', status:'planned',
    diagram: { nodeType:'network', x:600, y:740, sub:'USB KKL-adapter\n2400 baud · single wire\nKKL 409.1', badge:'planned', diagrams:['nmea'] }},
  { category: 'Digital', label: 'OS',              value: 'Venus OS Large', status:'planned' },
  { category: 'Digital', label: 'Loggeplattform',  value: 'Signal K + Node-RED', status:'planned' },
  { category: 'Digital', label: 'Tidsseriedata',   value: 'InfluxDB på Cerbo GX', status:'planned' },
  { category: 'Digital', label: 'Fjerntilgang',    value: 'Tailscale VPN + VPS', status:'planned' },

  // ── Tank og kapasitet ──────────────────────────────────────────────────
  { category: 'Tank', label: 'Diesel',      value: '370 liter · Mastpol 2013' },
  { category: 'Tank', label: 'Ferskvann',   value: 'Ikke målt — sensor planlagt' },
  { category: 'Tank', label: 'Gråvann',     value: 'Ikke målt — sensor planlagt' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTIONS — edges per diagram
// ─────────────────────────────────────────────────────────────────────────────

const CONNECTIONS = [
  // ── Elektrisk diagram ────────────────────────────────────────────────
  { slug:'e1',  diagram:'electrical', from:'shore',       to:'charger',      edge_data:{ label:'230V AC', animated:true, style:{ stroke:'#e65c00', strokeWidth:2 } } },
  { slug:'e2',  diagram:'electrical', from:'charger',     to:'bat1',         edge_data:{ label:'+12V',               style:{ stroke:'#1a7040', strokeWidth:2 } } },
  { slug:'e3',  diagram:'electrical', from:'charger',     to:'bat2',         edge_data:{                              style:{ stroke:'#1a7040', strokeWidth:2 } } },
  { slug:'e4',  diagram:'electrical', from:'alternator',  to:'combiner',     edge_data:{ label:'12V lad',             style:{ stroke:'#e65c00', strokeWidth:2 } } },
  { slug:'e5',  diagram:'electrical', from:'combiner',    to:'bat1',         edge_data:{                              style:{ stroke:'#1a7040', strokeWidth:1.5, strokeDasharray:'4 2' } } },
  { slug:'e6',  diagram:'electrical', from:'combiner',    to:'batstart',     edge_data:{                              style:{ stroke:'#1a7040', strokeWidth:2 } } },
  { slug:'e7',  diagram:'electrical', from:'batstart',    to:'engine',       edge_data:{ label:'Start',               style:{ stroke:'#b01020', strokeWidth:2.5 } } },
  { slug:'e19', diagram:'electrical', from:'engine',      to:'alternator',   edge_data:{ label:'Genererer',           style:{ stroke:'#e65c00', strokeWidth:1.5, strokeDasharray:'3 3' } } },
  { slug:'e8',  diagram:'electrical', from:'bat1',        to:'shunt',        edge_data:{                              style:{ stroke:'#003b7e', strokeWidth:2 } } },
  { slug:'e9',  diagram:'electrical', from:'shunt',       to:'cerbo',        edge_data:{ label:'VE.Direct',           style:{ stroke:'#003b7e', strokeWidth:1.5 } } },
  { slug:'e9b', diagram:'electrical', from:'bat2',        to:'bmv712',       edge_data:{                              style:{ stroke:'#003b7e', strokeWidth:2 } } },
  { slug:'e9c', diagram:'electrical', from:'bmv712',      to:'cerbo',        edge_data:{ label:'VE.Direct',           style:{ stroke:'#003b7e', strokeWidth:1.5 } } },
  { slug:'e10', diagram:'electrical', from:'bat1',        to:'panel',        edge_data:{ label:'12V DC',              style:{ stroke:'#003b7e', strokeWidth:2.5 } } },
  { slug:'e11', diagram:'electrical', from:'bat2',        to:'panel',        edge_data:{                              style:{ stroke:'#003b7e', strokeWidth:2.5 } } },
  { slug:'e12', diagram:'electrical', from:'panel',       to:'bilge',        edge_data:{                              style:{ stroke:'#8a8a8a', strokeWidth:1.5 } } },
  { slug:'e13', diagram:'electrical', from:'panel',       to:'webasto',      edge_data:{                              style:{ stroke:'#8a8a8a', strokeWidth:1.5 } } },
  { slug:'e14', diagram:'electrical', from:'panel',       to:'navlights',    edge_data:{                              style:{ stroke:'#8a8a8a', strokeWidth:1.5 } } },
  { slug:'e20', diagram:'electrical', from:'panel',       to:'piranha',      edge_data:{ label:'12V',                 style:{ stroke:'#8a8a8a', strokeWidth:1.5 } } },
  { slug:'e15', diagram:'electrical', from:'panel',       to:'vhf',          edge_data:{                              style:{ stroke:'#8a8a8a', strokeWidth:1.5 } } },
  { slug:'e16', diagram:'electrical', from:'panel',       to:'chartplotter', edge_data:{                              style:{ stroke:'#8a8a8a', strokeWidth:1.5 } } },
  { slug:'e17', diagram:'electrical', from:'panel',       to:'anchor',       edge_data:{                              style:{ stroke:'#8a8a8a', strokeWidth:2 } } },
  { slug:'e18', diagram:'electrical', from:'panel',       to:'cerbo',        edge_data:{                              style:{ stroke:'#8a8a8a', strokeWidth:1.5 } } },
  { slug:'e24', diagram:'electrical', from:'cerbo',       to:'nodered',      edge_data:{ label:'Venus OS',            style:{ stroke:'#7b1fa2', strokeWidth:1.5 } } },
  { slug:'e25', diagram:'electrical', from:'nodered',     to:'webasto',      edge_data:{ label:'W-Bus',               style:{ stroke:'#7b1fa2', strokeWidth:2, strokeDasharray:'5 3' } } },
  { slug:'e21', diagram:'electrical', from:'batthruster', to:'thruster',     edge_data:{ label:'36V DC',              style:{ stroke:'#7b1fa2', strokeWidth:2.5 } } },
  { slug:'e22', diagram:'electrical', from:'thrusterpanel',to:'thruster',    edge_data:{ label:'kontroll',            style:{ stroke:'#7b1fa2', strokeWidth:1.5 } } },
  { slug:'e23', diagram:'electrical', from:'panel',       to:'thrusterpanel',edge_data:{                              style:{ stroke:'#8a8a8a', strokeWidth:1.5 } } },

  // ── NMEA diagram ─────────────────────────────────────────────────────
  { slug:'n1',  diagram:'nmea', from:'term1',    to:'backbone', edge_data:{ style:{ stroke:'#0077c2', strokeWidth:3 } } },
  { slug:'n2',  diagram:'nmea', from:'backbone', to:'term2',    edge_data:{ style:{ stroke:'#0077c2', strokeWidth:3 } } },
  { slug:'n3',  diagram:'nmea', from:'ydeg',     to:'backbone', edge_data:{ label:'drop', style:{ stroke:'#0077c2', strokeWidth:2 } } },
  { slug:'n4',  diagram:'nmea', from:'garmin_nmea', to:'backbone', edge_data:{ label:'drop', style:{ stroke:'#0077c2', strokeWidth:2 } } },
  { slug:'n5',  diagram:'nmea', from:'vhf_nmea', to:'backbone', edge_data:{ label:'drop', style:{ stroke:'#0077c2', strokeWidth:2 } } },
  { slug:'n6',  diagram:'nmea', from:'depth',    to:'backbone', edge_data:{ label:'drop', style:{ stroke:'#0077c2', strokeWidth:2 } } },
  { slug:'n7',  diagram:'nmea', from:'cerbo',    to:'backbone', edge_data:{ label:'drop', style:{ stroke:'#0077c2', strokeWidth:2 } } },
  { slug:'n8',  diagram:'nmea', from:'evc',      to:'ydeg',     edge_data:{ label:'EVC bus', style:{ stroke:'#b01020', strokeWidth:2 } } },
  { slug:'n9',  diagram:'nmea', from:'cerbo',    to:'signalk',  edge_data:{ label:'N2K → SK', style:{ stroke:'#1a7040', strokeWidth:2 } } },
  { slug:'n10', diagram:'nmea', from:'signalk',  to:'bavapp',   edge_data:{ label:'WebSocket', style:{ stroke:'#1a7040', strokeWidth:2 } } },
  { slug:'n11', diagram:'nmea', from:'cerbo',    to:'nodered',  edge_data:{ label:'Venus OS', style:{ stroke:'#7b1fa2', strokeWidth:2 } } },
  { slug:'n12', diagram:'nmea', from:'nodered',  to:'wbus',     edge_data:{ label:'serial', style:{ stroke:'#7b1fa2', strokeWidth:2 } } },
  { slug:'n13', diagram:'nmea', from:'wbus',     to:'webasto',  edge_data:{ label:'K-line', style:{ stroke:'#7b1fa2', strokeWidth:2, strokeDasharray:'5 3' } } },
  { slug:'n14', diagram:'nmea', from:'bavapp',   to:'nodered',  edge_data:{ label:'kommando', style:{ stroke:'#003b7e', strokeWidth:1.5, strokeDasharray:'3 3' } } },
];

module.exports = { seedVesselItems };
