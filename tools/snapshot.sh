#!/bin/bash
# tools/snapshot.sh — hent semi-reelle data fra Cerbo til lokal Mac
#
# Bruk:
#   ./tools/snapshot.sh                       # på båt-LAN (default 192.168.1.237)
#   CERBO_HOST=root@10.0.0.50 ./tools/snapshot.sh
#
# Lagrer:
#   snapshot/signalk.json          — full Signal K state for vessels/self
#   snapshot/bavaria32.db          — kopi av Cerbo-SQLite med all historikk
#   snapshot/meta.json             — timestamp + Cerbo-host

set -e

CERBO_HOST="${CERBO_HOST:-root@192.168.1.237}"
CERBO_IP="${CERBO_HOST#*@}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/snapshot"

mkdir -p "$OUT_DIR"

echo "→ Henter Signal K state fra http://$CERBO_IP:3000 …"
if ! curl -sf --max-time 10 "http://$CERBO_IP:3000/signalk/v1/api/vessels/self" -o "$OUT_DIR/signalk.json"; then
  echo "  ✗ Kunne ikke nå Signal K. Er du på Summer-wifi? (Cerbo: $CERBO_IP)" >&2
  exit 1
fi
SIZE=$(wc -c < "$OUT_DIR/signalk.json" | tr -d ' ')
echo "  ✓ signalk.json ($SIZE bytes)"

echo "→ scp bavapp.db fra $CERBO_HOST …"
scp -q "$CERBO_HOST:/data/bavapp/backend/data/bavaria32.db" "$OUT_DIR/bavaria32.db"
DBSIZE=$(wc -c < "$OUT_DIR/bavaria32.db" | tr -d ' ')
echo "  ✓ bavaria32.db ($DBSIZE bytes)"

cat > "$OUT_DIR/meta.json" <<EOF
{
  "takenAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cerboHost": "$CERBO_HOST",
  "signalkBytes": $SIZE,
  "dbBytes": $DBSIZE
}
EOF

echo ""
echo "Ferdig. Slik bruker du snapshotet lokalt:"
echo "  1) Start mock Signal K:   node tools/mock-signalk.js"
echo "  2) I backend/.env:        SIGNALK_URL=http://localhost:3010"
echo "  3) (Valgfritt) kjør mot snapshot-DB:"
echo "       DB_PATH=$OUT_DIR/bavaria32.db npm --prefix backend run dev"
