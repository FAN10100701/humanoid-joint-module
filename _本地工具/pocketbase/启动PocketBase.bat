@echo off
rem ============================================================
rem  PocketBase local server launcher (Stage-1 local loop)
rem  ASCII-only per repo hard rule #3 (PS 5.1 reads no-BOM as GBK)
rem  Note: keep echo lines free of parentheses inside if-blocks.
rem ============================================================
cd /d %~dp0
title PocketBase Server - keep this window OPEN

if not exist pocketbase.exe goto :noexe

netstat -ano | findstr ":8090" | findstr /I "LISTENING" >nul
if errorlevel 1 goto :serve

echo [!] Port 8090 is ALREADY in use - PocketBase is probably ALREADY running.
echo.
echo     1. Check it: open http://127.0.0.1:8090/api/health in your browser.
echo        "API is healthy" = server already up - no need to start it twice.
echo     2. To restart: close the OLD PocketBase window first, or run:
echo        taskkill /IM pocketbase.exe /F
echo        ...then run this file again.
echo.
pause
exit /b 0

:serve
echo [*] Starting PocketBase on http://127.0.0.1:8090
echo     Admin UI: http://127.0.0.1:8090/_/
echo.
echo     *** KEEP THIS WINDOW OPEN while using the website sync. ***
echo     *** Closing this window STOPS the server. Data is saved. ***
echo     Stop server: Ctrl+C or close this window.
echo.
pocketbase.exe serve --http 127.0.0.1:8090
echo.
echo [!] The server just stopped. Common causes:
echo     1. another PocketBase instance grabbed port 8090 first
echo     2. antivirus blocked pocketbase.exe
echo     Read the error above, fix, then start again.
echo.
pause
exit /b 0

:noexe
echo [X] pocketbase.exe not found in this folder.
echo.
echo     Download the Windows amd64 build, then unzip HERE:
echo     https://github.com/pocketbase/pocketbase/releases
echo     Mirror for CN network: prefix the full github URL with https://ghfast.top/
echo.
pause
exit /b 1
