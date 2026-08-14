# Full repro: load the exact C# from the main script file, run Simplify on one file
$main = 'd:\HuaweiMoveData\Users\亓剑清\Desktop\人形机器人关节模组\_本地工具\X1大零件减面.ps1'
$content = [System.IO.File]::ReadAllText($main, [System.Text.Encoding]::UTF8)
# extract the here-string between @' and '@
$sIdx = $content.IndexOf("@'")
$eIdx = $content.IndexOf("'@", $sIdx + 2)
$cs = $content.Substring($sIdx + 2, $eIdx - $sIdx - 2)
Write-Host ("C# extracted: " + $cs.Length + " chars")
Write-Host ("C# first line: " + ($cs -split "`n")[0])
Add-Type -TypeDefinition $cs -Language CSharp
Write-Host "Add-Type OK"

$b = 'c:\Users\亓剑清\STL减面备份\x1'
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $b 'right_shoulder_yaw.STL'))
Write-Host ("input: " + $bytes.Length + " bytes")
$out = [StlSimplifier]::Simplify($bytes, 96)
if ($null -eq $out) { Write-Host "Simplify returned NULL" }
else { Write-Host ("Simplify OK: " + $out.Length + " bytes") }
