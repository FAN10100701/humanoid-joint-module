# ============================================================
# X1 large STL mesh simplification (vertex clustering)
# Method: quantize vertices into a uniform grid, merge vertices
#         per cell to their average, drop triangles whose three
#         corners collapse into the same cell. Outer silhouette
#         is preserved; tiny internal details are discarded.
# Originals are backed up to the user folder before overwrite.
# Then .gz versions are regenerated for the web page.
# ============================================================
Add-Type -AssemblyName System.IO.Compression

$src = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

public static class StlSimplifier
{
    // Binary STL: 80-byte header + uint32 triCount + per-tri 50 bytes
    // (normal 3f + vertex 3x3f + uint16 attr)
    public static byte[] Simplify(byte[] data, int gridN)
    {
        if (data == null || data.Length < 84) return null;
        uint triCount = BitConverter.ToUInt32(data, 80);
        if ((long)84 + (long)triCount * 50 != data.Length) return null; // not binary STL

        // ---- read all triangle corners ----
        long n = triCount;
        float[] vx = new float[n * 3], vy = new float[n * 3], vz = new float[n * 3];
        float minx = float.MaxValue, miny = float.MaxValue, minz = float.MaxValue;
        float maxx = float.MinValue, maxy = float.MinValue, maxz = float.MinValue;
        for (long t = 0; t < n; t++)
        {
            int baseOff = 84 + (int)(t * 50) + 12; // skip normal (12 bytes)
            for (int c = 0; c < 3; c++)
            {
                int off = baseOff + c * 12;
                float x = BitConverter.ToSingle(data, off);
                float y = BitConverter.ToSingle(data, off + 4);
                float z = BitConverter.ToSingle(data, off + 8);
                long idx = t * 3 + c;
                vx[idx] = x; vy[idx] = y; vz[idx] = z;
                if (x < minx) minx = x; if (x > maxx) maxx = x;
                if (y < miny) miny = y; if (y > maxy) maxy = y;
                if (z < minz) minz = z; if (z > maxz) maxz = z;
            }
        }

        // ---- pass 1: accumulate vertices per grid cell ----
        float sx = Math.Max(maxx - minx, 1e-9f);
        float sy = Math.Max(maxy - miny, 1e-9f);
        float sz = Math.Max(maxz - minz, 1e-9f);
        // cell id = ix + iy*gridN + iz*gridN^2  (fits in long)
        Dictionary<long, float[]> cellSum = new Dictionary<long, float[]>();
        Dictionary<long, int> cellCnt = new Dictionary<long, int>();
        long[] cellId = new long[n * 3];
        for (long i = 0; i < n * 3; i++)
        {
            int ix = (int)Math.Min(gridN - 1, (int)((vx[i] - minx) / sx * gridN));
            int iy = (int)Math.Min(gridN - 1, (int)((vy[i] - miny) / sy * gridN));
            int iz = (int)Math.Min(gridN - 1, (int)((vz[i] - minz) / sz * gridN));
            long id = (long)ix + (long)iy * gridN + (long)iz * gridN * gridN;
            cellId[i] = id;
            float[] s;
            if (!cellSum.TryGetValue(id, out s))
            {
                cellSum[id] = new float[] { vx[i], vy[i], vz[i] };
                cellCnt[id] = 1;
            }
            else { s[0] += vx[i]; s[1] += vy[i]; s[2] += vz[i]; cellCnt[id]++; }
        }
        // representative point of each cell = average of its vertices
        Dictionary<long, float[]> cellRep = new Dictionary<long, float[]>(cellSum.Count);
        foreach (var kv in cellSum)
        {
            int c = cellCnt[kv.Key];
            cellRep[kv.Key] = new float[] { kv.Value[0] / c, kv.Value[1] / c, kv.Value[2] / c };
        }

        // ---- pass 2: rebuild triangles, drop degenerate ones ----
        // a triangle is dropped when its 3 corners fall into the same cell
        List<byte> outBytes = new List<byte>((int)(n * 25));
        for (long t = 0; t < n; t++)
        {
            long a = cellId[t * 3], b = cellId[t * 3 + 1], c2 = cellId[t * 3 + 2];
            if (a == b && b == c2) continue; // fully collapsed, skip
            float[] pa = cellRep[a], pb = cellRep[b], pc = cellRep[c2];
            // face normal from cross product of the simplified triangle's edges
            // (e1*/e2* edge vectors, fn* face normal; renamed to avoid clashing
            //  with the vertex arrays vx/vy/vz declared earlier in this method)
            float e1x = pb[0] - pa[0], e1y = pb[1] - pa[1], e1z = pb[2] - pa[2];
            float e2x = pc[0] - pa[0], e2y = pc[1] - pa[1], e2z = pc[2] - pa[2];
            float fnx = e1y * e2z - e1z * e2y, fny = e1z * e2x - e1x * e2z, fnz = e1x * e2y - e1y * e2x;
            float len = (float)Math.Sqrt(fnx * fnx + fny * fny + fnz * fnz);
            if (len > 1e-12f) { fnx /= len; fny /= len; fnz /= len; }
            outBytes.AddRange(BitConverter.GetBytes(fnx)); // normal.x
            outBytes.AddRange(BitConverter.GetBytes(fny)); // normal.y
            outBytes.AddRange(BitConverter.GetBytes(fnz)); // normal.z
            outBytes.AddRange(BitConverter.GetBytes(pa[0])); outBytes.AddRange(BitConverter.GetBytes(pa[1])); outBytes.AddRange(BitConverter.GetBytes(pa[2]));
            outBytes.AddRange(BitConverter.GetBytes(pb[0])); outBytes.AddRange(BitConverter.GetBytes(pb[1])); outBytes.AddRange(BitConverter.GetBytes(pb[2]));
            outBytes.AddRange(BitConverter.GetBytes(pc[0])); outBytes.AddRange(BitConverter.GetBytes(pc[1])); outBytes.AddRange(BitConverter.GetBytes(pc[2]));
            outBytes.AddRange(BitConverter.GetBytes((ushort)0)); // attribute
        }

        uint outCount = (uint)(outBytes.Count / 50);
        byte[] result = new byte[84 + outBytes.Count];
        Array.Copy(data, 0, result, 0, 80); // keep original header
        Array.Copy(BitConverter.GetBytes(outCount), 0, result, 80, 4);
        outBytes.ToArray().CopyTo(result, 84);
        return result;
    }
}
'@
Add-Type -TypeDefinition $src -Language CSharp

