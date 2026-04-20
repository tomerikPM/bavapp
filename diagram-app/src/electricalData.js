// Bavaria Sport 32 — DC/AC Electrical System diagram

export const electricalNodes = [

  // ── Row 0 — Ladekilder ────────────────────────────────────────────────────
  {
    id: 'shore',
    type: 'bavNode',
    position: { x: 60, y: 0 },
    data: { nodeType: 'source', label: 'Landstrøm', sub: '230V AC · 16A\nMarina / kai', badge: 'installed' },
  },
  {
    id: 'alternator',
    type: 'bavNode',
    position: { x: 700, y: 0 },
    data: { nodeType: 'source', label: 'Alternator', sub: '12V DC · 115A\nVolvo Penta D6', badge: 'installed' },
  },

  // ── Row 1 — Lading ────────────────────────────────────────────────────────
  {
    id: 'charger',
    type: 'bavNode',
    position: { x: 60, y: 140 },
    data: { nodeType: 'controller', label: 'Batterilader', sub: 'Victron Blue Smart\nIP22 · 12/30 · Li-ION', badge: 'installed' },
  },
  {
    id: 'combiner',
    type: 'bavNode',
    position: { x: 700, y: 140 },
    data: { nodeType: 'controller', label: 'Batterikobler', sub: 'VSR splitter\n12V smart relay', badge: 'installed' },
  },

  // ── Row 2 — Batterier ─────────────────────────────────────────────────────
  {
    id: 'bat1',
    type: 'bavNode',
    position: { x: 60, y: 300 },
    data: { nodeType: 'battery', label: 'Husbank A', sub: '4× Makspower LiFePO4\n100Ah 12V = 400Ah\nMai 2020 · Bruenech', badge: 'installed' },
  },
  {
    id: 'bat2',
    type: 'bavNode',
    position: { x: 260, y: 300 },
    data: { nodeType: 'battery', label: 'Husbank B', sub: '4× Makspower LiFePO4\n100Ah 12V = 400Ah\nParallell · totalt 800Ah', badge: 'installed' },
  },
  {
    id: 'batstart',
    type: 'bavNode',
    position: { x: 700, y: 300 },
    data: { nodeType: 'battery', label: 'Startbatteri', sub: 'AGM 60Ah · 12V\nBank 2', badge: 'installed' },
  },
  {
    id: 'batthruster',
    type: 'bavNode',
    position: { x: 980, y: 300 },
    data: {
      nodeType: 'battery',
      label: 'Thrusterbatteri',
      sub: '36V Lithium\nDedikert bank\nAnchorlift WS60',
      badge: 'installed',
    },
  },

  // ── Row 3 — Overvåking og fordeling ──────────────────────────────────────
  {
    id: 'shunt',
    type: 'bavNode',
    position: { x: 60, y: 460 },
    data: { nodeType: 'controller', label: 'Victron SmartShunt', sub: '500A · Bluetooth\nVE.Direct → Cerbo GX', badge: 'installed' },
  },
  {
    id: 'bmv712',
    type: 'bavNode',
    position: { x: 60, y: 580 },
    data: { nodeType: 'controller', label: 'Victron BMV-712', sub: 'Smart · Bluetooth\nVE.Direct → Cerbo GX', badge: 'installed' },
  },
  {
    id: 'cerbo',
    type: 'bavNode',
    position: { x: 260, y: 460 },
    data: { nodeType: 'controller', label: 'Victron Cerbo GX', sub: 'Venus OS Large\nSignal K · Node-RED', badge: 'planned' },
  },
  {
    id: 'panel',
    type: 'bavNode',
    position: { x: 500, y: 460 },
    data: { nodeType: 'panel', label: 'Sikringsskap', sub: 'Bryterrad + automater\n12V fordeling', badge: 'installed' },
  },
  {
    id: 'engine',
    type: 'bavNode',
    position: { x: 850, y: 460 },
    data: { nodeType: 'engine', label: 'Volvo Penta D6', sub: '330 hk · 12V start\n1 085 gangtimer', badge: 'installed' },
  },

  // ── Node-RED / W-Bus kontrolllag ─────────────────────────────────────
  {
    id: 'nodered',
    type: 'bavNode',
    position: { x: 160, y: 800 },
    data: {
      nodeType: 'controller',
      label: 'Node-RED',
      sub: 'Venus OS Large · Cerbo GX\nW-Bus kontroll\nHTTP API :1880',
      badge: 'planned',
    },
  },
  {
    id: 'bilge',
    type: 'bavNode',
    position: { x: 0, y: 640 },
    data: { nodeType: 'consumer', label: 'Bilgepumpe', sub: 'Rule 800 · auto' },
  },
  {
    id: 'webasto',
    type: 'bavNode',
    position: { x: 160, y: 640 },
    data: { nodeType: 'consumer', label: 'Webasto AirTop', sub: 'Evo 3900 · 12V\nW-Bus 2', badge: 'installed' },
  },
  {
    id: 'navlights',
    type: 'bavNode',
    position: { x: 320, y: 640 },
    data: { nodeType: 'consumer', label: 'Navigasjonslys', sub: 'Styrbord / babord\nHekk · Toplys' },
  },
  {
    id: 'piranha',
    type: 'bavNode',
    position: { x: 480, y: 640 },
    data: {
      nodeType: 'consumer',
      label: 'Piranha P3 SM',
      sub: 'Undervannslys White\n2 stk · 12V\nArt. p3w',
      badge: 'installed',
    },
  },
  {
    id: 'vhf',
    type: 'bavNode',
    position: { x: 640, y: 640 },
    data: { nodeType: 'consumer', label: 'VHF Radio', sub: 'Std. Horizon GX2200\nAIS innebygget', badge: 'installed' },
  },
  {
    id: 'chartplotter',
    type: 'bavNode',
    position: { x: 800, y: 640 },
    data: { nodeType: 'consumer', label: 'Garmin 1223xsv', sub: 'GPSMAP · 12V\nNMEA 2000', badge: 'planned' },
  },
  {
    id: 'anchor',
    type: 'bavNode',
    position: { x: 960, y: 640 },
    data: { nodeType: 'consumer', label: 'Ankervinsj', sub: 'High current 12V' },
  },

  // ── Row 4 — 36V Thruster-krets ────────────────────────────────────────────
  {
    id: 'thruster',
    type: 'bavNode',
    position: { x: 980, y: 640 },
    data: {
      nodeType: 'engine',
      label: 'Anchorlift WS60',
      sub: 'Hekktruster · 36V\n60+ kg skyv · brushless\nInstallert 26.05.2022',
      badge: 'installed',
    },
  },
  {
    id: 'thrusterpanel',
    type: 'bavNode',
    position: { x: 1140, y: 460 },
    data: {
      nodeType: 'panel',
      label: 'Thruster panel',
      sub: 'Joystick double\nw/on-off\nArt. 92804',
      badge: 'installed',
    },
  },
];

