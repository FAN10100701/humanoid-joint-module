# ============================================================
# 本地 HTTP 静态服务器（供 _本地工具\启动教学页面.bat 调用）
# ------------------------------------------------------------
# 作用：在本地启动一个极简静态文件服务器，让浏览器通过
#       http:// 协议访问 3D 解剖页面。
# 为什么需要它：
#       file:// 协议下浏览器禁止 fetch 本地文件，官方 URDF/STL
#       模型和本地 Three.js 都无法加载，只能显示"内置回退丑模型"。
#       通过本服务器用 http 访问后，即可秒开官方宇树模型。
# 无依赖：只用 PowerShell 自带的 TcpListener 实现，无需安装任何东西。
# ============================================================

$ErrorActionPreference = 'Stop'

# ==================== 可调参数（调试用） ====================
$PORT_START = 8000        # 起始端口，被占用则自动 +1 重试
$PORT_MAX   = 8020        # 最大尝试端口
$BIND_IP    = '127.0.0.1' # 只监听本机回环地址，不对外暴露，安全
# ============================================================

# 站点根目录：本脚本上一级目录（即整个项目根目录）
# 这样既能访问 00_解剖式知识可视化/，也能访问根目录的 index.html
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

# 目标入口页面（相对 ROOT 的路径，含中文需保持与文件名一致）
$ENTRY = '00_解剖式知识可视化/人形机器人解剖式知识可视化.html'

# MIME 类型表：按扩展名返回正确 Content-Type
# （ES 模块 .js/.mjs 必须是 JavaScript MIME，否则浏览器拒绝加载）
$MIME = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.mjs'  = 'application/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.ico'  = 'image/x-icon'
    '.stl'  = 'application/octet-stream'
    '.urdf' = 'text/xml; charset=utf-8'
    '.md'   = 'text/markdown; charset=utf-8'
    '.txt'  = 'text/plain; charset=utf-8'
}

# 找到一个可用端口（从 PORT_START 开始逐个尝试）
function Find-FreePort {
    for ($p = $PORT_START; $p -le $PORT_MAX; $p++) {
        $l = $null
        try {
            $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Parse($BIND_IP), $p)
            $l.Start()
            $l.Stop()
            return $p
        } catch {
            # 端口被占用，尝试下一个
        }
    }
    throw "无法在 $PORT_START ~ $PORT_MAX 之间找到可用端口，请关闭占用端口的程序后重试"
}

# 写一个简单的 404 响应
function Write-NotFound($stream) {
    $body = [System.Text.Encoding]::UTF8.GetBytes('<h1>404 Not Found</h1>')
    $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
    $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($hb, 0, $hb.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Flush()
}

# 处理单个连接：解析请求行 -> 映射到本地文件 -> 返回内容
function Handle-Request($client) {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 5000
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 8192, $true)

    # 读取请求行，形如：GET /path HTTP/1.1
    $requestLine = $reader.ReadLine()
    if (-not $requestLine) { return }

    # 跳过剩余请求头，直到空行
    while ($true) {
        $line = $reader.ReadLine()
        if ($line -eq '' -or $line -eq $null) { break }
    }

    $parts = $requestLine -split ' '
    if ($parts.Count -lt 2) { return }
    $rawPath = $parts[1]

    # 去掉查询字符串（? 后面的部分）
    $q = $rawPath.IndexOf('?')
    if ($q -ge 0) { $rawPath = $rawPath.Substring(0, $q) }

    # URL 解码（处理中文文件名，如 人形机器人解剖式知识可视化.html）
    $decoded = [System.Uri]::UnescapeDataString($rawPath)

    # 访问根路径时返回主页 index.html（学习系统主界面，可导航到其它页面）
    if ($decoded -eq '/') { $decoded = '/index.html' }

    # 防止路径穿越攻击：把相对路径拼到 ROOT 后再规范化，必须仍在 ROOT 内
    $rel = $decoded.TrimStart('/').Replace('/', '\')
    $full = [System.IO.Path]::GetFullPath((Join-Path $ROOT $rel))
    if (-not $full.StartsWith($ROOT, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-NotFound $stream
        return
    }

    # 文件不存在则返回 404
    if (-not (Test-Path $full -PathType Leaf)) {
        Write-NotFound $stream
        return
    }

    # 读取文件全部字节
    $bytes = [System.IO.File]::ReadAllBytes($full)
    $ext = [System.IO.Path]::GetExtension($full).ToLower()
    $ctype = $MIME[$ext]
    if (-not $ctype) { $ctype = 'application/octet-stream' }

    # 写响应头（Connection: close 简化处理，不保持长连接）
    # 【性能优化】缓存策略：模型/URDF 等大体积静态资源返回 max-age 让浏览器缓存，
    #   重复加载(切场景/刷新/切机型)时直接从本地缓存秒开，不再重复下载；代码文件不缓存便于调试
    if ($ext -in '.stl', '.urdf') {
        $cache = 'Cache-Control: max-age=86400'
    } else {
        $cache = 'Cache-Control: no-cache'
    }
    $head = "HTTP/1.1 200 OK`r`nContent-Type: $ctype`r`nContent-Length: $($bytes.Length)`r`n$cache`r`nConnection: close`r`n`r`n"
    $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($hb, 0, $hb.Length)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
}

# ==================== 启动服务器 ====================
# 【修复】启动前清理残留的 server.ps1 进程：用户多次双击 .bat 会残留多个旧进程，
#   旧进程占用 8000 端口导致浏览器一直访问旧代码(缓存等新改动不生效)。清理后再启动。
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object {
    $_.CommandLine -match 'server\.ps1' -and $_.ProcessId -ne $PID
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
try {
    $port = Find-FreePort
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Parse($BIND_IP), $port)
    $listener.Start()
} catch {
    Write-Host ''
    Write-Host '  [错误] 无法启动本地服务器，原因：' -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host '  请检查：防火墙是否拦截、端口是否被占用，或改用 Chrome/Edge 浏览器。' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}

# 用 127.0.0.1 而不是 localhost：避免个别电脑上 localhost 被解析成 IPv6 导致浏览器连不上
$url = "http://127.0.0.1:$port/"
Write-Host ''
Write-Host '======================================================' -ForegroundColor Cyan
Write-Host '  本地教学服务器已启动' -ForegroundColor Green
Write-Host "  主页地址: $url" -ForegroundColor White
Write-Host '  已打开「学习系统主页」，从主页可进入 3D 官方模型及各学习页面' -ForegroundColor DarkGray
Write-Host '  关闭本窗口 或 按 Ctrl+C 停止服务器' -ForegroundColor DarkGray
Write-Host '======================================================' -ForegroundColor Cyan
Write-Host ''

# 自动打开浏览器：优先用 Chrome（用户反馈 Edge 对本地 http 有兼容问题），回退默认浏览器。
# 打开 3D 解剖页（核心页面），路径含中文需做 URL 编码。
$target = "http://127.0.0.1:$port/" + [System.Uri]::EscapeUriString($ENTRY)
$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
try {
    if ($chrome) { Start-Process $chrome $target }
    else { Start-Process $target }
} catch { }

# 主循环：持续接收并处理请求，直到用户关闭窗口/Ctrl+C
while ($true) {
    $client = $null
    try {
        $client = $listener.AcceptTcpClient()
    } catch {
        # 服务器被停止（窗口关闭），退出循环
        break
    }
    try {
        Handle-Request $client
    } catch {
        # 单个请求出错不影响服务器整体运行，忽略即可
    } finally {
        if ($client) { $client.Close() }
    }
}
