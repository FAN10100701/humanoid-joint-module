# ============================================================
# Draco 批量转换本地服务器 v2（一次性工具，仅本机使用）
# 实现说明：v1 用 HttpListener 在后台沙箱启动报"参数不正确"，
#           v2 改用原生 TcpListener 手写极简 HTTP 协议（不依赖 HTTP.sys，处处可跑）
# 路由：
#   GET  /                     → 转换页面 Draco批量转换.html
#   GET  /list                 → JSON 清单：models 下所有 STL（含原始/压缩体积）
#   GET  /models/<相对路径>    → 读取 STL / .gz 文件（只读，不修改）
#   GET  /draco/<文件名>       → 读取 Draco 编码器文件（_本地工具\draco\package）
#   POST /save?path=<相对路径> → 把浏览器编码出的 .drc 字节写回 models 目录
#   POST /finish               → 转换全部完成，服务端打印汇总后自动退出
# 安全：仅监听本机 127.0.0.1，保存路径强制限制在 models 目录内（防目录穿越）
# 用法：直接运行本脚本，然后浏览器打开 http://127.0.0.1:8899/ 即全自动转换
# ============================================================
$ErrorActionPreference='Stop'

# 【可调】监听端口（若被占用可改）
$Port=8899
# 项目根目录（脚本位于 _本地工具 下，根目录取上一级）
$Root=Split-Path -Parent $PSScriptRoot
$PageDir=$PSScriptRoot                                  # 转换页面所在目录
$ModelsDir=Join-Path $Root '00_解剖式知识可视化\models'    # 模型目录（读+写）
$PkgDir=Join-Path $PSScriptRoot 'draco\package'        # Draco 编码器包目录（只读）

