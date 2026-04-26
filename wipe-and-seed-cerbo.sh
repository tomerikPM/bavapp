#!/bin/bash
# wipe-and-seed-cerbo.sh — slett Cerbo-DB, importer costs + documents + photos
# (med tilhørende filer fra uploads/) fra lokal Mac.
#
# Resultatet:
#   • Tom DB med auto-seeds (parts, maintenance, vessel_items, features, changelog)
#   • Costs, documents, photos importert fra lokal Mac-DB
#   • backend/uploads/ rsynced til Cerbo
#   • Alt annet (events, trips, sensor_history) tomt
#
# Bruk:
#   ./wipe-and-seed-cerbo.sh

set -e

CERBO_HOST="${CERBO_HOST:-root@172.20.10.4}"
LOCAL_DB="${LOCAL_DB:-backend/data/bavaria32.db}"
LOCAL_UPLOADS="${LOCAL_UPLOADS:-backend/uploads}"
TMP_SQL="/tmp/bavapp-seed-$$.sql"

cd "$(dirname "$0")"

if [ ! -f "$LOCAL_DB" ]; then
  echo "❌ Finner ikke lokal DB: $LOCAL_DB"
  exit 1
fi

echo "→ Eksporterer costs + documents + photos fra $LOCAL_DB…"
sqlite3 "$LOCAL_DB" <<SQL > "$TMP_SQL"
.mode insert costs
SELECT id, date, category, description, amount, currency, liters, price_per_liter, location, NULL AS trip_id, notes, created_at, updated_at FROM costs;
.mode insert documents
SELECT * FROM documents;
.mode insert photos
SELECT * FROM photos;
SQL

C_COUNT=$(grep -c '^INSERT INTO costs' "$TMP_SQL" || echo 0)
D_COUNT=$(grep -c '^INSERT INTO documents' "$TMP_SQL" || echo 0)
P_COUNT=$(grep -c '^INSERT INTO photos' "$TMP_SQL" || echo 0)
echo "  ↳ costs: $C_COUNT, documents: $D_COUNT, photos: $P_COUNT"

echo "→ Kopierer SQL til Cerbo…"
scp "$TMP_SQL" "$CERBO_HOST:/tmp/bavapp-seed.sql"

if [ -d "$LOCAL_UPLOADS" ]; then
  echo "→ rsync uploads/ → Cerbo…"
  rsync -az --delete "$LOCAL_UPLOADS/" "$CERBO_HOST:/data/bavapp/backend/uploads/"
else
  echo "  ⚠ $LOCAL_UPLOADS finnes ikke — hopper over filene"
fi

echo "→ Wipe + reseed på Cerbo…"
ssh "$CERBO_HOST" "bash -se" <<'REMOTE'
set -e
DB=/data/bavapp/backend/data/bavaria32.db

echo "  ↳ stopper bavapp…"
svc -d /service/bavapp
sleep 2

echo "  ↳ sletter gammel DB…"
rm -f "$DB" "$DB-wal" "$DB-shm"

echo "  ↳ starter bavapp for å lage tom schema + auto-seeds…"
svc -u /service/bavapp
sleep 6

echo "  ↳ stopper for clean import…"
svc -d /service/bavapp
sleep 2

echo "  ↳ importerer costs + documents + photos via better-sqlite3…"
cd /data/bavapp/backend
node -e "
  const Database = require('better-sqlite3');
  const fs = require('fs');
  const db = new Database('$DB');
  db.exec(fs.readFileSync('/tmp/bavapp-seed.sql', 'utf8'));
  for (const t of ['costs','documents','photos']) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n;
    console.log('    ' + t.padEnd(10) + ': ' + n + ' rader');
  }
  db.close();
"

echo "  ↳ starter bavapp igjen…"
svc -u /service/bavapp
sleep 3

rm -f /tmp/bavapp-seed.sql
REMOTE

rm -f "$TMP_SQL"

echo "→ Verifiserer…"
ssh "$CERBO_HOST" "
  svstat /service/bavapp
  printf '  '
  curl -s -o /dev/null -w 'http://localhost:3001/api/health → HTTP %{http_code}\n' http://localhost:3001/api/health
"

echo ""
echo "✓ Wipe + seed ferdig."
echo "  Sjekk Bavapp: Kostnader, Dokumenter, Bilder."
