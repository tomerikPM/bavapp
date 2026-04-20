# Summer — Bavaria Sport 32 · FAR999
## Vessel Context for Claude Desktop

---

## Vessel Identification
- **Name:** Summer
- **Model:** Bavaria Sport 32 (2013)
- **Registration:** FAR999
- **Hull ID:** DE-BAVE32A7K213
- **Home port:** Kristiansand, Norway (58.1467°N, 7.9956°E)
- **Length:** 35 ft (10.7 m)
- **Beam:** 3.31 m · **Draft:** 1.05 m · **Displacement:** 6 000 kg
- **Top speed:** ~32 knots · **Cruise:** ~22–25 knots

---

## Crew
- **Tom Erik Thorsen** (male, 46) — owner and skipper
- **Mailinn** (female, 40)
- **Eva** (girl, 14)
- **Erik** (boy, 13)
- **Isak** (boy, 11)
- **Liv** (girl, 9)

---

## Propulsion
- **Engine:** Volvo Penta D6 330 hp (243 kW)
- **Serial:** 21918547 · Chassis: VV 050736
- **EVC PCU:** 21722886 · R1I
- **Drive:** Volvo Penta DP-D 1.76 · S/N 3G20301186
- **Fuel tank:** 370 liters (Mastpol 2013)
- **Tank sender:** Wema S5-E790 · 0–190 Ω

### Fuel consumption (approximate)
| Speed (knots) | Consumption |
|---|---|
| 8 kn (trolling) | ~8 L/h |
| 18 kn | ~28 L/h |
| 22 kn (cruise) | ~35–40 L/h |
| 27 kn | ~55 L/h |
| Full throttle | ~65–70 L/h |

**Range calculation:** Always maintain 50L reserve.
At 22 kn with full tank (370L): usable = 320L → ~176 nm range.

---

## Electrical — 12V DC System
- **House batteries:** 4× Makspower LiFePO4 100Ah 12V = 400Ah total
  - Installed May 2020, Bruenech AS
  - Built-in BMS, 150A per cell
  - Charge voltage: 14.4V
- **Start battery:** Original AGM 60Ah 12V
- **Battery monitor:** Victron SmartShunt 500A (planned → Cerbo GX)
- **Charger:** Victron Blue Smart IP22 30A
- **Battery combiner:** VSR smart relay (alternator to house/start)
- **Alternator:** 115A on Volvo Penta D6
- **Remote switch:** Blue Sea ML-RBS 500A
- **Inverter:** 2900W Pure Sine Wave
- **Shore power:** 230V, 3× B16 ABL Sursum

### Normal ranges (12V)
| Parameter | Normal | Warning | Critical |
|---|---|---|---|
| House SOC | 50–100% | <30% | <20% |
| Voltage (charging) | 13.8–14.4V | <12.4V | <12.0V |
| Voltage (idle) | 13.1–13.3V | — | — |
| Current (typical night) | −5 to −15A | <−30A | <−50A |

---

## Electrical — 36V Thruster System
- **Thruster:** Anchorlift WS60 — 60+ kg thrust, brushless motor
- **Battery:** 36V Lithium dedicated bank
- **Control:** Joystick panel (Art. 92804, double w/on-off)
- **Installed:** 26.05.2022 · Cost: kr 49 172 (Anchorlift Technic)

---

## Lighting
- **Underwater lights:** 2× Piranha P3 SM White, 12V
  - Installed 26.05.2022 (same invoice as thruster)

---

## Navigation & Autopilot
- **Chartplotter (current):** Garmin GPSmap 4010 (to be replaced)
- **Chartplotter (planned):** Garmin GPSMAP 1223xsv + GT15M-IH transducer
- **Autopilot display:** Garmin GHC 20
- **Autopilot ECU:** GHP Compact Reactor · S/N 4P5001717
- **GPS antenna:** Garmin GPS 19x NMEA 2000
- **NMEA 2000 gateway:** VP art. 3838617 (planned)

---

## Communication
- **VHF:** Garmin VHF 200 with DSC
- **MMSI:** ⚠ NOT registered — action required at kystverket.no
- **AIS:** Planned

---

## Comfort & Interior
- **Heater:** Webasto AirTop Evo 3900 Marine (W-Bus protocol)
- **Hot water:** Sigmar Boiler Termoinox
- **Toilet:** Jabsco electric
- **Stereo:** Fusion MS-CD600 + BT100 (A2DP)
- **Berths:** 4–5

---

## Digital Infrastructure
- **Planned computer:** Victron Cerbo GX (Venus OS Large)
- **Planned software:** Signal K + Node-RED
- **Current:** Signal K mock server on development Mac, port 3000
- **App backend:** Node.js + Express, port 3001
- **Remote access:** Tailscale VPN (planned)

### Signal K paths on this vessel
| Path | Description | Unit |
|---|---|---|
| `electrical.batteries.0.capacity.stateOfCharge` | House battery SOC | ratio (0–1) |
| `electrical.batteries.0.voltage` | House battery voltage | V |
| `electrical.batteries.0.current` | House battery current (+ = charging) | A |
| `electrical.batteries.1.*` | Start battery | — |
| `electrical.batteries.2.*` | Thruster battery | — |
| `tanks.fuel.0.currentLevel` | Fuel level | ratio (0–1, × 370 = liters) |
| `propulsion.0.revolutions` | Engine RPM | Hz (× 60 = RPM) |
| `propulsion.0.coolantTemperature` | Coolant temp | K (− 273.15 = °C) |
| `propulsion.0.oilPressure` | Oil pressure | Pa (÷ 100000 = bar) |
| `propulsion.0.fuelRate` | Fuel consumption | m³/s (× 3 600 000 = L/h) |
| `propulsion.0.runTime` | Engine hours | s (÷ 3600 = hours) |
| `navigation.speedOverGround` | Speed over ground | m/s (× 1.944 = knots) |
| `environment.water.temperature` | Sea temperature | K (− 273.15 = °C) |
| `environment.water.depth` | Depth under keel | m |
| `environment.wind.speedApparent` | Apparent wind | m/s |
| `electrical.ac.shore.available` | Shore power connected | boolean |

### Unit conversions (Signal K uses SI units)
- **Temperature:** K − 273.15 = °C
- **Speed:** m/s × 1.94384 = knots
- **Pressure:** Pa ÷ 100000 = bar
- **Fuel rate:** m³/s × 3 600 000 = L/h
- **RPM:** Hz × 60 = RPM
- **Distance:** m ÷ 1852 = nautical miles
- **Time:** seconds ÷ 3600 = hours

---

## Open Maintenance Tasks (as of 2026)
1. **[CRITICAL]** Gas system re-certification — certificate expired 25.10.2012. Required every 2 years.
2. **[HIGH]** VHF MMSI registration — not registered. Go to kystverket.no (free, required for DSC).
3. **[HIGH]** Document EPIRB/PLB serial number at 406mhz.no
4. **[MEDIUM]** Install Garmin GPSMAP 1223xsv
5. **[MEDIUM]** Install Victron Cerbo GX

---

## How to Answer Questions About This Vessel
- Always respond in Norwegian (norsk) unless asked otherwise
- Use nautical terminology
- When calculating range: deduct 50L reserve from fuel
- Temperature: display in °C (convert from K)
- Speed: display in knots
- Depth: display in meters
- Wind: display in m/s or convert to Beaufort scale
- Distance: display in nautical miles (nm)
- Timezone: Norway (CET/CEST, UTC+1/+2)
