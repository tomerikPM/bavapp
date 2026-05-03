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

### Elektrisk (installert)
- **Husbank: 8× Makspower LiFePO4 100Ah 12V = 800Ah**, to bokser à 4 stk, mai 2020 av Bruenech AS
- BMS innebygd 150A per celle, ladespenning 14,4 V
- Monitorering: Victron BMV-712 Smart (VE.Direct til Cerbo) med SmartShunt 500A som strømsensor. BMV-712 aux-input måler starter-spenning.
- Ladere: Victron Blue Smart IP22 12|30 (3) — A325, S/N HQ191028ZDN, fw v3.21, BLE MAC FB:89:51:11:3B:66, Bluetooth-only (ingen VE.Direct-port), Li-ION-modus + Cristec (modell ikke bekreftet, sannsynligvis ute av drift — IP22-syklushistorikk viser at den er den aktive laderen)
- Ladeseparator Quick ECS1, fjernbryter Blue Sea ML-RBS 500A
- 2900W pure sine inverter, 230V landstrøm med 3× B16 ABL Sursum

### Navigasjon (installert)
- Plotter: **Garmin GPSMAP 1223xsv** (installert april 2026) — N2K src=6, sender PGN 128267 (dybde) og 129284 (navigation data)
- Autopilot: Garmin GHP Reactor (Compact 1.0L pump + Impact Reactor ECU S/N 4P5001717 + GHC20 display + GRA10 fjernkontroll)
- GPS-antenne: Garmin GPS 19x NMEA 2000 (N2K src=1)
- VHF: **Garmin VHF 200i** — Class D DSC, NMEA 2000 (N2K src=3, productCode 20682). Ingen AIS-mottaker. Sender kun housekeeping-PGN-er i hvile; DSC-trafikk (129808) bare ved aktive kall.
- Yacht Devices YDEG-04N engine gateway — installert, leverer N2K til Cerbo (N2K src=56)

### Oppvarming (installert)
- Webasto AirTop Evo 3900 Marine med W-Bus (K-line) / MC04/05-panel
- JDTech FTDI USB-to-KKL kabel (FT232RL chip) — kjøpt, ikke integrert

### Cerbo GX MK2 (installert april 2026, firmware v3.72 Large)
- Signal K v2.19.1 lytter på port 3000, åpen lokalt (ingen auth)
- VE.Direct-port ttyS7: **BMV-712 Smart** → `electrical.batteries.279.*` (full datasett: SOC, voltage, current, power). `electrical.batteries.279-second.voltage` er BMV-712 aux-inngang (sannsynligvis starter-spenning).
- N2K via YDEG-04N: starterbatteri-spenning → `electrical.batteries.0.voltage`
- N2K via YDEG-04N: motor-data → `propulsion.port.*` (NB: ikke `propulsion.0.*`, og kjølevæsketemp er `temperature` ikke `coolantTemperature`; fuel rate er `fuel.rate` i m³/s)
- N2K via YDEG-04N: dieseltank fra Wema-sender → `tanks.fuel.0.currentLevel`
- N2K via ny plotter/svinger: dybde → `environment.depth.belowTransducer` (PGN 128267)
- **YDEG-04N konfigurasjon ikke lett tilgjengelig** — fysisk plassering vanskeliggjør USB-tilkobling for å aktivere flere PGN-er (f.eks. sjøtemp via 130316). Hvis ny PGN trengs: monter separat sensor istedenfor å åpne YDEG.
- SmartShunt 500A er strømsensor for BMV-712 (ikke en selvstendig enhet på Cerbo). All husbank-data går gjennom BMV-712 til Cerbo.
- Shore power: ingen direkte deteksjon. **Inferens i `signalk.js` og `eventWatcher.js`**: husbank-strøm med dødbånd ±0.5A og sticky verdi (motor av): `cur > 0.5A` → on, `cur < -0.5A` → off, `|cur| ≤ 0.5A` → behold forrige. Volt-regelen er fjernet (LiFePO4 hviler 13.3–13.5V ved full SOC, ubrukelig). Akseptert begrensning: under float (charger holder bank på ~0A) sitter status fast på siste decisive verdi — riktig hvis vi koblet til der, feil hvis vi koblet ut da bank var full. Endelig løsning er fortsatt 230V-relé på GX digital input.
- **Cerbo BLE-veien til IP22 er undersøkt og forkastet** (mai 2026): `dbus-ble-sensors` v0.28 har full støtte for IP22 12|30 (3) i kompilert kode, men IP22 fra 2019 (HQ19xxxxx, før HQ2024+ "VE.Smart Network enabled"-cutoff) broadcaster bare produkt-ID (`E1 02 10 00 25 A3`) + service-UUID `cd54a325-880b-425b-b167-81ed6a15e913`, ikke kryptert Instant Readout-state. Lade-state må hentes via aktiv GATT-tilkobling, som dbus-ble-sensors ikke gjør. BMV-712 Smart (BLE MAC FB:D2:DB:4C:43:F0) broadcaster derimot full Instant Readout — men vi får alt via VE.Direct allerede. Cerbo-Bluetooth-menyen i UI-en (Settings → Connectivity → Bluetooth) er kun *VictronConnect-server*, ikke BLE-klient.
- Nettverk: **Teltonika RUT200** wifi-ruter (SSID "Summer"), Cerbo IP `192.168.1.237`, ruter `192.168.1.1`
- **RUT200 RutOS 7.x bruker REST-API på `/api`, IKKE legacy `/ubus` JSON-RPC** — uhttpd er konfigurert med `-l /api -L /www/cgi-bin/api_dispatcher.lua`. Selv om `JSON-RPC support`-pakken er installert eksponerer ikke uhttpd `/ubus`-endepunktet. Auth: `POST /api/login {username,password}` → Bearer-token (utløper etter ~5 min). Brukes i `backend/routes/router.js`. Krever `ROUTER_TLS=1` (HTTP-redirect til HTTPS uten body). Standard kalleliste: `/api/system/device/status` (board-info, ikke uptime), `/api/interfaces/status` (alle interfaces), `/api/modems/status` (SIM/signal), `/api/wireless/interfaces/status` (SSID). Uptime henter vi fra LAN-interface som proxy.
- **iPhone Personal Hotspot-deteksjon**: når RUT200 er klient mot iPhonen, dukker den aktive uplinken opp som interface `wan1` på `wlan0-2` med proto `dhcp` og IP fra `172.20.10.0/28`-subnettet (Apples faste hotspot-subnet).

