# =============================================================
# 人形机器人解剖式知识可视化 · 本地静态服务器
# 说明：页面通过 fetch 加载本地 URDF/STL 模型，浏览器禁止在
#       file:// 协议下读取本地文件，因此必须通过 http 访问页面。
# 用法：直接运行同目录下的【启动教学页面.bat】即可。
# 注意：本文件必须保存为 UTF-8 带 BOM 编码，否则 PowerShell 5
#       会按 GBK 解析中文导致脚本解析失败（服务器无法启动）。
# =============================================================

$ErrorActionPreference = 'Stop'

# 【可调参数】服务端口号（如被占用可改成其他 1024~65535 的值）
$Port = 8323
# 【可调参数】默认首页文件名
$DefaultPage = '人形机器人解剖式知识可视化.html'

# 网站根目录 = 本脚本所在目录
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Prefix = "http://localhost:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Prefix)
try {
    $listener.Start()
} catch {
    Write-Host "端口 $Port 启动失败（可能被占用），请修改脚本顶部的 Port 参数后重试。" -ForegroundColor Red
    Read-Host '按回车退出'
    exit 1
}

Write-Host '==============================================' -ForegroundColor Cyan
Write-Host ' 人形机器人解剖式知识可视化 · 本地服务器已启动' -ForegroundColor Cyan
Write-Host (" 访问地址: {0}{1}" -f $Prefix, $DefaultPage) -ForegroundColor Yellow
Write-Host ' 关闭本窗口即停止服务' -ForegroundColor Cyan
Write-Host '==============================================' -ForegroundColor Cyan

# 自动打开默认浏览器访问首页
Start-Process ($Prefix + $DefaultPage)

# MIME 类型表（STL/URDF/GLB 为 3D 模型与机器人描述文件）
$Mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.stl'  = 'model/stl'
    '.urdf' = 'text/xml; charset=utf-8'
    '.glb'  = 'model/gltf-binary'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
}

# 主循环：逐个处理 HTTP 请求（单线程顺序处理，教学场景足够）
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $resp = $ctx.Response
    try {
        # URL 解码并规范化路径（StartsWith 校验防止 ../ 越权访问）
        $raw = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
        if ($raw -eq '/' -or $raw -eq '') { $raw = '/' + $DefaultPage }
        $rel = $raw.TrimStart('/').Replace('/', '\')
        $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
        if ($full.StartsWith($Root) -and (Test-Path $full -PathType Leaf)) {
            $ext = [System.IO.Path]::GetExtension($full).ToLower()
            $ct = if ($Mime.ContainsKey($ext)) { $Mime[$ext] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $resp.StatusCode = 200
            $resp.ContentType = $ct
            $resp.ContentLength64 = $bytes.Length
            # 缓存策略：html 页面禁止缓存（保证修改后刷新立即生效）；
            # 模型/引擎等大文件允许缓存 1 小时，加快二次加载
            if ($ext -eq '.html') {
                $resp.AddHeader('Cache-Control', 'no-cache')
            } else {
                $resp.AddHeader('Cache-Control', 'public, max-age=3600')
            }
            $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            # 文件不存在：返回 404（页面会自动回退到参数化模型，不会卡死）
            $msg = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found: ' + $raw)
            $resp.StatusCode = 404
            $resp.ContentType = 'text/plain; charset=utf-8'
            $resp.OutputStream.Write($msg, 0, $msg.Length)
        }
    } catch {
        try { $resp.StatusCode = 500 } catch {}
    } finally {
        $resp.Close()
    }
}
