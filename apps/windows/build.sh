#!/usr/bin/env bash
# Builds the Windows application and its installer (docs/releasing.md): the page with
# `vite build --mode desktop`, the program with `dotnet publish`, the notices and SBOM with the
# license gate, and the installer with makensis. Runs on Linux and Windows (Git Bash) alike;
# needs Node.js 24, pnpm, the .NET 10 SDK and NSIS 3. DOTNET names another `dotnet` to use.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
version="$(node -p "require('./package.json').version")"
out="apps/windows/build"

pnpm run build:desktop
rm -rf "$out/app"
"${DOTNET:-dotnet}" publish apps/windows -c Release -o "$out/app" -p:TripReplayVersion="$version" -p:DebugType=none
cp -r apps/web/dist-desktop "$out/app/web"
node tools/release/src/windows.ts --assets apps/windows/obj/project.assets.json \
  --components "$out/web-components.json" --out "$out/app/web" --nsis "$(makensis -VERSION)"
makensis -V2 -DVERSION="$version" -DSOURCE="$root/$out/app" \
  -DOUTFILE="$root/$out/tripreplay-windows-$version-setup.exe" apps/windows/installer/TripReplay.nsi
echo "Built $out/tripreplay-windows-$version-setup.exe"
