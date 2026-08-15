@echo off
rem ============================================================
rem 人形机器人学习站 - One Click Launcher
rem 双击本文件:启动本地 http 服务器并自动打开浏览器。
rem 说明: 3D 解剖页必须通过 http 访问(URDF/STL/Three.js
rem 在 file:// 协议下无法加载,双击 html 会白屏)。
rem ============================================================
title 人形机器人学习站 - Local Server
start "学习站本地服务器" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0启动服务器.ps1"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8123/
