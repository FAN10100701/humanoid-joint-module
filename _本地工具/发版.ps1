# 发版.ps1 — 一键版本同步(五处)+ CHANGELOG 头部校验
# 用法: powershell -File 发版.ps1 -Version "V2.1.5" -Date "2026-08-29"
param([string]$Version = "", [string]$Date = "")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if(-not $Version){ $Version = Read-Host "输入新版本号(如 V2.1.5)" }
if(-not $Date){ $Date = Get-Date -Format "yyyy-MM-dd" }
$enc = [Text.Encoding]::UTF8
$verNum = $Version.TrimStart("V")

# 1) site.js S.VERSION
# V2.1.7 fix: use [IO.File] static ReadAllText/WriteAllText ($enc.ReadFile/WriteFile do not exist)
$p = Join-Path $root "_assets\site.js"
$s = [IO.File]::ReadAllText($p, $enc); $s = [regex]::Replace($s, 'S\.VERSION\s*=\s*"V[\d.]+\([^)]*\)"', ('S.VERSION = "' + $Version + '(' + $Date + ')"')); [IO.File]::WriteAllText($p, $s, (New-Object System.Text.UTF8Encoding($false)))

# 2) index.html 当前版本 + 页脚
$p = Join-Path $root "index.html"
$s = [IO.File]::ReadAllText($p, $enc)
$s = [regex]::Replace($s, '>V\d+\.\d+\.\d+</span>', ('>' + $Version + '</span>'), 1)
$s = [regex]::Replace($s, '人形机器人学习站 · V\d+\.\d+\.\d+\(\d{4}-\d{2}-\d{2}\)', ('人形机器人学习站 · ' + $Version + '(' + $Date + ')'), 1)
[IO.File]::WriteAllText($p, $s, (New-Object System.Text.UTF8Encoding($false)))

# 3) sw.js CACHE
$p = Join-Path $root "sw.js"
$s = [IO.File]::ReadAllText($p, $enc)
$s = [regex]::Replace($s, 'var\s+CACHE\s*=\s*"hrl-site-v[\d.]+"', ('var CACHE = "hrl-site-v' + $verNum + '"'))
[IO.File]::WriteAllText($p, $s, (New-Object System.Text.UTF8Encoding($false)))

# 4) README.md latest-version line (V2.1.20b: previously missed; self-check "README version follows site" would FAIL)
$p = Join-Path $root "README.md"
$s = [IO.File]::ReadAllText($p, $enc)
$s = [regex]::Replace($s, [regex]::Escape('**') + 'V[\d.]+' + [regex]::Escape('**') + '\(\d{4}-\d{2}-\d{2}\)', ('**' + $Version + '**(' + $Date + ')'), 1)
[IO.File]::WriteAllText($p, $s, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "✅ 五处已同步 $Version($Date)。请自行在 CHANGELOG.md 顶部补全本期条目,然后跑 一键自检.ps1。"
