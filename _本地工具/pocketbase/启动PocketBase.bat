@echo off
rem ============================================================
rem  PocketBase local server launcher (Stage-1 local loop)
rem  ASCII-only per repo hard rule #3 (PS 5.1 reads no-BOM as GBK)
rem ============================================================
cd /d %~dp0

if not exist pocketbase.exe (
  echo [X] pocketbase.exe not found in this folder.
  echo.
  echo     Download the Windows amd64 build, then unzip HERE:
  echo     https://github.com/pocketbase/pocketbase/releases
  echo     Example file: pocketbase_0.30.0_windows_amd64.zip
  echo     Mirror for CN network: https://ghfast.top/ + the full github URL above
  echo.
  pause
  exit /b 1
)

echo [*] Starting PocketBase on http://127.0.0.1:8090
echo     Admin UI: http://127.0.0.1:8090/_/
echo     Keep this window open while syncing notes from the site.
echo     Stop: Ctrl+C
echo.
pocketbase.exe serve --http 127.0.0.1:8090
