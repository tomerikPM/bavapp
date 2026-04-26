'use strict';

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

const state = {
  lat: 58.1467, lon: 7.9956,
  sog: 0, cog: 0, heading: 189,
  engineRunning: false, rpm: 0,
  coolantTemp: 288,       // K
  oilPressure: 0,         // Pa
  oilTemp: 288,           // K
  boostPressure: 0,       // Pa (gauge)
  engineLoad: 0,          // ratio 0-1
  fuelRate: 0,            // m³/s
  engineHours: 1085.4,
  gear: 'neutral',
  alternatorVoltage: 0,   // V

  houseSoc: 0.72, houseVoltage: 13.1, houseCurrent: -4.2, houseTemp: 295,
  startSoc: 0.95, startVoltage: 12.6,
  shorepower: false, inverterActive: false,
  fuelLevel: 0.68,
  thrusterSoc: 0.88, thrusterVoltage: 38.2,
  windSpeed: 4.2, windDir: 220,
  waterTemp: 287,
  waterDepth: 12.4,
  bilgePumpActive: false,

  // Webasto AirTop Evo 3900
  webastoState:       'off',      // off | starting | running | cooling | ventilation | fault
  webastoSetTemp:     20,         // °C
  webastoCurrentTemp: null,       // °C (kabin)
  webastoVoltage:     0,          // V
  webastoRuntime:     0,          // sekunder
  webastoFault:       false,
  webastoFaultCode:   null,
  _webastoStartTick:  null,

  // Alarm-simuleringsflagg
  oilPressureDip:  false,  // tick 600–680 mens motor kjører
  maintenanceDue:  false,  // tick 4500–5500
  altFault:        false,  // tick 200–260 — dynamo ennå ikke ladet opp

  _tick: 0, _engineStartTick: 0, _lastGpsBearing: 45,
  _todayMaxRpm: 0, _todayMaxLoad: 0, _todayMaxCoolant: 0,
};

// Tidspunkt for når en alarmkode først ble aktiv (for 'since'-feltet)
const _alarmSince = {};

// ── Beregn aktive alarmer fra nåværende state ─────────────────────────────────
function computeAlarms() {
  const alarms = [];
  const now    = new Date().toISOString();
  const coolC  = state.coolantTemp - 273.15;
  const oilBar = state.oilPressure / 100000;
  const boostKpa = state.boostPressure / 1000;

  function add(code, severity, message, source = 'EVC') {
    if (!_alarmSince[code]) _alarmSince[code] = now;
    alarms.push({ code, severity, message, source, since: _alarmSince[code] });
  }

  if (state.engineRunning) {
    // Kjølevann
    if (coolC >= 95) {
      add('E001', 'emergency', `Kjølevann kritisk høy — ${Math.round(coolC)}°C · Stopp motor`);
    } else if (coolC >= 90) {
      add('E002', 'warning', `Kjølevann over normalområde — ${Math.round(coolC)}°C`);
    }

    // Oljetrykk
    if (state.oilPressureDip && oilBar > 0) {
      if (oilBar < 1.0) {
        add('E003', 'emergency', `Kritisk lavt oljetrykk — ${oilBar.toFixed(1)} bar`);
      } else {
        add('E004', 'warning', `Lavt oljetrykk — ${oilBar.toFixed(1)} bar`);
      }
    }

    // Alternator
    if (state.altFault && state.alternatorVoltage < 13.5 && state.alternatorVoltage > 1) {
      add('E005', 'warning', `Dynamo lader ikke normalt — ${state.alternatorVoltage.toFixed(1)} V`);
    }

    // Boost
    if (boostKpa > 150) {
      add('E006', 'warning', `Høyt ladetrykk — ${Math.round(boostKpa)} kPa`);
    }

    // Turtall nær grense
    if (state.rpm > 3300) {
      add('E007', 'warning', `Turtall nær maksnivå — ${state.rpm.toLocaleString()} RPM`);
    }
  }

  // Servicemelding (uavhengig av motor)
  if (state.maintenanceDue) {
    add('E008', 'info', 'Serviceintervall nådd — sjekk vedlikeholdslogg', 'EVC');
  }

  // Ryd opp tidsstempler for alarmer som ikke lenger er aktive
  const activeCodes = new Set(alarms.map(a => a.code));
  for (const code of Object.keys(_alarmSince)) {
    if (!activeCodes.has(code)) delete _alarmSince[code];
  }

  return alarms;
}

