### Frontend-konvensjoner
- Hver side i `frontend/js/pages/` eksporterer `render(container)` og valgfritt `onSkUpdate(state)`
- CSS er inline i sidens render-funksjon for isolasjon
- Ingen build-step på frontend — ES modules lastes direkte
- Chart.js lastes lazy via CDN første gang det trengs

### Backend-konvensjoner
- Ruter i `backend/routes/<navn>.js`, registreres i `server.js`
- SQLite-migrasjoner gjøres inline med `PRAGMA table_info` + `ALTER TABLE` ved oppstart
- Eksterne APIer caches i egne tabeller med TTL (se `fuel.js` som referanseeksempel)

### Visuell stil
- Barlow Condensed for headers/labels, DM Mono for tall og tekniske verdier
- Farger: `--blue` #003b7e, `--red` #b01020, `--ok` #1a7040, `--warn` #b86000, `--danger` #b01020
- Ingen unødvendig dekor — maritim, redaksjonell, clean

## Maskinvare

### Båtspesifikasjoner
- Bavaria Sport 32 (2013), "Summer", 35 ft, reg. FAR999, hjemmehavn Kristiansand
- Hull ID DE-BAVE32A7K213, 6000 kg, 32 kn, 4–5 køyeplasser, ~1085 motortimer ved kjøp

### Fremdrift
- Volvo Penta D6 330 hk (243 kW), S/N 21918547, Chassis VV 050736, EVC PCU 21722886 R1I
- Drev: Volvo Penta DP-D 1.76, S/N 3G20301186
- Dieseltank: 370 L (Mastpol 2013), Wema S5-E790 giver (0–190 Ω)
- **Planlagt:** Volvo Penta NMEA 2000 gateway (art. 3838617)

### Elektrisk (installert)
- **Husbank: 8× Makspower LiFePO4 100Ah 12V = 800Ah**, to bokser à 4 stk, mai 2020 av Bruenech AS
- BMS innebygd 150A per celle, ladespenning 14,4 V
- Monitorering: Victron SmartShunt 500A **og** BMV-712 Smart (begge VE.Direct)
- Ladere: Victron Blue Smart IP22 12/30 (Li-ION-modus) + Cristec (modell ikke bekreftet)
- Ladeseparator Quick ECS1, fjernbryter Blue Sea ML-RBS 500A
- 2900W pure sine inverter, 230V landstrøm med 3× B16 ABL Sursum

### Navigasjon (installert)
- Garmin GPSMAP 1223xsv + GT15M-IH svinger (v43.02)
- Autopilot: Garmin GHP Reactor (Compact 1.0L pump + Impact Reactor ECU S/N 4P5001717 + GHC20)
- GPS-antenne: Garmin GPS 19x NMEA 2000
- Yacht Devices YDEG-04N engine gateway (kjøpt, ikke installert)

### Oppvarming (installert)
- Webasto AirTop Evo 3900 Marine med W-Bus (K-line) / MC04/05-panel
- JDTech FTDI USB-to-KKL kabel (FT232RL chip) — kjøpt, ikke integrert

### Planlagt / ikke installert
- **Victron Cerbo GX MK2** — kjøpt, ikke montert. Nøkkelkomponent som låser opp Signal K live-data fra N2K, autopilot-status, Garmin plotter-navigasjon via Signal K course API (PGN 129284), Webasto W-Bus Node-RED flows, og VE.CAN-integrasjon.
- Cloudflare Tunnel (erstatter ngrok)
- Kystverket fartsgrense-integrasjon (WMS layer_754)
- Bow thruster status via Cerbo GX digital inputs

## Viktig lærdom og gotchas

- **Node.js v24 brekker `better-sqlite3`** — bruk v20
- **pumpepriser.no**: Framework7 SPA — HTML-skraping virker ikke. JSON via `/database/pumpepriser.php` (liste) og `/database/stasjonsdata.php?id=X` (historikk per stasjon). Hovedlisten har INGEN tidsstempler — bekreftelsesdato hentes per stasjon.
- **Signal K → Garmin chartplotter**: 1223xsv har IKKE TCP/IP-mottaker for waypoints. Må gå via Cerbo GX VE.CAN → N2K.
- **SQLite-migrasjoner** må være idempotente (`CREATE TABLE IF NOT EXISTS`, sjekk `PRAGMA table_info` før `ALTER TABLE`)
- **W-Bus krever genuine FTDI FT232RL chip** for pålitelig 2400 baud 8E1 på Venus OS
- **LiFePO4-lading**: 800Ah-banken bør lades med minst 30A (helst mer via Cristec)

## Åpne tråder (prioritert)

1. **Cloudflare Tunnel** — erstatt ngrok for stabil remote URL
2. **Cerbo GX-installasjon** — låser opp halvparten av planlagt funksjonalitet
3. **Webasto W-Bus Node-RED flows** — samtidig med Cerbo GX
4. **Kystverket fartsgrense-integrasjon** (WMS layer_754)
5. **Bekreft Cristec-lader-modell** — bilde av typeskilt
6. **Verifiser SmartShunt/BMV-712 bank-plassering** (hus vs. start)

## Eksterne ressurser

- Signal K: https://signalk.org/specification/
- pumpepriser.no JSON: https://www.pumpepriser.no/database/pumpepriser.php
- MET Norway: https://api.met.no/weatherapi/locationforecast/2.0/documentation
- Kystverket WMS: https://services.kystverket.no/wms.ashx?service=WMS&request=GetCapabilities