### Cloudflare Tunnel (installert april 2026)
- `cloudflared` ARM-binær under `/data/cloudflared/`, daemontools-service `/service/cloudflared`, persistens via `/data/rcS.local`
- Token i `/data/cloudflared/.env` (TUNNEL_TOKEN). Tunnel-ID: `9d1da5f5-2b36-416f-979b-b05f78a36281`, navn `cerbo`
- Public hostname: `bavapp.summermylife.no` → `HTTP localhost:3001`
- Setup-script: `setup-cloudflared.sh` (krever `cloudflared-token.txt` i repo-roten, gitignored)
- **Erstatter ngrok og Tailscale Funnel** — Tailscale fjernet helt fra Cerbo april 2026

### Planlagt / ikke installert
- SSH-via-Cloudflare-tunnel som backup (legg til public hostname `ssh.summermylife.no` → `SSH localhost:22`, bruk `cloudflared access ssh` lokalt)
- Kystverket fartsgrense-integrasjon (WMS layer_754)
- Bow thruster status via Cerbo GX digital inputs

## Viktig lærdom og gotchas

- **Node.js v24 brekker `better-sqlite3`** — bruk v20
- **pumpepriser.no**: Framework7 SPA — HTML-skraping virker ikke. JSON via `/database/pumpepriser.php` (liste) og `/database/stasjonsdata.php?id=X` (historikk per stasjon). Hovedlisten har INGEN tidsstempler — bekreftelsesdato hentes per stasjon.
- **Signal K → Garmin chartplotter**: 1223xsv har IKKE TCP/IP-mottaker for waypoints. Må gå via Cerbo GX VE.CAN → N2K.
- **SQLite-migrasjoner** må være idempotente (`CREATE TABLE IF NOT EXISTS`, sjekk `PRAGMA table_info` før `ALTER TABLE`)
- **W-Bus krever genuine FTDI FT232RL chip** for pålitelig 2400 baud 8E1 på Venus OS
- **LiFePO4-lading**: 800Ah-banken bør lades med minst 30A (helst mer via Cristec)
- **N2K-bussens 12V-strøm kommer fra navigasjonsinstrumentene (plotter), ikke motoren.** Hvis nav-panelet er av, er hele N2K-bussen stum: ingen motor-PGN-er, ingen tank-nivå, ingen dybde til Cerbo. Cerbo-CAN-driveren er da fortsatt UP, men `ip -s link show vecan0` viser at RX står stille. Konsekvens: **skru på nav-instrumenter før motorstart** for at `sensorPoller` skal få logget noe. Signal K serverer siste kjente verdi med gammel timestamp når bussen er død — sensorPoller leser bare `.value` uten å sjekke alder, så stale nuller kan havne i `sensor_history`. Diagnose-snutt: `curl http://localhost:3000/signalk/v1/api/vessels/self/propulsion/port/revolutions` — sjekk at timestamp er fersk.

## Åpne tråder (prioritert)

1. **Shore power-deteksjon** — endelig løsning er 230V-relé på GX digital input (`Settings/Devices/digital_input_1..4` finnes på Cerbo allerede). Alternativ: bytte IP22 til IP22 VE.Direct-variant (dyrere, men gir også lader-telemetri). Heuristikken er forbedret men kan ikke skille float fra hvile-etter-fullading. Se note over om hvorfor BLE-veien ikke fungerer på vår 2019-IP22.
2. **Webasto W-Bus Node-RED flows** — samtidig med Cerbo Node-RED-konfig
3. **Kystverket fartsgrense-integrasjon** (WMS layer_754)
4. **Bekreft Cristec-lader-modell** — bilde av typeskilt

## Eksterne ressurser

- Signal K: https://signalk.org/specification/
- pumpepriser.no JSON: https://www.pumpepriser.no/database/pumpepriser.php
- MET Norway: https://api.met.no/weatherapi/locationforecast/2.0/documentation
- Kystverket WMS: https://services.kystverket.no/wms.ashx?service=WMS&request=GetCapabilities