setInterval(() => {
  state._tick++;
  const t = state._tick;
  const cyclePos = t % 7200;

  // ── Motor ─────────────────────────────────────────────────────────────────
  if (cyclePos === 100)  { state.engineRunning = true;  state._engineStartTick = t; console.log('[mock] Engine started'); }
  if (cyclePos === 1300) { state.engineRunning = false; state.gear = 'neutral';    console.log('[mock] Engine stopped'); }

  if (state.engineRunning) {
    const warmup = Math.min(1, (t - state._engineStartTick) / 180);

    state.rpm = Math.round(800 + warmup * (2600 + Math.sin(t / 120) * 200 - 800) + (Math.random() - 0.5) * 40);

    if (cyclePos >= 800 && cyclePos <= 850) {
      state.coolantTemp = 273.15 + 92 + (cyclePos - 800) * 0.06 + Math.random();
    } else {
      state.coolantTemp = 288 + warmup * (87 - 15) + Math.random() * 2;
    }

    const coolantC = state.coolantTemp - 273.15;
    state.oilTemp  = 273.15 + coolantC * 0.95 + 8 + Math.random() * 2;

    // Oljetrykk — simulert dip tick 600–680: faller til ~1.2 bar
    if (cyclePos >= 600 && cyclePos <= 680) {
      const dipDepth = Math.sin(((cyclePos - 600) / 80) * Math.PI);
      state.oilPressure = (2.5 - dipDepth * 1.4 + (Math.random() - 0.5) * 0.1) * 100000;
      state.oilPressureDip = true;
    } else {
      const targetOilBar = 2.5 + warmup * 3.0 + (state.rpm / 3000) * 0.8;
      state.oilPressure  = (targetOilBar + (Math.random() - 0.5) * 0.2) * 100000;
      state.oilPressureDip = false;
    }

    state.engineLoad    = Math.max(0.10, Math.min(0.95, 0.15 + warmup * 0.50 + (Math.random() - 0.5) * 0.03));
    state.boostPressure = Math.max(0, (warmup * 110 * state.engineLoad + (Math.random() - 0.5) * 5) * 1000);
    state.fuelRate      = Math.max(0.5, 3 + warmup * 25 * state.engineLoad + (Math.random() - 0.5) * 1.5) / 3600000;

    if (warmup > 0.4 && cyclePos > 200) state.gear = 'forward';

    state.engineHours += 1 / 3600;
    state.fuelLevel = Math.max(0, state.fuelLevel - state.fuelRate * 3600 / 370000);

    // Alternator-feil: tick 200–260 (ennå ikke ladet opp etter oppstart)
    state.altFault = cyclePos >= 200 && cyclePos <= 260;
    if (warmup > 0.3 && !state.altFault) {
      state.alternatorVoltage = 14.2 + Math.random() * 0.2;
      state.houseCurrent      = +16 + Math.random() * 4;
      state.houseSoc          = Math.min(0.98, state.houseSoc + 0.00005);
    } else {
      state.alternatorVoltage = state.houseVoltage;
    }

    state.sog = warmup > 0.4 ? 3.5 + Math.random() * 0.5 : 0;
    state.lat += Math.sin(state.cog * Math.PI / 180) * 0.000005;
    state.lon += Math.cos(state.cog * Math.PI / 180) * 0.000008;

    if (state.rpm > state._todayMaxRpm)         state._todayMaxRpm     = state.rpm;
    if (state.engineLoad > state._todayMaxLoad)  state._todayMaxLoad    = state.engineLoad;
    if (coolantC > state._todayMaxCoolant)       state._todayMaxCoolant = coolantC;

  } else {
    state.rpm = 0; state.oilPressure = 0; state.engineLoad = 0;
    state.boostPressure = 0; state.fuelRate = 0; state.gear = 'neutral';
    state.alternatorVoltage = 0; state.oilPressureDip = false; state.altFault = false;
    state.coolantTemp = Math.max(288, state.coolantTemp - 0.05);
    state.oilTemp     = Math.max(288, state.oilTemp - 0.04);
    state.sog         = 0;

    state.shorepower = cyclePos > 2000 && cyclePos < 5000;
    if (state.shorepower) {
      state.houseCurrent = +12 + Math.random() * 3;
      state.houseSoc     = Math.min(0.98, state.houseSoc + 0.00003);
    } else {
      state.houseCurrent = -(3.5 + Math.random() * 1.5);
      state.houseSoc     = Math.max(0.10, state.houseSoc - 0.000015);
    }
  }

  // Servicemelding aktiv tick 4500–5500
  state.maintenanceDue = cyclePos >= 4500 && cyclePos < 5500;

  state.houseVoltage   = 11.5 + state.houseSoc * 2.5 + (state.houseCurrent > 0 ? 0.3 : 0);
  state.startVoltage   = 11.8 + state.startSoc * 1.2;
  state.inverterActive = !state.shorepower && !state.engineRunning && state.houseSoc > 0.40;
  state.windSpeed      = Math.max(0, state.windSpeed + (Math.random() - 0.5) * 0.1);
  state.windDir        = (state.windDir + (Math.random() - 0.5) * 2 + 360) % 360;
  state.waterTemp      = Math.max(283, Math.min(295, state.waterTemp + (Math.random() - 0.5) * 0.002));
  state.waterDepth     = Math.max(3, Math.min(40, state.waterDepth + (Math.random() - 0.5) * 0.1));

  if (state.fuelLevel < 0.20 && Math.random() < 0.0001) { state.fuelLevel = 0.95; console.log('[mock] Tank refilled'); }

  const wasBilge = state.bilgePumpActive;
  state.bilgePumpActive = cyclePos >= 3600 && cyclePos < 3630;
  if (state.bilgePumpActive && !wasBilge) console.log('[mock] Bilge pump activated');
  if (!state.bilgePumpActive && wasBilge)  console.log('[mock] Bilge pump stopped');

  // ── Webasto simulering ──────────────────────────────────────────────────
  // Auto-syklus: starter tick 5200, stopper tick 6500
  if (cyclePos === 5200 && state.webastoState === 'off') {
    state.webastoState = 'starting'; state._webastoStartTick = t;
    state.webastoVoltage = state.houseVoltage;
    console.log('[mock] Webasto starting');
  }
  if (cyclePos === 6500 && state.webastoState === 'running') {
    state.webastoState = 'cooling'; console.log('[mock] Webasto cooling down');
  }
  if (state.webastoState === 'starting') {
    const elapsed = t - (state._webastoStartTick ?? t);
    if (elapsed >= 30) {
      state.webastoState = 'running';
      state.webastoCurrentTemp = 8;
      console.log('[mock] Webasto running');
    }
  }
  if (state.webastoState === 'running') {
    state.webastoRuntime = (t - (state._webastoStartTick ?? t) - 30);
    state.webastoCurrentTemp = Math.min(
      state.webastoSetTemp,
      (state.webastoCurrentTemp ?? 8) + 0.15 + Math.random() * 0.05
    );
    state.webastoVoltage = state.houseVoltage - 0.3 + Math.random() * 0.1; // forbruk ~25W
  }
  if (state.webastoState === 'cooling') {
    state.webastoCurrentTemp = Math.max(null, (state.webastoCurrentTemp ?? 20) - 0.2);
    if ((state.webastoCurrentTemp ?? 0) <= (state.webastoCurrentTemp ?? 0) - 5 || cyclePos >= 6560) {
      state.webastoState = 'off'; state.webastoRuntime = 0;
      state.webastoVoltage = 0; state.webastoCurrentTemp = null;
    }
  }

  broadcastDelta();
}, 1000);

