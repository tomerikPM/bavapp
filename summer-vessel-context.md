# Summer — Bavaria Sport 32, FAR999
## Vessel Context for Signal K MCP

### Identification
- Name: Summer
- Registration: FAR999
- Model: Bavaria Sport 32 (2013)
- Hull ID: DE-BAVE32A7K213
- Home port: Kristiansand, Norway (58.15°N, 7.99°E)

### Crew
- Tom Erik Thorsen, male, 46 — owner/skipper
- Mailinn, female, 40
- Eva, girl, 14
- Erik, boy, 13
- Isak, boy, 11
- Liv, girl, 9

### Propulsion
- Engine: Volvo Penta D6 330 hp (243 kW)
- Drive: Volvo Penta DP-D 1.76
- Fuel tank: 370 litres
- Fuel consumption: ~35–40 L/h at 22 knots, ~55–65 L/h at full throttle
- Top speed: ~32 knots, cruising 22–25 knots
- Engine hours (approx): 1 085 h

### Electrical
- House batteries: 4× LiFePO4 100Ah 12V = 400Ah total
- Start battery: AGM 60Ah 12V
- Thruster battery: 36V Lithium (dedicated)
- Charger: Victron Blue Smart IP22 30A
- Monitor: Victron SmartShunt 500A (planned: Cerbo GX)

### Signal K path mappings
- Battery SOC: electrical.batteries.0.capacity.stateOfCharge (0–1 ratio → multiply by 100 for %)
- Battery voltage: electrical.batteries.0.voltage (Volts)
- Battery current: electrical.batteries.0.current (Amps, negative = discharging)
- Fuel level: tanks.fuel.0.currentLevel (0–1 ratio → multiply by 370 for litres)
- Engine RPM: propulsion.0.revolutions (Hz → multiply by 60 for RPM)
- Coolant temp: propulsion.0.coolantTemperature (Kelvin → subtract 273.15 for °C)
- Oil pressure: propulsion.0.oilPressure (Pascal → divide by 100000 for bar)
- Engine hours: propulsion.0.runTime (seconds → divide by 3600 for hours)
- Fuel rate: propulsion.0.fuelRate (m³/s → multiply by 3 600 000 for L/h)
- Speed over ground: navigation.speedOverGround (m/s → multiply by 1.944 for knots)
- Water temp: environment.water.temperature (Kelvin → subtract 273.15 for °C)
- Water depth: environment.water.depth (metres, under keel)
- Wind speed: environment.wind.speedApparent (m/s → multiply by 1.944 for knots)
- Shore power: electrical.ac.shore.available (boolean)
- Bilge: environment.bilge.0.floodDetected (boolean)

### Normal operating ranges
- Battery SOC: >50% comfortable, 30–50% recharge soon, <30% urgent
- Battery voltage at rest: 13.2–13.4V = full, 12.8V = 50%, 12.0V = nearly empty
- Coolant temperature: 70–87°C normal, >90°C warning, >95°C critical
- Oil pressure: 2.5–4.5 bar at operating RPM
- Fuel reserve: always keep minimum 50L (≈13% of tank) as reserve

### Range calculation
Available fuel = current litres − 50L reserve
- At 22 knots: ~38 L/h → available L ÷ 38 × 22 = range in nm
- At 20 knots: ~28 L/h → available L ÷ 28 × 20 = range in nm

### Unit preferences
- Temperature: Celsius (°C)
- Speed: knots
- Distance: nautical miles (nm)
- Depth: metres
- Fuel: litres
- Timezone: Europe/Oslo (CET/CEST, UTC+1/+2)

### Installed equipment (relevant for Signal K)
- Anchorlift WS60 stern thruster, 36V, installed 26.05.2022
- Piranha P3 SM White underwater lights (2×), 12V
- Webasto AirTop Evo 3900 cabin heater, W-Bus 2
- Garmin VHF 200 with DSC
- Standard Horizon GX2200 VHF with AIS
- Garmin GHP Compact Reactor autopilot
- Garmin GPS 19x NMEA 2000 antenna

### BavApp — custom monitoring app
A custom PWA (Progressive Web App) runs on iPad in the cockpit showing live Signal K data,
trip logs, cost tracking, AI assistant, and maintenance records.
Backend: Node.js + Express + SQLite on localhost:3001
Signal K mock server: localhost:3000 (development)
