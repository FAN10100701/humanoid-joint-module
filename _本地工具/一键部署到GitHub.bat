@echo off
rem Switch console to UTF-8 so the Chinese section-dir paths below work (file must be saved as UTF-8)
chcp 65001 >nul
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

rem [1/3] Stage EXPLICIT content paths only. NEVER use "git add -A" / "git add .":
rem   they sweep untracked personal/dev files (video assets, .trae, .zcode,
rem   browser profiles, unfinished personal pages) into this PUBLIC repo.
"%GIT_EXE%" add .agents .github .gitignore .nojekyll _assets _本地工具 docs 00_3D解剖 01_理论入门 02_硬件基础 03_项目实操 04_升级进阶 05_HdriveV2工程 06_软件与算法 07_前沿知识库 08_学习工具 09_大模型与具身智能 10_NPU与数字IC设计 404.html AGENTS.md AUDIT.md CHANGELOG.md CONTRIBUTING.md LICENSE README.md baidu_verify_codeva-83ZAbuLmz6.html favicon.ico favicon.svg index.html manifest.json robots.txt sitemap.xml sw.js
rem (V2.1.20b: whitelist was missing 09/10 sections + AGENTS.md/AUDIT.md/.agents/favicon - changes there silently never deployed)
echo.

rem [1.5/3] If nothing got staged, stop here instead of failing on an empty commit:
"%GIT_EXE%" diff --cached --quiet
if not errorlevel 1 (
    echo   [INFO] Nothing new to deploy - whitelisted content already committed.
    pause
    exit /b 0
)

echo [2/3] Creating commit...
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set STAMP=%%i
"%GIT_EXE%" commit -m "deploy: site content %STAMP%"
echo.

echo [3/3] Pushing to GitHub...
rem detect local proxy port 7897 (ASCII only, GBK-safe)
powershell -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',7897);$c.Close();exit 0}catch{exit 1}" >nul 2>&1
if errorlevel 1 goto :noproxy
echo   [OK] Local proxy 127.0.0.1:7897 is running (git global proxy will be used).
goto :dopush
:noproxy
echo   [INFO] Local proxy not detected. If push fails due to network, run:
echo     git config --global http.proxy http://127.0.0.1:7897
echo     git config --global https.proxy http://127.0.0.1:7897
:dopush
"%GIT_EXE%" push origin master
if errorlevel 1 (
    echo   [RETRY] Push failed - retrying with proxy bypass (direct connection)...
    "%GIT_EXE%" -c http.proxy= -c https.proxy= push origin master
)
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
    echo   If push was REJECTED (remote has newer commits), run:
    echo     "%GIT_EXE%" pull --rebase origin master
    echo   then re-run this script.
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