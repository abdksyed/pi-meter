#!/usr/bin/env bash
# Build the React frontend into frontend/dist so the API can serve it.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/frontend"

if [[ ! -d node_modules ]]; then
  npm install
fi

npm run build
echo "Frontend built at $root/frontend/dist"
