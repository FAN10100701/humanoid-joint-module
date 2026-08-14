# Validate all X1 STL files (binary structure) and check .gz consistency
$x1 = 'd:\HuaweiMoveData\Users\亓剑清\Desktop\人形机器人关节模组\00_解剖式知识可视化\models\x1'
Add-Type -AssemblyName System.IO.Compression

$bad = 0
$total = 0
foreach ($f in (Get-ChildItem $x1 -File | Where-Object { $_.Extension -match '^\.stl$' })) {
    $total++
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $issues = @()
    # 1. structure: 84 + triCount*50 == file length
    if ($bytes.Length -lt 84) { $issues += 'too small' }
    else {
        $tri = [BitConverter]::ToUInt32($bytes, 80)
        if (84 + [long]$tri * 50 -ne $bytes.Length) { $issues += "len mismatch (tri=$tri len=$($bytes.Length))" }
        # 2. NaN / Inf scan + bbox (base + offset addressing, no pointer advance)
        $minx=[double]::MaxValue;$maxx=[double]::MinValue
        $miny=[double]::MaxValue;$maxy=[double]::MinValue
        $minz=[double]::MaxValue;$maxz=[double]::MinValue
        $nan = 0
        $triRead = [Math]::Min($tri, [uint32](($bytes.Length - 84) / 50))
        for ($t = 0; $t -lt $triRead; $t++) {
            $base = 84 + $t * 50 + 12   # skip 12-byte normal
            for ($v = 0; $v -lt 3; $v++) {
                $off = $base + $v * 12
                $x = [BitConverter]::ToSingle($bytes, $off)
                $y = [BitConverter]::ToSingle($bytes, $off+4)
                $z = [BitConverter]::ToSingle($bytes, $off+8)
                if ([single]::IsNaN($x) -or [single]::IsNaN($y) -or [single]::IsNaN($z) -or [single]::IsInfinity($x) -or [single]::IsInfinity($y) -or [single]::IsInfinity($z)) { $nan++; continue }
                if ($x -lt $minx){$minx=$x}; if ($x -gt $maxx){$maxx=$x}
                if ($y -lt $miny){$miny=$y}; if ($y -gt $maxy){$maxy=$y}
                if ($z -lt $minz){$minz=$z}; if ($z -gt $maxz){$maxz=$z}
            }
        }
        if ($nan -gt 0) { $issues += "NaN/Inf vertices: $nan" }
        if ($minx -ne [double]::MaxValue -and ($maxx - $minx -gt 10 -or $maxy - $miny -gt 10 -or $maxz - $minz -gt 10)) {
            $issues += ("suspicious bbox " + [math]::Round($maxx-$minx,3) + "x" + [math]::Round($maxy-$miny,3) + "x" + [math]::Round($maxz-$minz,3))
        }
        # 4. normal check: first 5 triangles must have non-zero face normals
        $zeroNorm = 0
        $nCheck = [Math]::Min(5, [int]$triRead)
        for ($t = 0; $t -lt $nCheck; $t++) {
            $off = 84 + $t * 50
            $n1 = [BitConverter]::ToSingle($bytes, $off); $n2 = [BitConverter]::ToSingle($bytes, $off+4); $n3 = [BitConverter]::ToSingle($bytes, $off+8)
            if ([Math]::Abs($n1) + [Math]::Abs($n2) + [Math]::Abs($n3) -lt 1e-6) { $zeroNorm++ }
        }
        if ($zeroNorm -eq $nCheck -and $nCheck -gt 0) { $issues += "all sampled face normals are zero" }
    }
    # 3. gz consistency: decompress .gz and compare byte-for-byte
    $gz = $f.FullName + '.gz'
    if (Test-Path $gz) {
        try {
            $fs = [System.IO.File]::OpenRead($gz)
            $gzs = New-Object System.IO.Compression.GZipStream($fs, [System.IO.Compression.CompressionMode]::Decompress)
            $ms = New-Object System.IO.MemoryStream
            $gzs.CopyTo($ms); $gzs.Dispose(); $fs.Dispose()
            $raw = $ms.ToArray()
            if ($raw.Length -ne $bytes.Length) { $issues += "gz size mismatch ($($raw.Length) vs $($bytes.Length))" }
            else {
                $diff = 0
                for ($i = 0; $i -lt $bytes.Length; $i++) { if ($raw[$i] -ne $bytes[$i]) { $diff++; if ($diff -gt 100) { break } } }
                if ($diff -gt 0) { $issues += "gz content differs (diff bytes: $diff)" }
            }
        } catch { $issues += "gz read error: $($_.Exception.Message)" }
    } else { $issues += 'gz missing' }

    if ($issues.Count -gt 0) {
        $bad++
        Write-Host ("BAD  {0}: {1}" -f $f.Name, ($issues -join '; '))
    }
}
Write-Host ("Checked {0} STL files, {1} bad" -f $total, $bad)
