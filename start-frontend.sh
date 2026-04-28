#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

cd "$FRONTEND_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm is not installed or not in PATH."
  echo "Install Node.js from: https://nodejs.org"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[GapGenius] Installing dependencies..."
  npm install
fi

echo "[GapGenius] Frontend starting on http://localhost:5173"
echo

npm run dev
