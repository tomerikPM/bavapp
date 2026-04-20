#!/bin/bash
# del.sh — start bavaria32 og del med samboer
BASE="$HOME/Library/CloudStorage/OneDrive-PolarisMedia/bavaria32"

echo "⚓  Starter Bavaria Sport 32..."

# Drep gamle prosesser
pkill -f "signalk-mock" 2>/dev/null
pkill -f "nodemon server" 2>/dev/null
pkill -f ngrok 2>/dev/null
sleep 2

# Start Signal K mock
cd "$BASE/signalk-mock" && npm run dev > /tmp/skm.log 2>&1 &
echo "   ✓ Signal K mock startet"

# Start backend
cd "$BASE/backend" && npm run dev > /tmp/bak.log 2>&1 &
echo "   ✓ Backend startet"
sleep 3

# Start ngrok
~/ngrok http 3001 > /tmp/ngrok.log 2>&1 &
echo "   ✓ ngrok startet, venter på tunnel..."
sleep 6

# Hent URL fra ngrok API
URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https:[^"]*"' | head -1 | cut -d'"' -f4)

echo ""
if [ -n "$URL" ]; then
  echo "✅  Send denne lenken til samboeren:"
  echo ""
  echo "   $URL"
else
  # Prøv å hente fra loggfilen
  URL=$(grep -o 'url=https://[^ ]*' /tmp/ngrok.log 2>/dev/null | head -1 | cut -d= -f2)
  if [ -n "$URL" ]; then
    echo "✅  Send denne lenken til samboeren:"
    echo ""
    echo "   $URL"
  else
    echo "⚠️  Fant ikke URL automatisk. Sjekk http://localhost:4040 i nettleseren."
  fi
fi

echo ""
echo "Ctrl+C stopper alt."

trap "pkill -f 'npm run dev'; pkill -f nodemon; pkill -f ngrok; echo 'Stoppet.'" EXIT
wait
