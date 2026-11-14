#!/bin/sh
# Starts TripReplay on this computer at http://localhost:4173 and opens it in the browser
# (docs/user-guide.md §1). Keep this window open while you use TripReplay; close it to stop.
set -e
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 24 or later is required: https://nodejs.org/"
  echo "需要 Node.js 24 以上版本：https://nodejs.org/"
  exit 1
fi

# The pnpm version the project uses, from package.json.
PNPM=$(node -p "require('./package.json').packageManager")

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first start only)..."
  echo "正在安裝相依套件（僅首次啟動）……"
  npx --yes "$PNPM" install --frozen-lockfile
fi

echo "Building and starting TripReplay at http://localhost:4173 ..."
echo "正在建置並啟動 TripReplay：http://localhost:4173 ……"
exec npx --yes "$PNPM" start