export const electricalEdges = [
  // Landstrøm → lader → batterier
  { id: 'e1',  source: 'shore',        target: 'charger',      style: { stroke: '#e65c00', strokeWidth: 2 }, label: '230V AC', animated: true },
  { id: 'e2',  source: 'charger',      target: 'bat1',         style: { stroke: '#1a7040', strokeWidth: 2 }, label: '+12V' },
  { id: 'e3',  source: 'charger',      target: 'bat2',         style: { stroke: '#1a7040', strokeWidth: 2 } },

  // Alternator → combiner → start + hus
  { id: 'e4',  source: 'alternator',   target: 'combiner',     style: { stroke: '#e65c00', strokeWidth: 2 }, label: '12V lad' },
  { id: 'e5',  source: 'combiner',     target: 'bat1',         style: { stroke: '#1a7040', strokeWidth: 1.5, strokeDasharray: '4 2' } },
  { id: 'e6',  source: 'combiner',     target: 'batstart',     style: { stroke: '#1a7040', strokeWidth: 2 } },

  // Start → motor
  { id: 'e7',  source: 'batstart',     target: 'engine',       style: { stroke: '#b01020', strokeWidth: 2.5 }, label: 'Start' },
  { id: 'e19', source: 'engine',       target: 'alternator',   style: { stroke: '#e65c00', strokeWidth: 1.5, strokeDasharray: '3 3' }, label: 'Genererer' },

  // Husbatteri → shunt → cerbo → panel
  { id: 'e8',  source: 'bat1',         target: 'shunt',        style: { stroke: '#003b7e', strokeWidth: 2 } },
  { id: 'e9',  source: 'shunt',        target: 'cerbo',        style: { stroke: '#003b7e', strokeWidth: 1.5 }, label: 'VE.Direct' },
  { id: 'e9b', source: 'bat2',         target: 'bmv712',       style: { stroke: '#003b7e', strokeWidth: 2 } },
  { id: 'e9c', source: 'bmv712',       target: 'cerbo',        style: { stroke: '#003b7e', strokeWidth: 1.5 }, label: 'VE.Direct' },
  { id: 'e10', source: 'bat1',         target: 'panel',        style: { stroke: '#003b7e', strokeWidth: 2.5 }, label: '12V DC' },
  { id: 'e11', source: 'bat2',         target: 'panel',        style: { stroke: '#003b7e', strokeWidth: 2.5 } },

  // Panel → 12V forbrukere
  { id: 'e12', source: 'panel',        target: 'bilge',        style: { stroke: '#8a8a8a', strokeWidth: 1.5 } },
  { id: 'e13', source: 'panel',        target: 'webasto',      style: { stroke: '#8a8a8a', strokeWidth: 1.5 } },
  { id: 'e14', source: 'panel',        target: 'navlights',    style: { stroke: '#8a8a8a', strokeWidth: 1.5 } },
  { id: 'e20', source: 'panel',        target: 'piranha',      style: { stroke: '#8a8a8a', strokeWidth: 1.5 }, label: '12V' },
  { id: 'e15', source: 'panel',        target: 'vhf',          style: { stroke: '#8a8a8a', strokeWidth: 1.5 } },
  { id: 'e16', source: 'panel',        target: 'chartplotter', style: { stroke: '#8a8a8a', strokeWidth: 1.5 } },
  { id: 'e17', source: 'panel',        target: 'anchor',       style: { stroke: '#8a8a8a', strokeWidth: 2 } },
  { id: 'e18', source: 'panel',        target: 'cerbo',        style: { stroke: '#8a8a8a', strokeWidth: 1.5 } },

  // Cerbo GX → Node-RED → Webasto W-Bus
  { id: 'e24', source: 'cerbo',        target: 'nodered',      style: { stroke: '#7b1fa2', strokeWidth: 1.5 }, label: 'Venus OS' },
  { id: 'e25', source: 'nodered',      target: 'webasto',      style: { stroke: '#7b1fa2', strokeWidth: 2, strokeDasharray: '5 3' }, label: 'W-Bus' },

  // 36V thruster-krets (separat fra 12V)
  { id: 'e21', source: 'batthruster',  target: 'thruster',     style: { stroke: '#7b1fa2', strokeWidth: 2.5 }, label: '36V DC' },
  { id: 'e22', source: 'thrusterpanel',target: 'thruster',     style: { stroke: '#7b1fa2', strokeWidth: 1.5 }, label: 'kontroll' },
  { id: 'e23', source: 'panel',        target: 'thrusterpanel',style: { stroke: '#8a8a8a', strokeWidth: 1.5 } },
];
