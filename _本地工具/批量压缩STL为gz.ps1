# ============================================================
# Batch compress all STL files under models/ to same-name .gz
# Purpose: shrink ~77MB STL models to ~1/3 size; the web page
#          decompresses them with DecompressionStream.
# Safe to re-run: existing .gz files are regenerated.
# ============================================================
Add-Type -AssemblyName System.IO.Compression

# models root (script is in _local tools folder, repo root is parent)
$root = Join-Path $PSScriptRoot "..\00_解剖式知识可视化\models"
$root = [System.IO.Path]::GetFullPath($root)

Write-Host "Scan dir: $root"

# collect all STL files (skip _download_test folder)
$files = Get-ChildItem $root -Recurse -File | Where-Object {
    $_.Extension -match '^\.stl$' -and $_.DirectoryName -notmatch '_download_test'
}

$origTotal = 0
$compTotal = 0
$count = 0

foreach ($f in $files) {
    $gzPath = $f.FullName + ".gz"
    $origTotal += $f.Length

    # compress to same-name .gz (optimal level)
    $in = [System.IO.File]::OpenRead($f.FullName)
    $out = [System.IO.File]::Create($gzPath)
    $gz = New-Object System.IO.Compression.GZipStream($out, [System.IO.Compression.CompressionLevel]::Optimal)
    $in.CopyTo($gz)
    $gz.Dispose()
    $in.Dispose()
    $out.Dispose()

    $compTotal += (Get-Item $gzPath).Length
    $count++
}

Write-Host ("Done: {0} files" -f $count)
Write-Host ("Original: {0:N1} MB" -f ($origTotal / 1MB))
Write-Host ("Compressed: {0:N1} MB" -f ($compTotal / 1MB))
Write-Host ("Ratio: {0:N1}% (lower is better)" -f ($compTotal * 100.0 / $origTotal))
