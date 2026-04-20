#!/bin/bash
# Simulerer 10 turer i Kristiansandsfjorden og omegn for Bavaria Sport 32 (FAR999)
# Kjør: bash seed-trips.sh

API="http://localhost:3001/api/trips"

echo "⛵ Legger inn 10 turer i Kristiansandsfjorden..."

# ── 1. Hjemmehavn → Oksøy fyr og tilbake ─────────────────────────────────
curl -s -X POST $API \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Oksøy fyr tur-retur",
    "start_ts": "2025-06-14T10:15:00Z",
    "end_ts":   "2025-06-14T14:45:00Z",
    "start_lat": 58.1467, "start_lon": 7.9956,
    "end_lat":   58.1467, "end_lon":   7.9956,
    "distance_nm": 18.4,
    "max_speed_kn": 28.7,
    "avg_speed_kn": 16.2,
    "engine_hours": 4.5,
    "fuel_used_l":  38.0,
    "persons": 3,
    "notes": "Flott dag, vindstille og lett sjø. Fortøyde ved Oksøy og hadde lunch på dekk. Delfiner ved Grønningen."
  }' > /dev/null
echo "✓ 1/10 Oksøy fyr"

# ── 2. Fisketur ved Ryvingen ──────────────────────────────────────────────
curl -s -X POST $API \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Fisketur Ryvingen",
    "start_ts": "2025-06-28T05:30:00Z",
    "end_ts":   "2025-06-28T12:00:00Z",
    "start_lat": 58.1467, "start_lon": 7.9956,
    "end_lat":   58.1467, "end_lon":   7.9956,
    "distance_nm": 24.1,
    "max_speed_kn": 26.3,
    "avg_speed_kn": 14.8,
    "engine_hours": 6.5,
    "fuel_used_l":  52.0,
    "persons": 2,
    "notes": "Tidlig start. God makrellfiske ved Ryvingen, fikk 14 stk. Litt sjø fra SV på hjemtur, Bf 3-4."
  }' > /dev/null
echo "✓ 2/10 Ryvingen fisketur"

# ── 3. Dagscruise til Ny-Hellesund ────────────────────────────────────────
curl -s -X POST $API \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ny-Hellesund overnatting",
    "start_ts": "2025-07-05T11:00:00Z",
    "end_ts":   "2025-07-06T15:30:00Z",
    "start_lat": 58.1467, "start_lon": 7.9956,
    "end_lat":   58.1467, "end_lon":   7.9956,
    "distance_nm": 31.7,
    "max_speed_kn": 30.1,
    "avg_speed_kn": 17.5,
    "engine_hours": 3.6,
    "fuel_used_l":  29.5,
    "persons": 4,
    "notes": "Overnattet i gjestehavnen på Ny-Hellesund. Perfekte forhold begge veier. La ut ankeret i sundet."
  }' > /dev/null
echo "✓ 3/10 Ny-Hellesund"

# ── 4. Kveldscruise i indre havn ─────────────────────────────────────────
curl -s -X POST $API \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kveldscruise Kristiansandsfjorden",
    "start_ts": "2025-07-12T18:30:00Z",
    "end_ts":   "2025-07-12T21:00:00Z",
    "start_lat": 58.1467, "start_lon": 7.9956,
    "end_lat":   58.1467, "end_lon":   7.9956,
    "distance_nm": 9.2,
    "max_speed_kn": 22.4,
    "avg_speed_kn": 11.0,
    "engine_hours": 2.5,
    "fuel_used_l":  18.0,
    "persons": 5,
    "notes": "Rolig kveldstur med familien. Rundt Flekkerøy, over til Odderøya og hjem. Sol hele veien."
  }' > /dev/null
echo "✓ 4/10 Kveldscruise"

# ── 5. Tur til Mandal ────────────────────────────────────────────────────
curl -s -X POST $API \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mandal — sjøveien",
    "start_ts": "2025-07-19T09:00:00Z",
    "end_ts":   "2025-07-19T18:00:00Z",
    "start_lat": 58.1467, "start_lon": 7.9956,
    "end_lat":   58.1467, "end_lon":   7.9956,
    "distance_nm": 42.8,
    "max_speed_kn": 31.2,
    "avg_speed_kn": 18.9,
    "engine_hours": 4.5,
    "fuel_used_l":  44.0,
    "persons": 3,
    "notes": "Tur til Mandal, spiste lunsj ved Furulunden. En del sjø utpå — bølger 0.8m fra SV. Hekktruster brukt inn i Mandal havn."
  }' > /dev/null
