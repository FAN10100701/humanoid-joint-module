# JS syntax checker for HTML files (extracts <script> blocks and runs node --check)
# 用法: .\js语法检查.ps1 <html文件路径>
param([Parameter(Mandatory=$true)][string]$HtmlFile)

if(-not (Test-Path $HtmlFile)){ Write-Error "file not found: $HtmlFile"; exit 1 }
# node.exe fallback list: PATH first, then common install locations
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$node = $null
if($nodeCmd){ $node = $nodeCmd.Source }
if(-not $node){
  foreach($c in @("C:\Program Files\nodejs\node.exe","C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe")){
    if(Test-Path $c){ $node = $c; break }
  }
}
if(-not $node){ Write-Error "node.exe not found"; exit 1 }
Write-Output ("node: " + $node)

$content = Get-Content -LiteralPath $HtmlFile -Raw -Encoding UTF8
$pattern = '(?s)<script(?![^>]*\bsrc=)(?![^>]*type\s*=\s*["'']application/(?:ld\+json|json)["''])[^>]*>(.*?)</script>'
$matches = [regex]::Matches($content, $pattern)
Write-Output ("script blocks found: " + $matches.Count)

$tmpDir = Join-Path $env:TEMP ("jscheck_" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmpDir | Out-Null

$fail = 0
$i = 0
foreach($m in $matches){
  $i++
  $js = $m.Groups[1].Value
  if([string]::IsNullOrWhiteSpace($js)){ continue }
  $f = Join-Path $tmpDir ("block_" + $i + ".js")
  [IO.File]::WriteAllText($f, $js, [Text.Encoding]::UTF8)
  $out = & $node --check $f 2>&1
  if($LASTEXITCODE -ne 0){
    $fail++
    Write-Output ("=== BLOCK " + $i + " SYNTAX ERROR ===")
    Write-Output $out
  } else {
    Write-Output ("block " + $i + ": OK (" + $js.Length + " chars)")
  }
}
Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
if($fail -eq 0){ Write-Output "ALL SCRIPT BLOCKS OK" } else { Write-Output ("FAILED BLOCKS: " + $fail); exit 2 }
