@echo off
chcp 65001 >nul
rem ============================================================
rem 人形机器人3D解剖页面 - 一键启动
rem 双击本文件：启动本地HTTP服务器并自动打开3D解剖拆解页面
rem 注意：不要直接双击 html 文件，否则 Three.js 无法加载本地模型
rem ============================================================
title 人形机器人3D解剖 - 本地服务器
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\00_解剖式知识可视化\server.ps1"
pause
