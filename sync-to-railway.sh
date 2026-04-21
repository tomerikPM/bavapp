#!/bin/bash
# sync-to-railway.sh — push lokal DB + uploads til Railway-instans.
#
# Bruk:
#   export SITE_PASSWORD="<passord fra Railway Variables>"
#   ./sync-to-railway.sh
#
# Forutsetter:
#   • Lokal backend kjører på localhost:3001
#   • Railway-variabelen ENABLE_ADMIN_RESTORE=1 er satt
#
# VIKTIG: Dette OVERSKRIVER Railway-DB-en. Alt som ble lagt til via Railway-UI
# mellom to sync-er går tapt. Behold all redigering på lokal instans.

set -e

RAILWAY_URL="${RAILWAY_URL:-https://bavapp-production.up.railway.app}"
LOCAL_URL="${LOCAL_URL:-http://localhost:3001}"
SITE_USER="${SITE_USER:-bavapp}"

if [ -z "$SITE_PASSWORD" ]; then
  echo "❌ SITE_PASSWORD ikke satt."
  echo ""
  echo "Kjør først:"
  echo "  export SITE_PASSWORD=\"<passord>\""
  exit 1
fi

cd "$(dirname "$0")"

# Sjekk at lokal backend svarer
if ! curl -sS -o /dev/null -w "%{http_code}" "$LOCAL_URL/api/health" | grep -q 200; then
  echo "❌ Lokal backend svarer ikke på $LOCAL_URL/api/health."
  echo "   Start den med: cd backend && npm run dev"
  exit 1
fi

echo "→ Lager backup fra lokal backend…"
curl -sS "$LOCAL_URL/api/admin/backup" -o bavapp-backup.tar.gz
SIZE=$(ls -lh bavapp-backup.tar.gz | awk '{print $5}')
echo "  ✓ bavapp-backup.tar.gz ($SIZE)"

echo "→ Laster opp til Railway…"
RESPONSE=$(curl -sS -u "$SITE_USER:$SITE_PASSWORD" \
  -F "archive=@bavapp-backup.tar.gz" \
  "$RAILWAY_URL/api/admin/restore")
echo "  $RESPONSE"

if ! echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "❌ Restore feilet. Sjekk respons over."
  exit 1
fi

echo "→ Venter 25 sek på at Railway restarter…"
sleep 25

echo "→ Verifiserer at appen er oppe igjen:"
STATUS_HTTP=$(curl -sS -o /dev/null -w "%{http_code}" "$RAILWAY_URL/api/health")
if [ "$STATUS_HTTP" != "200" ]; then
  echo "⚠ /api/health svarer HTTP $STATUS_HTTP — vent litt og sjekk manuelt."
  exit 1
fi

echo "→ Teller rader:"
curl -sS -u "$SITE_USER:$SITE_PASSWORD" "$RAILWAY_URL/api/admin/status" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
mb = d['db_size_bytes'] / 1024 / 1024
print(f'  DB: {mb:.1f} MB   Bilder: {d[\"uploads_file_count\"]}')
"

for endpoint in features photos costs changelog; do
  count=$(curl -sS -u "$SITE_USER:$SITE_PASSWORD" "$RAILWAY_URL/api/$endpoint" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count', len(d.get('data', []))))" 2>/dev/null || echo "?")
  printf "  %-12s %s\n" "$endpoint:" "$count"
done

echo ""
echo "✓ Sync ferdig. Åpne $RAILWAY_URL og hard-refresh nettleseren (Cmd+Shift+R)."