// ── REST ──────────────────────────────────────────────────────────────────────
function buildVesselTree() {
  return {
    uuid: 'urn:mrn:imo:mmsi:257000000',
    name: 'Bavaria Sport 32',
    mmsi: '257000000',
    registrations: { official: { country: 'NO', registerId: 'FAR999' } },
    navigation: {
      position:             { value: { latitude: state.lat, longitude: state.lon } },
      speedOverGround:      { value: state.sog },
      courseOverGroundTrue: { value: state.cog * Math.PI / 180 },
      headingTrue:          { value: state.heading * Math.PI / 180 },
      datetime:             { value: new Date().toISOString() },
    },
    propulsion: {
      port: {
        state:              { value: state.engineRunning ? 'started' : 'stopped' },
        revolutions:        { value: state.rpm / 60 },
        temperature:        { value: state.coolantTemp },
        oilTemperature:     { value: state.oilTemp },
        oilPressure:        { value: state.oilPressure },
        engineLoad:         { value: state.engineLoad },
        boostPressure:      { value: state.boostPressure },
        fuel:               { rate: { value: state.fuelRate } },
        runTime:            { value: state.engineHours * 3600 },
        alarms:             { value: computeAlarms() },
        alternatorVoltage:  { value: state.alternatorVoltage },
        transmission: {
          gear:             { value: state.gear },
          oilTemperature:   { value: state.oilTemp - 5 },
        },
      },
    },
    electrical: {
      batteries: {
        '279': {
          name: 'House Bank',
          capacity: {
            stateOfCharge: { value: state.houseSoc },
            timeRemaining: { value: state.houseCurrent < 0 ? (state.houseSoc * 400 * 3600) / Math.abs(state.houseCurrent) : null },
          },
          voltage:     { value: state.houseVoltage },
          current:     { value: state.houseCurrent },
          power:       { value: state.houseVoltage * state.houseCurrent },
          temperature: { value: state.houseTemp },
        },
        '0': { name: 'Starter Battery', voltage: { value: state.startVoltage } },
      },
      alternators: { '0': { voltage: { value: state.alternatorVoltage } } },
      ac:          { shore: { available: { value: state.shorepower } } },
      inverter:    { '0': { state: { value: state.inverterActive ? 'on' : 'off' } } },
      switches:    { bilgePump: { state: { value: state.bilgePumpActive ? 'on' : 'off' } } },
    },
    tanks: {
      fuel: { '0': { currentLevel: { value: state.fuelLevel }, currentVolume: { value: state.fuelLevel * 370 }, capacity: { value: 370 } } },
    },
    environment: {
    wind:  { speedApparent: { value: state.windSpeed }, angleApparent: { value: state.windDir * Math.PI / 180 } },
    water: { temperature: { value: state.waterTemp } },
      depth: { belowTransducer: { value: state.waterDepth } },
      heating: { '0': {
          state:              { value: state.webastoState },
          setTemperature:     { value: state.webastoSetTemp + 273.15 },
          currentTemperature: { value: state.webastoCurrentTemp != null ? state.webastoCurrentTemp + 273.15 : null },
          operatingVoltage:   { value: state.webastoVoltage },
          runtime:            { value: state.webastoRuntime },
          fault:              { value: state.webastoFault },
          faultCode:          { value: state.webastoFaultCode },
        }},
      },
  };
}

