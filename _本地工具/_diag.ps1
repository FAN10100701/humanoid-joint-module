$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pat = "\\08_[^\\]*\\03_[^\\]*\.html$"
$q = Get-ChildItem -Path $root -Recurse -Filter *.html | Where-Object { $_.FullName -match $pat } | Select-Object -First 1
$h = [IO.File]::ReadAllText($q.FullName, [Text.Encoding]::UTF8)
Write-Host ("len=" + $h.Length)
Write-Host ("match=" + ($h -match "data-runtime-quiz"))
Write-Host ("quizMountAt=" + $h.IndexOf("quizMount"))
