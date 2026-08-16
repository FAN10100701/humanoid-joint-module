# self-check.ps1 - one-click site consistency check (ASCII only)
# Checks: 1) JS syntax of all HTML pages  2) relative link audit
#         3) search-index vs actual pages  4) sitemap url count
#         5) version consistency (site.js / index.html / CHANGELOG)
# Usage: powershell -ExecutionPolicy Bypass -File "_local-tool-path\self-check.ps1"
param([string]$Root = "")

if([string]::IsNullOrWhiteSpace($Root)){ $Root = (Get-Location).Path }
$root = (Resolve-Path $Root).Path
$fail = 0
function Check($name, $ok, $detail){
  $suffix = ""
  if($detail){ $suffix = "  (" + $detail + ")" }
  if($ok){ Write-Host ("PASS  " + $name + $suffix) }
  else   { Write-Host ("FAIL  " + $name + $suffix); $script:fail++ }
}

$pages = Get-ChildItem -Path $root -Recurse -File -Include *.html | Where-Object {
  $_.FullName -notmatch 'edge_prof|node_modules|\.git' -and $_.FullName -notmatch '\\_'
}
# pages that intentionally have no search-index entry (404 page + 05 redirect stubs)
# NOTE: keep this file ASCII-safe (PS 5.1 reads BOM-less UTF-8 as ANSI/GBK, Chinese chars get mangled)
$indexablePages = $pages | Where-Object {
  $_.Name -ne '404.html' -and $_.FullName -notlike '*\05_HdriveV2*'
}

# ---- 1) JS syntax ----
$synFail = 0
foreach($f in $pages){
  $content = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
  $pattern = '(?s)<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>'
  $blocks = [regex]::Matches($content, $pattern)
  $tmp = Join-Path $env:TEMP ("js_selfcheck_" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $i = 0
  foreach($b in $blocks){
    $i++
    $js = $b.Groups[1].Value
    if([string]::IsNullOrWhiteSpace($js)){ continue }
    $tf = Join-Path $tmp ("b" + $i + ".js")
    [IO.File]::WriteAllText($tf, $js, (New-Object System.Text.UTF8Encoding($false)))
    $out = & node --check $tf 2>&1
    if($LASTEXITCODE -ne 0){ $synFail++; Write-Host ("  JS-SYNTAX: " + $f.Name + " block " + $i) }
  }
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
Check "JS syntax (pages=" + $pages.Count + ")" ($synFail -eq 0) ($synFail.ToString() + " failed blocks")

# ---- 1b) external JS files syntax (site.js etc.) ----
$jsFail = 0
$jsFiles = Get-ChildItem -Path $root -Recurse -File -Include *.js | Where-Object {
  $_.FullName -notmatch 'edge_prof|node_modules|\.git' -and $_.FullName -notmatch '\\_本地工具\\'
}
foreach($j in $jsFiles){
  $out = & node --check $j.FullName 2>&1
  if($LASTEXITCODE -ne 0){ $jsFail++; Write-Host ("  JS-FILE: " + $j.FullName.Substring($root.Length+1)) }
}
Check "External JS syntax" ($jsFail -eq 0) ($jsFail.ToString() + " failed files")

# ---- 2) link audit ----
$broken = @()
foreach($f in $pages){
  $content = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
  $dir = $f.DirectoryName
  $ms = [regex]::Matches($content, '(?:href|src)="([^"#]+?)(?:#[^"]*)?"')
  foreach($m in $ms){
    $u = $m.Groups[1].Value
    if($u -match '^(https?:|mailto:|tel:|data:|javascript:|about:)' -or $u -eq '' -or $u -match '^\$\{' -or $u -match "^' \+ "){ continue }
    $u = ($u -split '\?')[0]
    $full = [IO.Path]::GetFullPath((Join-Path $dir $u))
    if(-not (Test-Path $full)){ $broken += ($f.Name + " -> " + $u) }
  }
}
Check "Relative links" ($broken.Count -eq 0) ($broken.Count.ToString() + " broken")
$broken | Select-Object -First 8 | ForEach-Object { Write-Host "   BROKEN: $_" }

# ---- 3) search index vs pages ----
$idxFile = Join-Path $root "_assets\search-index.js"
$idxContent = [IO.File]::ReadAllText($idxFile, [Text.Encoding]::UTF8)
$idxUrls = [regex]::Matches($idxContent, 'u:"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$missingIdx = @()
foreach($u in $idxUrls){ if(-not (Test-Path (Join-Path $root ($u -replace '/','\')))){ $missingIdx += $u } }
$excluded = '\\_|edge_prof|node_modules|\.git'
$realPages = Get-ChildItem -Path $root -Recurse -File -Include *.html | Where-Object { $_.FullName -notmatch $excluded } | ForEach-Object {
  $rel = ($_.FullName.Substring($root.Length + 1)) -replace '\\','/'
  if($rel -eq 'index.html'){ "" } else { $rel }
}
$indexable = @()
foreach($p in $indexablePages){
  $rel = ($p.FullName.Substring($root.Length + 1)) -replace '\\','/'
  if($rel -eq 'index.html'){ $indexable += "" } else { $indexable += $rel }
}
$notIndexed = @()
foreach($rp in $indexable){ if($rp -ne "" -and -not ($idxUrls -contains $rp)){ $notIndexed += $rp } }
Check "Search index: entries exist" ($missingIdx.Count -eq 0) ($missingIdx.Count.ToString() + " missing targets")
Check "Search index: all pages indexed" ($notIndexed.Count -eq 0) ($notIndexed.Count.ToString() + " pages not in index")
$notIndexed | Select-Object -First 8 | ForEach-Object { Write-Host "   NOT-INDEXED: $_" }
Check "Index count" ($idxUrls.Count -eq $indexable.Count) (($idxUrls.Count.ToString() + " vs ") + $indexable.Count)

# ---- 4) sitemap ----
$sitemap = Join-Path $root "sitemap.xml"
if(Test-Path $sitemap){
  $sm = [IO.File]::ReadAllText($sitemap, [Text.Encoding]::UTF8)
  $smCount = [regex]::Matches($sm, '<loc>').Count
  Check "Sitemap count vs pages" ($smCount -eq $indexable.Count) ($smCount.ToString() + " vs " + $indexable.Count)
  if($sm -notmatch 'https://cyco\.top/'){ Check "Sitemap domain" $false "missing cyco.top" } else { Check "Sitemap domain" $true "cyco.top" }
}else{ Check "Sitemap exists" $false "sitemap.xml not found" }

# ---- 5) version consistency ----
$siteJs = [IO.File]::ReadAllText((Join-Path $root "_assets\site.js"), [Text.Encoding]::UTF8)
$ver = [regex]::Match($siteJs, 'S\.VERSION\s*=\s*"([^"]+)"').Groups[1].Value
$index = [IO.File]::ReadAllText((Join-Path $root "index.html"), [Text.Encoding]::UTF8)
$idxHas = $index -match [regex]::Escape($ver)
$changelog = [IO.File]::ReadAllText((Join-Path $root "CHANGELOG.md"), [Text.Encoding]::UTF8)
$clHas = $changelog -match [regex]::Escape(($ver -split '\(')[0])
Check "Version single-source" ($idxHas -and $clHas) ($ver + " in index=" + $idxHas + " changelog=" + $clHas)

Write-Host ""
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED"; exit 0 }
Write-Host ("CHECKS FAILED: " + $fail)
exit 1