app.get('/signalk', (req, res) => {
  res.json({ endpoints: { v1: { version: '1.7.0', 'signalk-http': `http://localhost:${PORT}/signalk/v1/api/`, 'signalk-ws': `ws://localhost:${PORT}/signalk/v1/stream` } }, server: { id: 'bavaria32-mock', version: '1.0.0' } });
});
app.get('/signalk/v1/api/vessels/self', (req, res) => { res.json(buildVesselTree()); });

// PUT — ta imot Webasto-kommandoer fra backend
app.put('/signalk/v1/api/vessels/self/environment/heating/0/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  const map = {
    state:              () => { state.webastoState = value; console.log(`[mock] Webasto state → ${value}`); },
    setTemperature:     () => { state.webastoSetTemp = Math.round(value - 273.15); },
    fault:              () => { state.webastoFault = value; },
  };
  if (map[key]) { map[key](); res.json({ state: 'COMPLETED', statusCode: 200 }); }
  else res.status(404).json({ error: `Ukjent path: ${key}` });
});
app.get('/signalk/v1/api/vessels/self/*', (req, res) => {
  const pathParts = req.params[0].split('/').filter(Boolean);
  let node = buildVesselTree();
  for (const part of pathParts) {
    if (node && typeof node === 'object' && part in node) node = node[part];
    else return res.status(404).json({ error: `Path not found: ${req.params[0]}` });
  }
  res.json(node);
});
app.get('/signalk/v1/api/vessels', (req, res) => { res.json({ self: buildVesselTree() }); });

