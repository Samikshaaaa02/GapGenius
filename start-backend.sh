#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

cd "$BACKEND_DIR"

if [ ! -f "venv/bin/activate" ]; then
  echo "[ERROR] Virtual environment not found."
  echo "Run: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

# shellcheck disable=SC1091
source "venv/bin/activate"

echo "[GapGenius] Backend starting on http://localhost:8000"
echo "[GapGenius] API docs at  http://localhost:8000/docs"
echo

uvicorn main:app --reload --port 8000
