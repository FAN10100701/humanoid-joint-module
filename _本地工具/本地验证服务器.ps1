# ============================================================
# 本地验证静态服务器（一次性工具，仅本机使用）
# 用途：托管项目根目录，配合无头浏览器实测 3D 页面的 .drc 加载与渲染
# 说明：所有 HTTP 请求记录到 请求日志.txt，事后核对浏览器到底请求了
#       .drc 还是回退到 .gz/.STL（验证 Draco 压缩是否真正生效）
# 安全：仅监听 127.0.0.1，路径强制限制在项目根目录内（防目录穿越）
# 用法：直接运行本脚本 → 浏览器访问 http://127.0.0.1:8898/
#       验证完关闭本窗口即可
# ============================================================
$ErrorActionPreference='Stop'

# 【可调】监听端口（若被占用可改）
$Port=8898
# 项目根目录（脚本位于 _本地工具 下，根目录取上一级）
$Root=Split-Path -Parent $PSScriptRoot
# 请求日志文件路径（与脚本同目录，追加写入）
$LogFile=Join-Path $PSScriptRoot '请求日志.txt'
"===== 验证开始 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Out-File $LogFile -Append -Encoding utf8

# ---------- 单连接处理逻辑（在后台运行空间中执行，支持浏览器并发请求） ----------
$handler={
  param($client,$Root,$LogFile)
  try{
    $stream=$client.GetStream()
    $stream.ReadTimeout=10000  # 10秒读超时，浏览器断开时不卡死
    # 只需读请求头即可（浏览器发起的都是 GET，无请求体）
    $buf=New-Object byte[] 65536
    $head=''
    while($true){
      $n=$stream.Read($buf,0,$buf.Length)
      if($n -le 0){break}
      $head+=[System.Text.Encoding]::ASCII.GetString($buf,0,$n)
      if($head.Contains("`r`n`r`n")){break}
    }
    $line=($head -split "`r`n")[0]
    $parts=$line -split ' '
    if($parts.Length -lt 2){ $client.Close(); return }
    $rel=$parts[1].Split('?')[0]
    # 根路径直接跳转到 3D 主页面
    if($rel -eq '/'){$rel='/00_解剖式知识可视化/人形机器人解剖式知识可视化.html'}
    # 解码 URL 中文路径（如 %E8%A7%A3%E5%89%96...）
    $rel=[System.Uri]::UnescapeDataString($rel.TrimStart('/'))
    # 记录请求日志（时间 + 路径），事后核对 .drc 是否被请求
    $stamp=Get-Date -Format 'HH:mm:ss.fff'
    "$stamp  GET  $rel" | Out-File $LogFile -Append -Encoding utf8
    try{
      # 防目录穿越：完整路径必须仍在项目根目录内
      $full=[System.IO.Path]::GetFullPath((Join-Path $Root ($rel -replace '/','\')))
      $base=[System.IO.Path]::GetFullPath($Root)
      if(-not $full.StartsWith($base,[System.StringComparison]::OrdinalIgnoreCase)){ throw '非法路径' }
      if(-not (Test-Path $full -PathType Leaf)){ throw 'not found' }
      $body=[System.IO.File]::ReadAllBytes($full)
      # 按扩展名返回 MIME（.wasm 必须正确，否则 Draco 解码器实例化失败）
      $mime=switch([System.IO.Path]::GetExtension($full).ToLowerInvariant()){
        '.html'{'text/html; charset=utf-8'}
        '.js'  {'text/javascript; charset=utf-8'}
        '.css' {'text/css; charset=utf-8'}
        '.wasm'{ 'application/wasm' }
        '.png' { 'image/png' }
        '.jpg' { 'image/jpeg' }
        '.svg' { 'image/svg+xml' }
        '.json'{ 'application/json; charset=utf-8' }
        '.ico' { 'image/x-icon' }
        default{ 'application/octet-stream' }   # .drc/.gz/.STL 模型文件
      }
      # no-store：验证期间禁缓存，确保每次都真实走网络（日志才准）
      $hd="HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
      $hb=[System.Text.Encoding]::ASCII.GetBytes($hd)
      $stream.Write($hb,0,$hb.Length)
      if($body.Length -gt 0){$stream.Write($body,0,$body.Length)}
      $stream.Flush()
    }catch{
      $b=[System.Text.Encoding]::UTF8.GetBytes('not found')
      $hd="HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($b.Length)`r`nConnection: close`r`n`r`n"
      $hb=[System.Text.Encoding]::ASCII.GetBytes($hd)
      $stream.Write($hb,0,$hb.Length)
      if($b.Length -gt 0){$stream.Write($b,0,$b.Length)}
      $stream.Flush()
    }
  }catch{}finally{ try{$client.Close()}catch{} }
}

# ---------- 启动 TcpListener（与 Draco转换服务器.ps1 同款方案，已验证可跑） ----------
$tcp=New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback,$Port)
$tcp.Start()
Write-Host '============================================'
Write-Host " 本地验证服务器已启动: http://127.0.0.1:$Port/"
Write-Host " 项目根目录: $Root"
Write-Host " 请求日志: $LogFile"
Write-Host ' 验证完成后直接关闭本窗口即可'
Write-Host '============================================'

try{
  while($true){
    $client=$tcp.AcceptTcpClient()
    # 每个连接丢到独立运行空间异步处理，避免并发请求互相阻塞
    $ps=[powershell]::Create()
    $null=$ps.AddScript($handler).AddArgument($client).AddArgument($Root).AddArgument($LogFile)
    $ps.BeginInvoke() | Out-Null
  }
}finally{
  $tcp.Stop()
  Write-Host ' 服务器已停止'
}
