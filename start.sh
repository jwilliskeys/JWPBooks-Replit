#!/bin/bash
# JWP Books — Local Launcher
# Run this from the project folder: bash start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  🎹  JWP Books"
echo "  Piano Technician Client Manager"
echo "  ─────────────────────────────"

# Check Node
if ! command -v node &> /dev/null; then
  echo "  ❌  Node.js not found. Install from https://nodejs.org"
  exit 1
fi

# Check .env
if [ ! -f ".env" ]; then
  echo "  ❌  .env file not found. Make sure it exists in the project root."
  exit 1
fi

# Load .env variables into the shell environment so the server can read them
set -a
# shellcheck disable=SC1091
source .env
set +a

# Install deps if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "  📦  Installing dependencies..."
  npm install
fi

PORT="${PORT:-3000}"

echo ""
echo "  ✅  Starting server on http://localhost:$PORT"
echo "  📱  On your local network: http://$(ipconfig getifaddr en0 2>/dev/null || hostname):$PORT"
echo ""
echo "  Press Ctrl+C to stop"
echo ""

# Open browser after a short delay
(sleep 2 && open "http://localhost:$PORT") &

# Start the server
npm run dev