echo "✓ 5/10 Mandal"

# ── 6. Badeltur Blindleia-starten ────────────────────────────────────────
curl -s -X POST $API \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Badeltur Ulvøysund",
    "start_ts": "2025-07-26T12:00:00Z",
    "end_ts":   "2025-07-26T17:30:00Z",
    "start_lat": 58.1467, "start_lon": 7.9956,
    "end_lat":   58.1467, "end_lon":   7.9956,
    "distance_nm": 15.3,
    "max_speed_kn": 24.8,
    "avg_speed_kn": 12.6,
    "engine_hours": 2.4,
    "fuel_used_l":  19.5,
    "persons": 4,
    "notes": "Anker ved Ulvøysund. Bading og grilling. Sjøtemperatur 21°C. Fantastisk sommervær, 26°C i luften."
  }' > /dev/null
echo "✓ 6/10 Ulvøysund badeltur"

# ── 7. Seilas til Lyngør (lengre tur) ────────────────────────────────────
curl -s -X POST $API \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Helgetur Lyngør",
    "start_ts": "2025-08-02T08:00:00Z",
    "end_ts":   "2025-08-04T17:00:00Z",
    "start_lat": 58.1467, "start_lon": 7.9956,
    "end_lat":   58.1467, "end_lon":   7.9956,
    "distance_nm": 118.4,
    "max_speed_kn": 32.5,
    "avg_speed_kn": 19.2,
    "engine_hours": 12.4,
    "fuel_used_l":  105.0,
    "persons": 4,
    "notes": "Helgetur til Lyngør. Overnattet i Lyngør og Risør. Noe sjø dag 1 (Bf 4-5), men ellers perfekt. Totalt 118 nm, lengste tur med Bavaria."
  }' > /dev/null
echo "✓ 7/10 Helgetur Lyngør"

# ── 8. Høsttur, runde Grønningen ────────────────────────────────────────
curl -s -X POST $API \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Høsttur Grønningen fyr",
    "start_ts": "2025-09-06T10:30:00Z",
    "end_ts":   "2025-09-06T14:00:00Z",
    "start_lat": 58.1467, "start_lon": 7.9956,
    "end_lat":   58.1467, "end_lon":   7.9956,
    "distance_nm": 12.6,
    "max_speed_kn": 25.1,
    "avg_speed_kn": 13.4,
    "engine_hours": 3.5,
    "fuel_used_l":  26.0,
    "persons": 2,
    "notes": "Første høsttur. Litt kjølig men sol. Kjørte rundt Grønningen og inn Topdalsfjorden. Veldig stille og fint."
  }' > /dev/null
echo "✓ 8/10 Grønningen høst"

# ── 9. Sjøsetting etter vinteropplag — prøvetur ───────────────────────────
curl -s -X POST $API \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Prøvetur etter sjøsetting 2025",
    "start_ts": "2025-05-03T11:00:00Z",
    "end_ts":   "2025-05-03T13:30:00Z",
    "startspeed_kn": 18.3,
    "avg_speed_kn": 9.2,
    "engine_hours": 2.5,
    "fuel_used_l":  17.0,
    "persons": 1,
    "notes": "Første tur etter vinteropplag. Sjekket alle systemer. Motor, autopilot og hekktruster OK. Noe rust på ankerkjetting — bestilt ny."
  }' > /dev/null
echo "✓ 9/10 Prøvetur sjøsetting"

# ── 10. Sen kveldscruise, Flekkerøy rundt ────────────────────────────────
curl -s -X POST $API \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Flekkerøy rundt — solnedgang",
    "start_ts": "2025-08-16T19:00:00Z",
    "end_ts":   "2025-08-16T21:45:00Z",
    "start_lat": 58.1467, "start_lon": 7.9956,
    "end_lat":   58.1467, "end_lon":   7.9956,
    "distance_nm": 11.2,
    "max_speed_kn": 23.7,
    "avg_speed_kn": 12.1,
    "engine_hours": 2.75,
    "fuel_used_l":  20.5,
    "persons": 3,
    "notes": "Rolig kveldstur rundt Flekkerøy. Fantastisk solnedgang mot vest. Møtte MS Silhouette inn fjorden."
  }' > /dev/null
echo "✓ 10/10 Flekkerøy solnedgang"

echo ""
echo "✅ Alle 10 turer lagt inn!"
echo "Åpne http://localhost:5173/#trips for å se dem"
