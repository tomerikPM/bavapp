#!/bin/bash
# setup-cloudflared.sh — installerer Cloudflare Tunnel (cloudflared) på Cerbo GX
#
# Bruk:
#   ./setup-cloudflared.sh
#
# Krever:
#   - cloudflared-token.txt i repo-roten (gitignored)
#   - SSH-tilgang til Cerbo (root@cerbo via Tailscale, eller CERBO_HOST=root@<ip>)
#
# Hva scriptet gjør:
#   1. Detekterer ARM-arkitektur på Cerbo (aarch64 eller armv7l)
#   2. Laster ned riktig cloudflared-binær fra GitHub releases til /data/cloudflared/
#   3. Skriver token til /data/cloudflared/.env
#   4. Oppretter daemontools-service under /data/cloudflared/service/
#   5. Symlinker /service/cloudflared → /data/cloudflared/service
#   6. Legger til persistens i /data/rcS.local (overlever firmware-oppdatering)
#
# Etter dette serveres Bavapp på https://bavapp.summermylife.no via tunnelen.
# Cloudflare DNS skal allerede peke der (konfigurert via tunnel-wizarden).

set -e

CERBO_HOST="${CERBO_HOST:-root@cerbo}"
TOKEN_FILE="$(dirname "$0")/cloudflared-token.txt"

if [ ! -f "$TOKEN_FILE" ]; then
  echo "✗ Mangler $TOKEN_FILE — opprett den med tunnel-tokenet fra Cloudflare-dashbordet." >&2
  exit 1
fi

TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
if [ -z "$TOKEN" ]; then
  echo "✗ $TOKEN_FILE er tom." >&2
  exit 1
fi

echo "→ Sjekker SSH-tilkobling til $CERBO_HOST…"
if ! ssh -o ConnectTimeout=5 -o BatchMode=no "$CERBO_HOST" 'echo ok' >/dev/null 2>&1; then
  echo "✗ Kan ikke nå $CERBO_HOST. Er Cerbo online på Tailscale?" >&2
  echo "  Sjekk: tailscale status | grep cerbo" >&2
  exit 1
fi

echo "→ Detekterer arkitektur og installerer cloudflared…"
ssh "$CERBO_HOST" TUNNEL_TOKEN="$TOKEN" "bash -se" <<'REMOTE'
set -e

ARCH="$(uname -m)"
case "$ARCH" in
  aarch64|arm64)  CFD_ARCH=arm64 ;;
  armv7l|armv6l)  CFD_ARCH=arm   ;;
  x86_64)         CFD_ARCH=amd64 ;;
  *) echo "✗ Ukjent arkitektur: $ARCH" >&2; exit 1 ;;
esac
echo "  ↳ arkitektur: $ARCH → cloudflared-linux-$CFD_ARCH"

mkdir -p /data/cloudflared
cd /data/cloudflared

# Last ned binær hvis den mangler eller ikke er kjørbar
if [ ! -x ./cloudflared ]; then
  echo "  ↳ laster ned cloudflared-binær (siste release)…"
  URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CFD_ARCH}"
  # Venus OS har wget, ikke alltid curl med TLS
  wget -q -O cloudflared.new "$URL"
  chmod +x cloudflared.new
  mv cloudflared.new cloudflared
  ./cloudflared --version
fi

# Token i .env (kun lesbar for root)
echo "TUNNEL_TOKEN=$TUNNEL_TOKEN" > .env
chmod 600 .env

# Daemontools service
mkdir -p service/log
cat > service/run <<'RUN'
#!/bin/sh
exec 2>&1
cd /data/cloudflared
set -a
. ./.env
set +a
exec ./cloudflared --no-autoupdate tunnel run --token "$TUNNEL_TOKEN"
RUN
chmod +x service/run

mkdir -p /var/log/cloudflared
cat > service/log/run <<'LOGRUN'
#!/bin/sh
exec multilog t s10485760 n10 /var/log/cloudflared
LOGRUN
chmod +x service/log/run

# Symlink fra /service/ — daemontools (svscan) plukker opp innen 5 sek
if [ ! -L /service/cloudflared ]; then
  ln -s /data/cloudflared/service /service/cloudflared
  echo "  ↳ service registrert"
fi

# Persistens via /data/rcS.local (overlever firmware-oppdatering)
RCS=/data/rcS.local
touch "$RCS"
chmod +x "$RCS"
if ! grep -q '/service/cloudflared' "$RCS"; then
  cat >> "$RCS" <<'PERSIST'

# cloudflared — Cloudflare Tunnel for Bavapp
[ -L /service/cloudflared ] || ln -s /data/cloudflared/service /service/cloudflared
PERSIST
  echo "  ↳ persistens lagt til i $RCS"
fi

# Restart for å plukke opp ny config
svc -t /service/cloudflared 2>/dev/null || true
echo "  ↳ service startet"
REMOTE

echo "→ Verifiserer (venter 8 sek på tunnel-oppkobling)…"
sleep 8

ssh "$CERBO_HOST" "
  echo '── svstat ──'
  svstat /service/cloudflared
  echo '── siste logg ──'
  tail -n 20 /var/log/cloudflared/current 2>/dev/null || echo '(ingen logg ennå)'
"

echo ""
echo "✓ cloudflared installert."
echo "  Test: curl -I https://bavapp.summermylife.no"
echo "  Logg: ssh $CERBO_HOST tail -f /var/log/cloudflared/current"
