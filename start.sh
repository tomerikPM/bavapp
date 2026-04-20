#!/bin/bash
# Bavaria Sport 32 — start alle lokale tjenester

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
MOCK="$ROOT/signalk-mock"

echo ""
echo "⛵  Bavaria Sport 32 — lokal utviklingsserver"
echo "───────────────────────────────────────────────"

# Installer avhengigheter hvis node_modules mangler
if [ ! -d "$BACKEND/node_modules" ]; then
  echo "📦 Installerer backend-avhengigheter..."
  cd "$BACKEND" && npm install
fi

if [ ! -d "$MOCK/node_modules" ]; then
  echo "📦 Installerer mock-avhengigheter..."
  cd "$MOCK" && npm install
fi

echo ""
echo "🚀 Starter tjenester:"
echo "   Backend API  → http://localhost:3001/api/health"
echo "   Signal K     → http://localhost:3000/signalk/v1/api/vessels/self"
echo ""
echo "   Trykk Ctrl+C for å stoppe begge."
echo ""

# Start begge i bakgrunnen, avslutt begge ved Ctrl+C
trap 'kill %1 %2 2>/dev/null; echo "\n👋 Stoppet"; exit 0' INT TERM

node "$MOCK/mock-server.js" &
node "$BACKEND/server.js" &

wait