// ── WebSocket ─────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/signalk/v1/stream' });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[mock] WS client connected, total:', clients.size);
  ws.send(JSON.stringify({ name: 'Bavaria Sport 32 Mock', version: '1.7.0', timestamp: new Date().toISOString(), self: 'vessels.self' }));
  ws.on('close', () => { clients.delete(ws); });
});

function broadcastDelta() {
  if (clients.size === 0) return;
  const delta = {
    context: 'vessels.self',
    updates: [{ timestamp: new Date().toISOString(), source: { label: 'mock', type: 'simulation' },
      values: [
        { path: 'navigation.position',                           value: { latitude: state.lat, longitude: state.lon } },
        { path: 'navigation.speedOverGround',                    value: state.sog },
        { path: 'propulsion.port.revolutions',                   value: state.rpm / 60 },
        { path: 'propulsion.port.temperature',                   value: state.coolantTemp },
        { path: 'propulsion.port.oilTemperature',                value: state.oilTemp },
        { path: 'propulsion.port.oilPressure',                   value: state.oilPressure },
        { path: 'propulsion.port.engineLoad',                    value: state.engineLoad },
        { path: 'propulsion.port.boostPressure',                 value: state.boostPressure },
        { path: 'propulsion.port.fuel.rate',                     value: state.fuelRate },
        { path: 'propulsion.port.transmission.gear',             value: state.gear },
        { path: 'propulsion.port.runTime',                       value: state.engineHours * 3600 },
        { path: 'propulsion.port.alarms',                        value: computeAlarms() },
        { path: 'propulsion.port.alternatorVoltage',             value: state.alternatorVoltage },
        { path: 'electrical.batteries.279.capacity.stateOfCharge', value: state.houseSoc },
        { path: 'electrical.batteries.279.voltage',                value: state.houseVoltage },
        { path: 'electrical.batteries.279.current',                value: state.houseCurrent },
        { path: 'electrical.batteries.279.power',                  value: state.houseVoltage * state.houseCurrent },
        { path: 'electrical.batteries.0.voltage',                  value: state.startVoltage },
        { path: 'electrical.ac.shore.available',                 value: state.shorepower },
        { path: 'electrical.switches.bilgePump.state',           value: state.bilgePumpActive ? 'on' : 'off' },
        { path: 'tanks.fuel.0.currentLevel',                     value: state.fuelLevel },
        { path: 'environment.wind.speedApparent',                value: state.windSpeed },
        { path: 'environment.water.temperature',                 value: state.waterTemp },
        { path: 'environment.depth.belowTransducer',             value: state.waterDepth },
      ],
    }],
  };
  const msg = JSON.stringify(delta);
  for (const ws of clients) { if (ws.readyState === 1) ws.send(msg); }
}

server.listen(PORT, () => {
  console.log('\n🔌  Signal K Mock Server — Bavaria Sport 32');
  console.log(`   REST:  http://localhost:${PORT}/signalk/v1/api/vessels/self`);
  console.log(`   WS:    ws://localhost:${PORT}/signalk/v1/stream\n`);
  console.log('   Testsyklus (7200 sek):');
  console.log('     tick  100 — Motor starter');
  console.log('     tick  200 — E005 Dynamo-alarm (60 sek)');
  console.log('     tick  600 — E004 Oljetrykk-advarsel (80 sek)');
  console.log('     tick  800 — E002 Kjølevann-advarsel (50 sek)');
  console.log('     tick 1300 — Motor stopper · alle motor-alarmer fjernes');
  console.log('     tick 2000 — Landstrøm tilkobles');
  console.log('     tick 3600 — Bilgepumpe aktiv (30 sek)');
  console.log('     tick 4500 — E008 Servicemelding (1000 sek)');
  console.log('     tick 5000 — Landstrøm frakobles\n');
});
