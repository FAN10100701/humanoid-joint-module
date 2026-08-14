# Bracket balance checker with full string/comment state machine
# Usage: powershell -File check-js.ps1 <file.js>
param([string]$File)
$src = [System.IO.File]::ReadAllText($File)
$stack = New-Object System.Collections.Stack
$line = 1
$err = $null
for ($i = 0; $i -lt $src.Length; $i++) {
    $ch = $src[$i]
    if ($ch -eq "`n") { $line++ }
    # line comment
    if ($ch -eq '/' -and $i + 1 -lt $src.Length -and $src[$i+1] -eq '/') {
        while ($i -lt $src.Length -and $src[$i] -ne "`n") { $i++ }
        continue
    }
    # block comment
    if ($ch -eq '/' -and $i + 1 -lt $src.Length -and $src[$i+1] -eq '*') {
        $i += 2
        while ($i + 1 -lt $src.Length -and -not ($src[$i] -eq '*' -and $src[$i+1] -eq '/')) {
            if ($src[$i] -eq "`n") { $line++ }
            $i++
        }
        $i++
        continue
    }
    # regex literal heuristic: '/' preceded by = , : [ ! & | ? ; { ( or start,
    # AND a closing '/' exists before end-of-line (division like (fov/2) has none)
    if ($ch -eq '/') {
        $j = $i - 1
        while ($j -ge 0 -and ($src[$j] -eq ' ' -or $src[$j] -eq "`t")) { $j-- }
        $prev = if ($j -ge 0) { [string]$src[$j] } else { '' }
        $isRegex = ((',=:!&|?;{('.Contains($prev)) -and $prev -ne '') -or $prev -eq ''
        if ($isRegex) {
            $k = $i + 1
            $found = $false
            while ($k -lt $src.Length -and $src[$k] -ne "`n") {
                if ($src[$k] -eq '\') { $k += 2; continue }
                if ($src[$k] -eq '/') { $found = $true; break }
                $k++
            }
            if ($found) {
                $i++
                while ($i -lt $src.Length -and $src[$i] -ne '/') {
                    if ($src[$i] -eq '\') { $i++ }
                    $i++
                }
                continue
            }
            # no closing slash before EOL -> plain division, fall through
        }
    }
    # string literal (simple, no escape handling needed for this codebase)
    if ($ch -eq '"' -or $ch -eq "'") {
        $q = $ch
        $i++
        while ($i -lt $src.Length -and $src[$i] -ne $q) {
            if ($src[$i] -eq "`n") { $line++ }
            $i++
        }
        continue
    }
    if ($ch -eq '(' -or $ch -eq '{') { $stack.Push(@($ch, $line)) }
    if ($ch -eq ')' -or $ch -eq '}') {
        if ($stack.Count -eq 0) { $err = "line ${line}: extra closing '$ch'"; break }
        $top = $stack.Pop()
        if ($top[0] -eq '(' -and $ch -ne ')') { $err = "line $($top[1]) '(' closed by '$ch' at line $line"; break }
        if ($top[0] -eq '{' -and $ch -ne '}') { $err = "line $($top[1]) '{' closed by '$ch' at line $line"; break }
    }
}
if (-not $err -and $stack.Count -gt 0) {
    $top = $stack.Pop()
    $err = "line $($top[1]): unclosed '$($top[0])'"
}
if ($err) { Write-Host ("FAIL " + $err) } else { Write-Host "PASS: all brackets balanced" }