# ---- tunable parameters ----
$GRID = 96         # cluster grid for outer visible parts: keep silhouette
$GRID_INNER = 24   # extra-coarse grid for internal rolling parts (wrist balls, invisible outside)
$MIN_MB = 0.9      # only simplify files larger than this

$x1dir = 'd:\HuaweiMoveData\Users\亓剑清\Desktop\人形机器人关节模组\00_解剖式知识可视化\models\x1'
$backup = 'c:\Users\亓剑清\STL减面备份\x1'
if (!(Test-Path $backup)) { New-Item -ItemType Directory -Path $backup -Force | Out-Null }

# read originals from backup folder (backup was made in the first run)
$targets = Get-ChildItem $backup -File | Where-Object { $_.Extension -match '^\.stl$' -and $_.Length -gt ($MIN_MB * 1MB) }
$origSum = 0; $newSum = 0
foreach ($f in $targets) {
    $origSum += $f.Length
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    # internal rolling-ball parts get the extra-coarse grid (invisible from outside)
    $g = if ($f.Name -match 'ball') { $GRID_INNER } else { $GRID }
    $out = [StlSimplifier]::Simplify($bytes, $g)
    if ($out -eq $null) { Write-Host ("SKIP (not binary STL): " + $f.Name); continue }
    $dstStl = Join-Path $x1dir $f.Name
    [System.IO.File]::WriteAllBytes($dstStl, $out)
    # regenerate .gz for this file (from the simplified output)
    $gzPath = $dstStl + '.gz'
    $in = [System.IO.File]::OpenRead($dstStl)
    $gzs = [System.IO.File]::Create($gzPath)
    $gz = New-Object System.IO.Compression.GZipStream($gzs, [System.IO.Compression.CompressionLevel]::Optimal)
    $in.CopyTo($gz); $gz.Dispose(); $in.Dispose(); $gzs.Dispose()
    $newSum += $out.Length
    $pct = [math]::Round($out.Length * 100.0 / $bytes.Length, 1)
    Write-Host ("{0,-34} {1,8:N2}MB -> {2,7:N2}MB  ({3}%)" -f $f.Name, ($bytes.Length / 1MB), ($out.Length / 1MB), $pct)
}
Write-Host ("TOTAL: {0:N1}MB -> {1:N1}MB (ratio {2}%)" -f ($origSum / 1MB), ($newSum / 1MB), [math]::Round($newSum * 100.0 / $origSum, 1))
