# sync-search-index.ps1 - maintenance tool
# Adds pages missing from _assets/search-index.js as skeleton entries
# (human then fills in d=description and k=keywords).
# Usage: powershell -ExecutionPolicy Bypass -File "_local-tools-path\sync-search-index.ps1"
# NOTE: keep this file pure ASCII to avoid encoding issues with Windows PowerShell 5.1.
param([string]$Root = "")

if([string]::IsNullOrWhiteSpace($Root)){ $Root = (Get-Location).Path }
$root = (Resolve-Path $Root).Path
$indexFile = Join-Path $root "_assets\search-index.js"
if(-not (Test-Path $indexFile)){ Write-Error "search-index.js not found: $indexFile"; exit 1 }

$content = [IO.File]::ReadAllText($indexFile, [Text.Encoding]::UTF8)
$existing = @{}
[regex]::Matches($content, 'u:"([^"]+)"') | ForEach-Object { $existing[$_.Groups[1].Value] = $true }

# exclude: vcs dirs, tool/assets dirs (any path segment starting with "_" after a backslash)
$files = Get-ChildItem -Path $root -Recurse -File -Include *.html | Where-Object {
  $_.FullName -notmatch 'edge_prof|node_modules|\.git' -and $_.FullName -notmatch '\\_'
}

$missing = @()
foreach($f in $files){
  $rel = ($f.FullName.Substring($root.Length + 1)) -replace '\\','/'
  if($existing.ContainsKey($rel)){ continue }
  $c = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
  $t = [regex]::Match($c, '<title>([^<]*)</title>').Groups[1].Value.Trim()
  if(-not $t){ $t = $f.BaseName }
  $sec = ""
  $bc = [regex]::Match($c, 'breadcrumb\s*:\s*\[\s*\{\s*t\s*:\s*"([^"]+)"')
  if($bc.Success){ $sec = $bc.Groups[1].Value }
  else { $sec = Split-Path $f.DirectoryName -Leaf }
  $missing += ('  { t:"' + $t + '", u:"' + $rel + '", s:"' + $sec + '", d:"TODO: fill description", k:"TODO: fill keywords" },')
}

if($missing.Count -eq 0){
  Write-Host ("SEARCH INDEX UP TO DATE (" + $existing.Count + " entries, " + $files.Count + " pages)")
}else{
  $newBlock = "`n  /* ---- auto-added by sync tool (fill d/k then remove this comment) ---- */`n" + ($missing -join "`n") + "`n"
  $newContent = $content -replace '\r?\n\];\s*$', ($newBlock + '];')
  if($newContent -eq $content){ Write-Error "insertion failed: trailing ]; not found"; exit 2 }
  [IO.File]::WriteAllText($indexFile, $newContent, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("ADDED " + $missing.Count + " skeleton entries:")
  $missing | ForEach-Object { Write-Host "  +" $_ }
}
