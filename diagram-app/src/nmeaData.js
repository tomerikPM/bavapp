// Bavaria Sport 32 — NMEA 2000 / Digital Infrastructure diagram

export const nmeaNodes = [

  // ── NMEA 2000 backbone ────────────────────────────────────────────────────
  {
    id: 'term1',
    type: 'bavNode',
    position: { x: 400, y: 0 },
    data: { nodeType: 'network', label: 'Terminator', sub: '120Ω · aktiv\nNMEA 2000 enden' },
  },
  {
    id: 'backbone',
    type: 'bavNode',
    position: { x: 400, y: 130 },
    data: {
      nodeType: 'network',
      label: 'NMEA 2000 Backbone',
      sub: 'Micro-C · 12V bus\n9 noder · 1× trunk',
    },
  },
  {
    id: 'term2',
    type: 'bavNode',
    position: { x: 400, y: 560 },
    data: { nodeType: 'network', label: 'Terminator', sub: '120Ω · aktiv\nNMEA 2000 enden' },
  },

  // ── Devices tapping off backbone ──────────────────────────────────────────
  {
    id: 'ydeg',
    type: 'bavNode',
    position: { x: 0, y: 200 },
    data: {
      nodeType: 'controller',
      label: 'YDEG-04',
      sub: 'Yacht Devices\nEVC gateway\nVolvo Penta → N2K',
      badge: 'planned',
    },
  },
  {
    id: 'evc',
    type: 'bavNode',
    position: { x: 0, y: 360 },
    data: {
      nodeType: 'engine',
      label: 'Volvo Penta EVC',
      sub: 'D6 · Motor-PC\nPGN: RPM, temp, olje\nforbruk, last%',
      badge: 'installed',
    },
  },
  {
    id: 'garmin',
    type: 'bavNode',
    position: { x: 200, y: 250 },
    data: {
      nodeType: 'consumer',
      label: 'Garmin 1223xsv',
      sub: 'GPSMAP · chartplotter\nGPS, sonar, NMEA',
      badge: 'planned',
    },
  },
  {
    id: 'vhf',
    type: 'bavNode',
    position: { x: 600, y: 200 },
    data: {
      nodeType: 'consumer',
      label: 'VHF / AIS',
      sub: 'Std. Horizon GX2200\nAIS type B innebygd\nNMEA 0183 → N2K',
      badge: 'installed',
    },
  },
  {
    id: 'depth',
    type: 'bavNode',
    position: { x: 600, y: 370 },
    data: {
      nodeType: 'consumer',
      label: 'Ekkolodd / Vind',
      sub: 'Dybde · vindretning\nPGN: temp, dybde, sog',
      badge: 'installed',
    },
  },
  {
    id: 'cerbo',
    type: 'bavNode',
    position: { x: 800, y: 280 },
    data: {
      nodeType: 'controller',
      label: 'Victron Cerbo GX',
      sub: 'Venus OS Large\nNMEA 2000 interface\nSignal K server',
      badge: 'planned',
    },
  },

  // ── Software layer ────────────────────────────────────────────────────────
  {
    id: 'signalk',
    type: 'bavNode',
    position: { x: 800, y: 460 },
    data: {
      nodeType: 'network',
      label: 'Signal K',
      sub: 'REST + WebSocket\nFAR999 · port 3000\nBavApp backend',
      badge: 'planned',
    },
  },
  {
    id: 'bavapp',
    type: 'bavNode',
    position: { x: 800, y: 600 },
    data: {
      nodeType: 'controller',
      label: 'BavApp / Summer',
      sub: 'Node.js + Express\nSQLite · PWA\nlocalhost:3001',
      badge: 'planned',
    },
  },

  // ── W-Bus lag ────────────────────────────────────────────────────────────
  {
    id: 'nodered',
    type: 'bavNode',
    position: { x: 800, y: 740 },
    data: {
      nodeType: 'controller',
      label: 'Node-RED',
      sub: 'Cerbo GX · Venus OS Large\nW-Bus serial handler\nHTTP :1880',
      badge: 'planned',
    },
  },
  {
    id: 'wbus',
    type: 'bavNode',
    position: { x: 600, y: 740 },
    data: {
      nodeType: 'network',
      label: 'W-Bus / K-line',
      sub: 'USB KKL-adapter\n2400 baud · single wire\nKKL 409.1',
      badge: 'planned',
    },
  },
  {
    id: 'webasto',
    type: 'bavNode',
    position: { x: 400, y: 740 },
    data: {
      nodeType: 'consumer',
      label: 'Webasto AirTop',
      sub: 'Evo 3900 Marine\nW-Bus 2 · 12V\nFjernkontroll via app',
      badge: 'installed',
    },
  },
];

export const nmeaEdges = [
  // Backbone spine
  { id: 'n1', source: 'term1',    target: 'backbone',  style: { stroke: '#0077c2', strokeWidth: 3 } },
  { id: 'n2', source: 'backbone', target: 'term2',     style: { stroke: '#0077c2', strokeWidth: 3 } },

  // Devices → backbone (drop cables)
  { id: 'n3',  source: 'ydeg',    target: 'backbone',  style: { stroke: '#0077c2', strokeWidth: 2 }, label: 'drop' },
  { id: 'n4',  source: 'garmin',  target: 'backbone',  style: { stroke: '#0077c2', strokeWidth: 2 }, label: 'drop' },
  { id: 'n5',  source: 'vhf',     target: 'backbone',  style: { stroke: '#0077c2', strokeWidth: 2 }, label: 'drop' },
  { id: 'n6',  source: 'depth',   target: 'backbone',  style: { stroke: '#0077c2', strokeWidth: 2 }, label: 'drop' },
  { id: 'n7',  source: 'cerbo',   target: 'backbone',  style: { stroke: '#0077c2', strokeWidth: 2 }, label: 'drop' },

  // EVC → YDEG (serial/analog)
  { id: 'n8',  source: 'evc',     target: 'ydeg',      style: { stroke: '#b01020', strokeWidth: 2 }, label: 'EVC bus' },

  // Software chain
  { id: 'n9',  source: 'cerbo',   target: 'signalk',   style: { stroke: '#1a7040', strokeWidth: 2 }, label: 'N2K → SK' },
  { id: 'n10', source: 'signalk', target: 'bavapp',    style: { stroke: '#1a7040', strokeWidth: 2 }, label: 'WebSocket' },

  // Node-RED / W-Bus kjede
  { id: 'n11', source: 'cerbo',   target: 'nodered',  style: { stroke: '#7b1fa2', strokeWidth: 2 }, label: 'Venus OS' },
  { id: 'n12', source: 'nodered', target: 'wbus',     style: { stroke: '#7b1fa2', strokeWidth: 2 }, label: 'serial' },
  { id: 'n13', source: 'wbus',    target: 'webasto',  style: { stroke: '#7b1fa2', strokeWidth: 2, strokeDasharray: '5 3' }, label: 'K-line' },
  { id: 'n14', source: 'bavapp',  target: 'nodered',  style: { stroke: '#003b7e', strokeWidth: 1.5, strokeDasharray: '3 3' }, label: 'kommando' },
];
