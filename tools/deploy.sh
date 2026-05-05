#!/bin/bash
# tools/deploy.sh — deploy backend + frontend fra lokal Mac til Cerbo
#
# Bruk:
#   ./tools/deploy.sh                       # deploy + restart bavapp-service
#   ./tools/deploy.sh --dry-run             # vis hva som ville endres, gjør ingenting
#   ./tools/deploy.sh --no-restart          # deploy uten å restarte
#   CERBO_HOST=cerbo-lan ./tools/deploy.sh    # bruk LAN istedenfor tunnel
#
# Forutsetter:
#   - SSH-config-alias `cerbo` (Cloudflare-tunnel via ssh.summermylife.no)
#     eller `cerbo-lan` (192.168.1.237) når på Summer-wifi
#   - rsync + cloudflared på Mac (brew install cloudflared)
#
# Hopper over (overskriver IKKE):
#   - backend/.env  (produksjonsenv)
#   - backend/data/ (SQLite-databasen)
#   - backend/uploads/ (brukerlastede filer)
#   - node_modules/ (kjør npm install --omit=dev på Cerbo manuelt om dependencies endres)

set -e

CERBO_HOST="${CERBO_HOST:-cerbo}"
DRY_RUN=""
RESTART=1

for arg in "$@"; do
  case "$arg" in
    -n|--dry-run)  DRY_RUN="-n" ;;
    --no-restart)  RESTART=0 ;;
    -h|--help)
      sed -n '2,17p' "$0"
      exit 0
      ;;
    *) echo "Ukjent flag: $arg" >&2; exit 1 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "→ Backend  → $CERBO_HOST:/data/bavapp/backend/"
rsync -avz $DRY_RUN --delete \
  --exclude='node_modules' \
  --exclude='data' \
  --exclude='.env' \
  --exclude='uploads' \
  --exclude='*.bak.*' \
  --exclude='*.db' \
  --exclude='.DS_Store' \
  backend/ "$CERBO_HOST:/data/bavapp/backend/"

echo ""
echo "→ Frontend → $CERBO_HOST:/data/bavapp/frontend/"
rsync -avz $DRY_RUN --delete \
  --exclude='.DS_Store' \
  frontend/ "$CERBO_HOST:/data/bavapp/frontend/"

if [ -n "$DRY_RUN" ]; then
  echo ""
  echo "Dry-run ferdig. Kjør uten --dry-run for å deploye."
  exit 0
fi

if [ "$RESTART" = "1" ]; then
  echo ""
  echo "→ Restart /service/bavapp"
  ssh "$CERBO_HOST" "svc -t /service/bavapp"
  echo -n "→ Health check (venter på oppstart): "
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 2
    if ssh "$CERBO_HOST" "curl -sf -m 3 http://localhost:3001/api/health > /dev/null" 2>/dev/null; then
      echo "OK"
      break
    fi
    echo -n "."
    if [ $i = 10 ]; then
      echo " FEIL — sjekk: ssh $CERBO_HOST 'tail -50 /var/log/bavapp/current'"
      exit 1
    fi
  done
fi

echo ""
echo "✓ Deploy ferdig."
