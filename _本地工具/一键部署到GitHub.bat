@echo off
title Deploy to GitHub Pages
echo ================================================================
echo   Humanoid Robot Joint Module - GitHub Pages Deploy
echo ================================================================
echo.

set GIT_EXE=C:\Program Files\Git\bin\git.exe

if not exist "%GIT_EXE%" (
    echo [ERROR] Git not found. Please install first: https://git-scm.com/download/win
    pause
    exit /b 1
)

rem switch to parent dir (git root) because this script is in a subfolder
cd /d "%~dp0.."

echo [1/3] Adding all changes...
"%GIT_EXE%" add -A
echo.

echo [2/3] Creating commit...
"%GIT_EXE%" commit -m "update: teaching system content"
echo.

echo [3/3] Pushing to GitHub...
"%GIT_EXE%" push origin master
echo.

if %errorlevel% equ 0 (
    echo ================================================================
    echo   [SUCCESS] Push completed!
    echo.
    echo   Next steps to enable GitHub Pages:
    echo   1. Go to repository  -^>  Settings  -^>  Pages
    echo   2. Source: "Deploy from a branch"
    echo   3. Branch: "master" / "(root)"
    echo   4. Click Save, wait 1-3 min, then visit:
    echo      https://FAN10100701.github.io/humanoid-joint-module/
    echo ================================================================
) else (
    echo.
    echo [INFO] If this is your FIRST push, run these two commands:
    echo   "%GIT_EXE%" remote add origin https://github.com/FAN10100701/humanoid-joint-module.git
    echo   "%GIT_EXE%" push -u origin master
    echo.
    echo Make sure the repo exists at: https://github.com/new
    echo (name: humanoid-joint-module , Public, NO readme init)
)

echo.
pause