# ---------- 极简 HTTP 响应发送 ----------
function Send-Resp($stream,[int]$code,[string]$type,[byte[]]$body){
  $status=switch($code){200{'OK'}404{'Not Found'}500{'Server Error'}default{'OK'}}
  $head="HTTP/1.1 $code $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
  $hb=[System.Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($hb,0,$hb.Length)
  if($body.Length -gt 0){$stream.Write($body,0,$body.Length)}
  $stream.Flush()
}
function Send-404($stream){ Send-Resp $stream 404 'text/plain' ([System.Text.Encoding]::UTF8.GetBytes('not found')) }
function Send-JSON($stream,[string]$json){ Send-Resp $stream 200 'application/json; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes($json)) }

# ---------- 读取一个完整 HTTP 请求（头 + Content-Length 长度的体） ----------
function Read-Request($stream){
  $ms=New-Object System.IO.MemoryStream
  $buf=New-Object byte[] 65536
  $headerEnd=-1; $headText=''
  while($true){
    $n=$stream.Read($buf,0,$buf.Length)
    if($n -le 0){break}
    $ms.Write($buf,0,$n)
    $b=$ms.ToArray()
    if($headerEnd -lt 0){
      $s=[System.Text.Encoding]::ASCII.GetString($b)
      $i=$s.IndexOf("`r`n`r`n")
      if($i -ge 0){ $headerEnd=$i+4; $headText=$s.Substring(0,$i) }
    }
    if($headerEnd -ge 0){
      $cl=0
      $m=[regex]::Match($headText,'(?i)Content-Length:\s*(\d+)')
      if($m.Success){$cl=[int]$m.Groups[1].Value}
      if($ms.Length -ge $headerEnd+$cl){break}   # 头+体都读齐了
    }
    if($ms.Length -gt 104857600){break}          # 上限保护：100MB
  }
  if($headerEnd -lt 0){return $null}
  # 解析首行：方法 路径 协议版本
  $first=($headText -split "`r`n")[0] -split ' '
  $cl2=0
  $m2=[regex]::Match($headText,'(?i)Content-Length:\s*(\d+)')
  if($m2.Success){$cl2=[int]$m2.Groups[1].Value}
  $body=New-Object byte[] $cl2
  if($cl2 -gt 0){ [Array]::Copy($ms.ToArray(),$headerEnd,$body,0,$cl2) }
  return @{ method=$first[0]; rawPath=$first[1]; body=$body }
}

# ---------- 防目录穿越：相对路径必须在指定目录内 ----------
function Resolve-InDir([string]$dir,[string]$rel){
  $full=[System.IO.Path]::GetFullPath((Join-Path $dir ($rel -replace '/','\')))
  $base=[System.IO.Path]::GetFullPath($dir)
  if(-not $full.StartsWith($base,[System.StringComparison]::OrdinalIgnoreCase)){ throw "非法路径: $rel" }
  return $full
}

# ---------- 启动 TcpListener ----------
$tcp=New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback,$Port)
$tcp.Start()
Write-Host "============================================"
Write-Host " Draco 转换服务器已启动: http://127.0.0.1:$Port/"
Write-Host " 模型目录: $ModelsDir"
Write-Host " 浏览器打开页面后自动开始转换，完成后本窗口自动退出"
Write-Host "============================================"

try{
while($true){
  $client=$tcp.AcceptTcpClient()
  try{
    $stream=$client.GetStream()
    $req=Read-Request $stream
    if($null -eq $req){ $client.Close(); continue }

    # 拆出路径与查询串，路径做 URL 解码（模型文件名含中文）
    $rawPath=$req.rawPath
    $query=''
    $qIdx=$rawPath.IndexOf('?')
    if($qIdx -ge 0){ $query=$rawPath.Substring($qIdx+1); $rawPath=$rawPath.Substring(0,$qIdx) }
    $path=[System.Uri]::UnescapeDataString($rawPath)

    if(($path -eq '/' -or $path -eq '/index.html') -and $req.method -eq 'GET'){
      # 转换页面本体
      Send-Resp $stream 200 'text/html; charset=utf-8' ([System.IO.File]::ReadAllBytes((Join-Path $PageDir 'Draco批量转换.html')))
    }
    elseif($path -eq '/list' -and $req.method -eq 'GET'){
      # 递归收集 models 下全部 STL：路径(正斜杠) + 原始体积 + 同名 .gz 体积(可能没有)
      $items=@()
      Get-ChildItem $ModelsDir -Recurse -File -Include *.STL,*.stl | ForEach-Object {
        $rel=$_.FullName.Substring($ModelsDir.Length+1).Replace('\','/')
        $gzFile=$_.FullName+'.gz'
        $gzLen=0; if(Test-Path $gzFile){ $gzLen=(Get-Item $gzFile).Length }
        $items+=[ordered]@{ p=$rel; stl=$_.Length; gz=$gzLen }
      }
      Send-JSON $stream ($items | ConvertTo-Json -Compress)
    }
    elseif($path.StartsWith('/models/') -and $req.method -eq 'GET'){
      # 读取模型文件（STL 或 .gz）
      $f=Resolve-InDir $ModelsDir ($path.Substring('/models/'.Length))
      if(Test-Path $f){ Send-Resp $stream 200 'application/octet-stream' ([System.IO.File]::ReadAllBytes($f)) }
      else{ Send-404 $stream }
    }
    elseif($path.StartsWith('/draco/') -and $req.method -eq 'GET'){
      # 读取 Draco 编码器文件（JS 胶水 + wasm）
      $f=Resolve-InDir $PkgDir ($path.Substring('/draco/'.Length))
      if(Test-Path $f){
        $type= if($f.EndsWith('.wasm')){'application/wasm'} elseif($f.EndsWith('.js')){'application/javascript'} else {'application/octet-stream'}
        Send-Resp $stream 200 $type ([System.IO.File]::ReadAllBytes($f))
      } else{ Send-404 $stream }
    }
    elseif($path -eq '/save' -and $req.method -eq 'POST'){
      # 浏览器发来的 .drc 字节 → 写到同名 .drc（xxx.STL → xxx.drc）
      $rel=''
      $m=[regex]::Match($query,'(?i)path=([^&]*)')
      if($m.Success){ $rel=[System.Uri]::UnescapeDataString($m.Groups[1].Value) }
      $src=Resolve-InDir $ModelsDir $rel
      $dst=$src -replace '\.stl$','.drc' -replace '\.STL$','.drc'
      [System.IO.File]::WriteAllBytes($dst,$req.body)
      Write-Host ("[drc] {0}  {1:N1} KB" -f $rel,($req.body.Length/1KB)) -ForegroundColor Yellow
      Send-JSON $stream '{"ok":1}'
    }
    elseif($path -eq '/finish' -and $req.method -eq 'POST'){
      # 全部完成：打印汇总并退出服务器
      Write-Host "============================================"
      Write-Host ([System.Text.Encoding]::UTF8.GetString($req.body))
      Write-Host "============================================"
      Send-JSON $stream '{"ok":1}'
      Start-Sleep -Milliseconds 300
      $client.Close()
      break    # 退出循环 → 结束服务器
    }
    else{
      Send-404 $stream
    }
  }catch{
    Write-Host "[错误] $_"    # 单个请求处理失败：记录后继续服务下一个请求，不中断整体
  }
  finally{
    try{ $client.Close() }catch{}
  }
}
}catch{}finally{ $tcp.Stop() }
Write-Host "服务器已退出。转换产物已写入 models 目录。"
