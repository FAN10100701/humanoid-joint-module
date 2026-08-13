@echo off
rem ============================================================
rem 人形机器人关节模组教学系统 - 智能一键启动器
rem 功能：自动寻找空闲端口、启动本地服务器（支持加载STL模型）、自动打开浏览器
rem 使用：双击本文件即可，无需手动改端口
rem 注意：现在直接双击「启动教学系统.html」也能用（3D页面需联网加载Three.js CDN）
rem       但如果要加载本地STL模型文件（真实宇树机器人3D模型），请用本脚本启动服务器
rem ============================================================
chcp 65001 >nul
title 人形机器人教学系统 - 本地服务器

cd /d "%~dp0"

rem 从8321开始自动寻找可用端口
set PORT=0
for /L %%P in (8321,1,8400) do (
    if %PORT%==0 (
        netstat -ano | findstr ":%%P " | findstr "LISTENING" >nul
        if errorlevel 1 set PORT=%%P
    )
)

if %PORT%==0 (
    echo [!] 8321-8400端口全部被占用，请关闭占用程序后重试
    pause
    exit /b 1
)

echo ==============================================================
echo   人形机器人关节模组教学系统
echo ==============================================================
echo   服务端口: %PORT%
echo   访问地址: http://localhost:%PORT%/启动教学系统.html
echo.
echo   [提示] 不要关闭本窗口，关闭窗口即停止服务
echo   [提示] 直接双击HTML文件也能使用（3D需联网），本脚本用于加载本地STL模型
echo ==============================================================
echo.

rem 后台启动服务器并打开浏览器（根目录设为当前文件夹，可访问所有子目录）
start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=%PORT%; $root='%CD%'; Add-Type -AssemblyName System.Web; $l=New-Object System.Net.HttpListener; $l.Prefixes.Add(\"http://localhost:$p/\"); try { $l.Start(); Write-Host '[OK] 服务器已启动'; Start-Process \"http://localhost:$p/启动教学系统.html\"; while($l.IsListening){$c=$l.GetContext();$r=$c.Request;$rsp=$c.Response;try{$u=[System.Uri]::UnescapeDataString($r.Url.AbsolutePath);if($u -eq '/' -or $u -eq ''){$u='/启动教学系统.html'};$f=Join-Path $root ($u.TrimStart('/').Replace('/','\'));if(Test-Path $f -PathType Leaf){$e=[IO.Path]::GetExtension($f).ToLower();$ct=switch($e){'.html'{'text/html; charset=utf-8'}'.js'{'application/javascript; charset=utf-8'}'.css'{'text/css; charset=utf-8'}'.json'{'application/json; charset=utf-8'}'.stl'{'model/stl'}'.urdf'{'text/xml; charset=utf-8'}'.glb'{'model/gltf-binary'}'.gltf'{'model/gltf+json'}'.png'{'image/png'}'.jpg'{'image/jpeg'}'.jpeg'{'image/jpeg'}'.gif'{'image/gif'}'.svg'{'image/svg+xml'}'.ico'{'image/x-icon'}'.md'{'text/markdown; charset=utf-8'}default{'application/octet-stream'}};$b=[IO.File]::ReadAllBytes($f);$rsp.ContentType=$ct;$rsp.ContentLength64=$b.Length;$rsp.AddHeader('Cache-Control','public, max-age=3600');$rsp.OutputStream.Write($b,0,$b.Length)}else{$rsp.StatusCode=404;$buf=[Text.Encoding]::UTF8.GetBytes('404 Not Found');$rsp.OutputStream.Write($buf,0,$buf.Length)}}catch{try{$rsp.StatusCode=500}catch{}}finally{$rsp.Close()}} } catch { Write-Host '[ERR] 端口被占用'; pause }"

timeout /t 2 >nul
echo [OK] 浏览器应该已自动打开，如果没有请手动访问：
echo      http://localhost:%PORT%/启动教学系统.html
echo.
echo 按任意键停止服务器并退出...
pause >nul

rem 关闭可能启动的powershell进程
taskkill /f /fi "windowtitle eq Windows PowerShell" 2>nul
exit /b 0
