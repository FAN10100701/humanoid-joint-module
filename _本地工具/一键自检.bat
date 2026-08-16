@echo off
rem ============================================================
rem 人形机器人学习站 - One-Click Self Check
rem 检查: JS语法 / 链接 / 搜索索引一致性 / sitemap / 版本一致性
rem ============================================================
title 学习站一键自检
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0一键自检.ps1"
echo.
pause
