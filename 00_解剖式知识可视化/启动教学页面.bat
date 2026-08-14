@echo off
rem ============================================================
rem Humanoid Robot 3D Anatomy Page - One Click Launcher
rem Double click this file: start local http server and open
rem the 3D anatomy page (real Unitree H1/G1 models) in your
rem default browser automatically.
rem NOTE: the html MUST be served over http. Local URDF/STL
rem models and the local Three.js engine cannot be loaded
rem under file:// protocol (double-clicking the html fails).
rem [Chinese] 双击本文件：启动本地服务器并自动打开宇树机器人3D解剖拆解页面。
rem           不要直接双击 html 文件，否则 3D 引擎无法加载。
rem ============================================================
chcp 65001 >nul
title Humanoid Robot 3D Anatomy - Local Server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
