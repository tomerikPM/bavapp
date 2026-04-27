#!/bin/bash
# sync-to-cerbo.sh — deploy Bavapp til Cerbo GX (Venus OS Large)
#
# Bruk:
#   ./sync-to-cerbo.sh
#
# Ber om SSH-passord 2-3 ganger (uten ssh-key). Sett opp ssh-key med
# `ssh-copy-id root@<cerbo-ip>` for å unngå.
#
# Override host:
#   CERBO_HOST=root@10.0.0.50 ./sync-to-cerbo.sh

set -e

CERBO_HOST="${CERBO_HOST:-root@192.168.1.237}"
APP_DIR="/data/bavapp"

cd "$(dirname "$0")"

echo "→ Sikrer at $APP_DIR finnes på Cerbo…"
ssh "$CERBO_HOST" "mkdir -p $APP_DIR/backend $APP_DIR/frontend"

echo "→ rsync backend → $CERBO_HOST:$APP_DIR/backend/"
rsync -az --delete \
  --exclude=node_modules \
  --exclude='data/bavaria32.db' \
  --exclude='data/bavaria32.db-*' \
  --exclude=uploads \
  backend/ "$CERBO_HOST:$APP_DIR/backend/"

echo "→ rsync frontend → $CERBO_HOST:$APP_DIR/frontend/"
rsync -az --delete frontend/ "$CERBO_HOST:$APP_DIR/frontend/"

echo "→ npm install + service-setup på Cerbo…"
ssh "$CERBO_HOST" "bash -se" <<'REMOTE'
set -e

cd /data/bavapp/backend
mkdir -p data uploads
npm install --omit=dev --no-audit --no-fund

# Service-fil + log-pipe (idempotent)
mkdir -p /data/bavapp/service/log
mkdir -p /var/log/bavapp

cat > /data/bavapp/service/run <<'RUN'
#!/bin/sh
exec 2>&1
cd /data/bavapp/backend
# Source .env for secrets (ROUTER_PASS, VAPID_*, etc.)
set -a
[ -f .env ] && . ./.env
set +a
# Produksjonsverdier overstyrer evt. dev-verdier fra .env
exec env \
  PORT=3001 \
  SIGNALK_URL=http://localhost:3000 \
  NODE_ENV=production \
  /usr/bin/node server.js
RUN
chmod +x /data/bavapp/service/run

cat > /data/bavapp/service/log/run <<'LOGRUN'
#!/bin/sh
exec multilog t s10485760 n10 /var/log/bavapp
LOGRUN
chmod +x /data/bavapp/service/log/run

# Symlink fra /service/ — daemontools (svscan) plukker opp innen 5 sek
if [ ! -L /service/bavapp ]; then
  ln -s /data/bavapp/service /service/bavapp
  echo "  ↳ service registrert"
fi

# Restart for å plukke opp ny kode
svc -t /service/bavapp 2>/dev/null || true
echo "  ↳ service restartet"
REMOTE

echo "→ Verifiserer (venter 8 sek på oppstart)…"
sleep 8

ssh "$CERBO_HOST" "
  svstat /service/bavapp
  printf '  '
  curl -s -o /dev/null -w 'http://localhost:3001/api/health → HTTP %{http_code}\n' http://localhost:3001/api/health
"

echo ""
echo "✓ Deploy ferdig."
echo "  http://192.168.1.237:3001 (Bavapp)"
echo "  Logger: ssh $CERBO_HOST tail -f /var/log/bavapp/current"
