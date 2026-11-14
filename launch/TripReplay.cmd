@echo off
rem Double-click in Windows to start TripReplay on this computer at http://localhost:4173 and open
rem it in the browser (docs/user-guide.md section 1). Keep this window open while you use
rem TripReplay; close it to stop.
chcp 65001 >nul
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 or later is required: https://nodejs.org/
  echo 需要 Node.js 24 以上版本：https://nodejs.org/
  pause
  exit /b 1
)

rem The pnpm version the project uses, from package.json.
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').packageManager"`) do set "PNPM=%%v"

if not exist node_modules (
  echo Installing dependencies ^(first start only^)...
  echo 正在安裝相依套件（僅首次啟動）……
  call npx --yes %PNPM% install --frozen-lockfile
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo Building and starting TripReplay at http://localhost:4173 ...
echo 正在建置並啟動 TripReplay：http://localhost:4173 ……
call npx --yes %PNPM% start
pause
