@echo off
rem ============================================================
rem Humanoid Robot 3D Anatomy - One Click Launcher
rem Double click this file: start local http server and open
rem the 3D anatomy page in your default browser automatically.
rem NOTE: the html MUST be served over http. Local URDF/STL
rem models and the local Three.js engine cannot be loaded
rem under file:// protocol (double-clicking the html fails).
rem ============================================================
title Humanoid Robot 3D Anatomy - Local Server
for /d %%D in ("%~dp0..\00_*") do set "SRV=%%D\server.ps1"
if not exist "%SRV%" (
    echo [ERROR] server.ps1 not found. Please check the "00_..." folder exists.
    pause
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SRV%"
pause
