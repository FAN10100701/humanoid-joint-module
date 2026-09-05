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
  $_.FullName -notmatch 'edge_prof|node_modules|\.git' -and $_.FullName -notmatch '\\_' -and
  -not ($_.Name -eq 'index.html' -and $_.Directory.Parent.FullName -eq $root)   # 板块根目录的重定向 index.html 排除
}
# pages that intentionally have no search-index entry (404 page + 05 redirect stubs + baidu verify file)
# NOTE: keep this file ASCII-safe (PS 5.1 reads BOM-less UTF-8 as ANSI/GBK, Chinese chars get mangled)
$indexablePages = $pages | Where-Object {
  $_.Name -ne '404.html' -and $_.FullName -notlike '*\05_HdriveV2*' -and $_.Name -notlike 'baidu_verify*'
}

# ---- 1) JS syntax ----
$synFail = 0
foreach($f in $pages){
  $content = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
  $pattern = '(?s)<script(?![^>]*\bsrc=)(?![^>]*type\s*=\s*["'']application/(?:ld\+json|json)["''])(?![^>]*type\s*=\s*["'']importmap["''])[^>]*>(.*?)</script>'
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
Check ("JS syntax (pages=" + $pages.Count + ")") ($synFail -eq 0) ($synFail.ToString() + " failed blocks")  # V2.1.17: 首参加括号——此前 PowerShell 参数解析使 OK 条件变成 $pages.Count(恒真),语法检查形同虚设

# ---- 1b) external JS files syntax (site.js etc.) ----
# 按 ES module 检查(复制到临时 .mjs,兼容 import 语法的 .js 文件)
$jsFail = 0
$jsFiles = Get-ChildItem -Path $root -Recurse -File -Include *.js | Where-Object {
  $_.FullName -notmatch 'edge_prof|node_modules|\.git' -and $_.FullName -notmatch '\\_本地工具\\'
}
$jsTmp = Join-Path $env:TEMP ("js_mod_check_" + [guid]::NewGuid().ToString('N') + ".mjs")
foreach($j in $jsFiles){
  $content = [IO.File]::ReadAllText($j.FullName, [Text.Encoding]::UTF8)
  [IO.File]::WriteAllText($jsTmp, $content, (New-Object System.Text.UTF8Encoding($false)))
  $out = & node --check $jsTmp 2>&1
  if($LASTEXITCODE -ne 0){ $jsFail++; Write-Host ("  JS-FILE: " + $j.FullName.Substring($root.Length+1)) }
}
Remove-Item -Force $jsTmp -ErrorAction SilentlyContinue
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
# sw.js CACHE name must follow site version (e.g. V2.0.9 -> hrl-site-v2.0.9)
$swContent = [IO.File]::ReadAllText((Join-Path $root "sw.js"), [Text.Encoding]::UTF8)
$swCache = [regex]::Match($swContent, 'var\s+CACHE\s*=\s*"hrl-site-v([^"]+)"').Groups[1].Value
$verNum = ($ver -split '\(')[0] -replace '^V',''
Check "sw.js CACHE follows version" ($swCache -eq $verNum) ("cache=" + $swCache + " ver=" + $verNum)
# V2.1.14: README version line + sw.js header comment also follow site version
# (both drifted once in V2.1.13 era; no Chinese literals here - build from code points, PS5.1 GBK-safe)
$zuixinbanben = [string]::Join('', [char]0x6700, [char]0x65B0, [char]0x7248, [char]0x672C)
$banben = [string]::Join('', [char]0x7248, [char]0x672C)
$verShort = ($ver -split '\(')[0]
$readme = [IO.File]::ReadAllText((Join-Path $root "README.md"), [Text.Encoding]::UTF8)
$rmVer = [regex]::Match($readme, [regex]::Escape($zuixinbanben) + '\s*\*\*(V[^*]+)\*\*').Groups[1].Value
Check "README version follows site" ($rmVer -eq $verShort) ("readme=" + $rmVer + " ver=" + $verShort)
$swHead = [regex]::Match($swContent, [regex]::Escape($banben) + ':\s*(V[0-9][0-9.]*)').Groups[1].Value
Check "sw.js header follows version" ($swHead -eq $verShort) ("swhead=" + $swHead + " ver=" + $verShort)
# ---- 5b) V2.1.14 fog guard: a bare html:not([data-theme-early...]) selector (no descendant)
# whose block sets opacity would paint the WHOLE root translucent (the "fog" bug).
$root2 = (Get-Location).Path
$toolsDir2 = [string]::Join('', [char]0x672C, [char]0x5730, [char]0x5DE5, [char]0x5177)
$d3dir2 = '00_3D' + [string]::Join('', [char]0x89E3, [char]0x5256)
$scanFiles = Get-ChildItem -Path $root2 -Recurse -Include *.html,*.css,*.js -File | Where-Object {
  $p = $_.FullName
  ($p -notmatch '\\lib\\') -and ($_.Name -notmatch '\.min\.') -and
  ($p -notmatch ('\\' + $toolsDir2 + '\\')) -and ($p -notmatch '\\\.git\\') -and
  ($p -notmatch '\\\.zcode\\') -and ($p -notmatch ('\\' + $d3dir2 + '\\'))
}
$bareRe = 'html:not\(\[data-theme-early=(?:"dark"|dark|''dark'')\]\)\s*\{[^}]*opacity'
$bareHits = 0
foreach($bf in $scanFiles){
  $bt = [IO.File]::ReadAllText($bf.FullName, [Text.Encoding]::UTF8)
  $bareHits += [regex]::Matches($bt, $bareRe).Count
}
Check "Root fog guard (bare selector + opacity)" ($bareHits -eq 0) ("hits=" + $bareHits)

# ---- 6) quiz/glossary data sync (data files vs display pages) ----
# NOTE: no Chinese literals here - PS 5.1 reads BOM-less UTF-8 scripts as GBK and mangles them
$quizBank = [IO.File]::ReadAllText((Join-Path $root "_assets\quiz-bank.js"), [Text.Encoding]::UTF8)
$quizPage = $pages | Where-Object { $_.FullName -match '\\08_[^\\]*\\03_[^\\]*\.html$' } | Select-Object -First 1
$gh1 = 0
$qbCount = [regex]::Matches($quizBank, '\bq:"').Count
if($quizPage){
  $quizHtml = [IO.File]::ReadAllText($quizPage.FullName, [Text.Encoding]::UTF8)
  if($quizHtml -match 'data-runtime-quiz'){ $gh1 = $qbCount }   # V2.1.4 runtime-rendered page: single source
  else { $gh1 = [regex]::Matches($quizHtml, 'class="quiz-q"').Count }
}
Check "Quiz bank sync" (($qbCount -eq $gh1) -and ($gh1 -gt 0)) ($qbCount.ToString() + " vs " + $gh1)
$glossJs = [IO.File]::ReadAllText((Join-Path $root "_assets\glossary-tip.js"), [Text.Encoding]::UTF8)
$glossPage = $pages | Where-Object { $_.FullName -match '\\08_[^\\]*\\01_[^\\]*\.html$' } | Select-Object -First 1
$gh2 = 0
if($glossPage){ $glossHtml = [IO.File]::ReadAllText($glossPage.FullName, [Text.Encoding]::UTF8); $gh2 = [regex]::Matches($glossHtml, 'class="term-card"').Count }
$gjCount = [regex]::Matches($glossJs, '(?m)^\s*"[^"]+":\s*"').Count
Check "Glossary tips <= dict page" (($gjCount -le $gh2) -and ($gjCount -gt 0)) ($gjCount.ToString() + " vs " + $gh2)

# ---- 7) pageId vs page-meta / SITE_SECTIONS ----
$metaContent = [IO.File]::ReadAllText((Join-Path $root "_assets\page-meta.js"), [Text.Encoding]::UTF8)
$metaKeys = [regex]::Matches($metaContent, '"(\d\d-\d\d)":\s*\{') | ForEach-Object { $_.Groups[1].Value }
$pageIds = @()
foreach($p in $indexablePages){
  $c = [IO.File]::ReadAllText($p.FullName, [Text.Encoding]::UTF8)
  $m = [regex]::Match($c, 'pageId:\s*"(\d\d-\d\d)"')
  if($m.Success){ $pageIds += $m.Groups[1].Value }
}
$missingMeta = $pageIds | Where-Object { $_ -notin $metaKeys }
$orphanMeta = $metaKeys | Where-Object { $_ -notin $pageIds }
Check "pageId vs page-meta" (($missingMeta.Count -eq 0) -and ($orphanMeta.Count -eq 0)) (("meta=" + $metaKeys.Count) + " pages=" + $pageIds.Count)
$missingMeta | Select-Object -First 8 | ForEach-Object { Write-Host "   META-MISSING: $_" }
$orphanMeta | Select-Object -First 8 | ForEach-Object { Write-Host "   META-ORPHAN: $_" }
$secSecFile = Join-Path $root "_assets\site-sections.js"
if(Test-Path $secSecFile){ $secContent = [IO.File]::ReadAllText($secSecFile, [Text.Encoding]::UTF8) } else { $secContent = [IO.File]::ReadAllText((Join-Path $root "index.html"), [Text.Encoding]::UTF8) }
$secIds = [regex]::Matches($secContent, '"(\d\d-\d\d)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
$secOnly = $secIds | Where-Object { $_ -notin $metaKeys }
Check "SITE_SECTIONS vs page-meta" ($secOnly.Count -eq 0) (("sections=" + $secIds.Count) + " meta=" + $metaKeys.Count)
$secOnly | Select-Object -First 8 | ForEach-Object { Write-Host "   SECTION-ONLY: $_" }

# ---- 8) interview/quest data files vs display pages (V2.0.9) ----
# item ids look like 'zkl-01' (contain a dash); subject ids like 'zkl' do not.
# NOTE: no Chinese literals in this .ps1 (PS 5.1 GBK pitfall) - match pages via $pages regex
$ibA = [IO.File]::ReadAllText((Join-Path $root "_assets\ib-data-a.js"), [Text.Encoding]::UTF8)
$ibB = [IO.File]::ReadAllText((Join-Path $root "_assets\ib-data-b.js"), [Text.Encoding]::UTF8)
$ibC = [IO.File]::ReadAllText((Join-Path $root "_assets\ib-data-c.js"), [Text.Encoding]::UTF8)
# V2.1.7 fix: ib-data-c (added in V2.1.6) was missing from the count -> 117 vs 150 false FAIL
$ibCount = ([regex]::Matches($ibA, "\{ id:'[a-z]+-\d+'") + [regex]::Matches($ibB, "\{ id:'[a-z]+-\d+'") + [regex]::Matches($ibC, "\{ id:'[a-z]+-\d+'")).Count
$ibPage = $pages | Where-Object { $_.FullName -match '\\08_[^\\]*\\11_[^\\]*\.html$' } | Select-Object -First 1
$ibPageHas = $false
$ibDecl = "?"
if($ibPage){
  $ibHtml = [IO.File]::ReadAllText($ibPage.FullName, [Text.Encoding]::UTF8)
  $m = [regex]::Match($ibHtml, '(\d{2,3})\D{0,4}?\u9898')   # NNN + CJK char for "ti"
  if(-not $m.Success){ $m = [regex]::Match($ibHtml, '\x9898|(\d{2,3})') }
  if($m.Success -and $m.Groups[1].Value){ $ibDecl = $m.Groups[1].Value }
  $ibPageHas = ($ibDecl -eq [string]$ibCount)
}
Check "Interview bank sync" $ibPageHas ("ib-items=" + $ibCount + " page-declared=" + $ibDecl)
$qst = [IO.File]::ReadAllText((Join-Path $root "_assets\quest-data.js"), [Text.Encoding]::UTF8)
$lvCount = [regex]::Matches($qst, "\{ id:'[A-Z][A-Z0-9]*',\s*w:").Count
$qPage = $pages | Where-Object { $_.FullName -match '\\08_[^\\]*\\12_[^\\]*\.html$' } | Select-Object -First 1
$qPageHas = $false
if($qPage){
  $qHtml = [IO.File]::ReadAllText($qPage.FullName, [Text.Encoding]::UTF8)
  # CJK char for "guan" after the count, e.g. 21 + guan
  $qPageHas = $qHtml -match (([string]$lvCount) + "\s*\u5173")
}
Check "Quest levels sync" $qPageHas ("levels=" + $lvCount + " page-mentions-match=" + $qPageHas)

# ---- 9) C1: <script> tag balance (V2.1.7: unclosed/residue script tag guard) ----
$tagFail = @()
foreach($f in $pages){
  $c = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
  $openTags = [regex]::Matches($c, '<script\b').Count
  # count escaped <\/script> too: document.write('<script...><\/script>') templates (importmap fallback)
  $closeTags = ([regex]::Matches($c, '</script>') + [regex]::Matches($c, '<\\/script>')).Count
  if($openTags -ne $closeTags){ $tagFail += ($f.Name + " open=" + $openTags + " close=" + $closeTags) }
}
Check "C1 script tag balance" ($tagFail.Count -eq 0) ($tagFail.Count.ToString() + " unbalanced files")
$tagFail | Select-Object -First 6 | ForEach-Object { Write-Host "   SCRIPT-TAG: $_" }

# ---- 10) C2: KaTeX loader single source (V2.1.7) ----
# The ONLY KaTeX CDN list must live in site.js (KatexLoader). Pages and other JS
# files must not embed their own katex CDN urls (drift guard: ai-assistant.js and
# quest page both regressed to npmmirror single-source once already).
$katexCdn = '(npmmirror\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)[^"''\s>]*katex'
$katexStray = @()
foreach($f in $pages){
  $c = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
  if($c -match $katexCdn){ $katexStray += $f.Name }
}
foreach($j in $jsFiles){
  if($j.Name -ieq 'site.js'){ continue }
  $c = [IO.File]::ReadAllText($j.FullName, [Text.Encoding]::UTF8)
  if($c -match $katexCdn){ $katexStray += $j.Name }
}
$katJsCnt = [regex]::Matches($siteJs, 'katex\.min\.js').Count
$katCssCnt = [regex]::Matches($siteJs, 'katex\.min\.css').Count
$katOk = (($siteJs -match 'KatexLoader') -and ($katJsCnt -ge 4) -and ($katCssCnt -ge 4) -and ($katexStray.Count -eq 0))
Check "C2 KaTeX loader single-source" $katOk ("site.js js=" + $katJsCnt + " css=" + $katCssCnt + " stray=" + $katexStray.Count)
$katexStray | Select-Object -First 6 | ForEach-Object { Write-Host "   KATEX-STRAY: $_" }

# ---- 11) C3: SITE_STATS vs real ib-data counts (V2.1.7) ----
$ibItemRe = "\{ id:'[a-z]+-\d+'"
$ibSubjRe = "\{ id:'[a-z]+', name:"
$ibTotal = ([regex]::Matches($ibA, $ibItemRe) + [regex]::Matches($ibB, $ibItemRe) + [regex]::Matches($ibC, $ibItemRe)).Count
$ibSubj = ([regex]::Matches($ibA, $ibSubjRe) + [regex]::Matches($ibB, $ibSubjRe) + [regex]::Matches($ibC, $ibSubjRe)).Count
$statsM = [regex]::Match($siteJs, 'S\.STATS\s*=\s*\{[^}]*ibSubjects:\s*(\d+)[^}]*ibItems:\s*(\d+)')
$stOk = $statsM.Success -and ([int]$statsM.Groups[1].Value -eq $ibSubj) -and ([int]$statsM.Groups[2].Value -eq $ibTotal)
Check "C3 SITE_STATS vs ib-data" $stOk ("stats=" + $statsM.Groups[1].Value + "subj/" + $statsM.Groups[2].Value + "items real=" + $ibSubj + "subj/" + $ibTotal + "items")

# ---- 12) C4: localStorage key prefix whitelist (V2.1.7) ----
# Allowed: humanoid-* (site data) / site-* (chrome) / robot-* (3D pages) / __t (selftest probe)
$lsKeyRe = 'localStorage\.(getItem|setItem|removeItem)\(\s*["'']([^"'']+)["'']'
$badKeys = @()
foreach($j in $jsFiles){
  $c = [IO.File]::ReadAllText($j.FullName, [Text.Encoding]::UTF8)
  foreach($m in [regex]::Matches($c, $lsKeyRe)){
    $k = $m.Groups[2].Value
    if($k -notmatch '^(humanoid-|site-|robot-|__t)'){ $badKeys += ($j.Name + " -> " + $k) }
  }
}
foreach($f in $pages){
  $c = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
  foreach($m in [regex]::Matches($c, $lsKeyRe)){
    $k = $m.Groups[2].Value
    if($k -notmatch '^(humanoid-|site-|robot-|__t)'){ $badKeys += ($f.Name + " -> " + $k) }
  }
}
Check "C4 localStorage key prefixes" ($badKeys.Count -eq 0) ($badKeys.Count.ToString() + " off-prefix keys")
$badKeys | Select-Object -First 6 | ForEach-Object { Write-Host "   LS-KEY: $_" }

# ---- 13) C5: og:description page count in sync (V2.1.7) ----
# og number == statPages placeholder == SITE_SECTIONS ids + 1 (homepage)
$ogM = [regex]::Match($index, 'og:description" content="[^"]*?(?<!\d)(\d{2,3})(?!\d)')
$ogPages = if($ogM.Success){ [int]$ogM.Groups[1].Value } else { -1 }
$phM = [regex]::Match($index, 'id="statPages">(\d+)<')
$phPages = if($phM.Success){ [int]$phM.Groups[1].Value } else { -2 }
$c5ok = ($ogPages -eq $phPages) -and ($phPages -eq ($secIds.Count + 1))
Check "C5 og pages count sync" $c5ok ("og=" + $ogPages + " placeholder=" + $phPages + " sections+1=" + ($secIds.Count + 1))

# ---- 14) C6: 3D engine local lib path guard (V2.1.17, AUDIT A-35) ----
# dynamic import() resolves relative to the MODULE url (js/app.module.js), so LOC must be '../lib/'
# ('./lib/' would request js/lib/ -> 404, silently masked by the CDN fallback chain)
$d3dir3 = '00_3D' + [string]::Join('', [char]0x89E3, [char]0x5256)
$c6file = Join-Path $root (Join-Path $d3dir3 ("js" + [char]92 + "app.module.js"))
$c6ok = $false; $c6detail = "file missing"
if(Test-Path $c6file){
  $c6content = [IO.File]::ReadAllText($c6file, [Text.Encoding]::UTF8)
  $c6m = [regex]::Match($c6content, "var LOC='([^']+)'")
  if($c6m.Success){
    $c6ok = ($c6m.Groups[1].Value -eq '../lib/')
    $c6detail = "LOC='" + $c6m.Groups[1].Value + "' (expect ../lib)"
  } else { $c6detail = "LOC declaration not found" }
}
Check "C6 3D engine lib path" $c6ok $c6detail

# ---- 15) C7: privacy scan before deploy (V2.1.18) ----
# delegates to node script (cross-env reliable): API-key shapes / win user paths / private IPs / unknown emails / mobiles
# (path built from char codes: "_本地工具/检查隐私.js" — ASCII-safe for PS5.1 GBK)
$c7dir = Join-Path $root ("_" + [string]::Join('', [char]0x672C, [char]0x5730, [char]0x5DE5, [char]0x5177))
$c7js = Join-Path $c7dir ([string]::Join('', [char]0x68C0, [char]0x67E5, [char]0x9690, [char]0x79C1) + '.js')
$c7ok = $false; $c7detail = "script missing"
if(Test-Path $c7js){
  $c7out = & node $c7js 2>&1
  $c7ok = ($LASTEXITCODE -eq 0)
  $c7detail = ([string]($c7out | Select-Object -Last 1))
}
Check "C7 privacy scan" $c7ok $c7detail

# ---- 16) C8: dedup guard for esc/loadScript (V2.1.18, AUDIT A-22) ----
# quiz/quest pages must NOT re-declare function esc( / function loadScript( — they now reference Site.esc / Site.loadScript
$c8bad = @()
foreach($f in $pages){
  if($f.Name -notlike '11_*' -and $f.Name -notlike '12_*'){ continue }
  $c = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
  if($c -match 'function\s+esc\s*\('){ $c8bad += ($f.Name + " re-declares esc()") }
  if($c -match 'function\s+loadScript\s*\('){ $c8bad += ($f.Name + " re-declares loadScript()") }
}
Check "C8 esc/loadScript dedup" ($c8bad.Count -eq 0) ($c8bad.Count.ToString() + " re-declarations")
$c8bad | Select-Object -First 4 | ForEach-Object { Write-Output ("   DUP: " + $_) }



# ---- C9: path-data integrity (path layer) ----
$pdRoot = (Get-Location).Path
$pdFile = Join-Path $pdRoot "_assets\path-data.js"
$pdOk = $false; $pdDetail = "file missing"
if(Test-Path $pdFile){
  $pdContent = [IO.File]::ReadAllText($pdFile, [Text.Encoding]::UTF8)
  $pdIds = @([regex]::Matches($pdContent, 'id:\s*"(\d\d-\d\d)"') | ForEach-Object { $_.Groups[1].Value })
  $pdSecContent = [IO.File]::ReadAllText((Join-Path $pdRoot "_assets\site-sections.js"), [Text.Encoding]::UTF8)
  $pdSecIds = [regex]::Matches($pdSecContent, '"(\d\d-\d\d)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
  $pdMissing = @($pdIds | Where-Object { $_ -notin $pdSecIds })
  $pdDup = 0
  $pdChunks = [regex]::Split($pdContent, 'id:\s*"p-[a-z]+"') | Where-Object { $_ -match 'stages' }
  foreach($ck in $pdChunks){
    $idsIn = @([regex]::Matches($ck, 'id:\s*"(\d\d-\d\d)"') | ForEach-Object { $_.Groups[1].Value })
    if($idsIn.Count -ne ($idsIn | Sort-Object -Unique).Count){ $pdDup++ }
  }
  $pdOk = (($pdMissing.Count -eq 0) -and ($pdDup -eq 0) -and ($pdIds.Count -ge 30))
  $pdDetail = "ids=" + $pdIds.Count + " missing=" + $pdMissing.Count + " dupInPath=" + $pdDup
}
Check "C9 path-data integrity" $pdOk $pdDetail

Write-Host ""
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED"; exit 0 }
Write-Host ("CHECKS FAILED: " + $fail)
exit 1
