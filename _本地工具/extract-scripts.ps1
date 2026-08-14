# Extract all inline <script> blocks from HTML and bracket-check them
param([string]$HtmlFile, [string]$TmpJs)
$html = [System.IO.File]::ReadAllText($HtmlFile)
$re = [regex]'(?s)<script(?![^>]*src)[^>]*>(.*?)</script>'
$buf = New-Object System.Text.StringBuilder
foreach ($m in $re.Matches($html)) {
    [void]$buf.AppendLine($m.Groups[1].Value)
}
[System.IO.File]::WriteAllText($TmpJs, $buf.ToString())
Write-Host ("extracted " + $re.Matches($html).Count + " script blocks, " + $buf.Length + " chars")
