<#
  Serial iteration loop - one command for the whole hardware round:
      build -> flash -> sample -> judge -> ledger
  The parsing truth source is the local serial-bridge (the same kernel the browser uses),
  so "what the AI reads" and "what the page shows" can never drift apart.

  Content is ASCII-only ON PURPOSE: PS 5.1 reads BOM-less UTF-8 as GBK and a single
  CJK comment can break the whole script (this repo has been bitten twice).

  Exit codes
    0  every judge group PASS
    1  usage / missing tool or file
    2  build failed   (auto: reflash last-good.hex when available)
    3  flash failed   (auto: reflash last-good.hex)
    4  at least one judge group FAIL
    5  round budget exhausted (bridge returned 3)

  First run - persist the machine-local settings once. They go into the git-ignored
  _data dir, which is why absolute paths are allowed there and nowhere else:

    powershell -ExecutionPolicy Bypass -File <this script> -Project <path to .uvprojx> -Save

  Later runs (a single command, no arguments):

    powershell -ExecutionPolicy Bypass -File <this script>
#>
[CmdletBinding()]
param(
  [string]$Project = "",
  [string]$Hex = "",
  [string]$Uv4 = "",
  [string]$CubeCli = "",
  [string]$Port = "",
  [int]$Baud = 0,
  [int]$Ms = 0,
  [int]$MaxRounds = 0,
  [string]$Judge = "",
  [string]$Only = "",
  [switch]$NoFlash,
  [switch]$NoBuild,
  [switch]$Save,
  [switch]$Rollback
)

$ErrorActionPreference = "Stop"

$toolsDir = $PSScriptRoot
$bridge   = Join-Path $toolsDir "serial-bridge\bridge.mjs"
$dataDir  = Join-Path $toolsDir "serial-bridge\_data"
$cfgPath  = Join-Path $dataDir "iter.json"
$ledger   = Join-Path $dataDir "iter-trials.jsonl"
$capPath  = Join-Path $dataDir "iter-cap.json"
$lastGood = Join-Path $dataDir "last-good.hex"
$buildLog = Join-Path $dataDir "build.log"

function Say([string]$m) { Write-Host $m }
function Fail([int]$code, [string]$m) { Write-Host ("ERROR: " + $m); exit $code }

if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }
if (-not (Test-Path $bridge)) { Fail 1 ("bridge not found: " + $bridge) }

# ---------------------------------------------------------------- local config
$cfg = @{}
if (Test-Path $cfgPath) {
  try {
    $j = Get-Content $cfgPath -Raw | ConvertFrom-Json
    foreach ($p in $j.PSObject.Properties) { $cfg[$p.Name] = $p.Value }
  } catch { Say ("WARN: cannot parse iter.json, ignoring it") }
}
function Cfg([string]$k, $dflt) { if ($cfg.ContainsKey($k) -and $cfg[$k]) { return $cfg[$k] } return $dflt }

if (-not $Project) { $Project = [string](Cfg "uvprojx" "") }
if (-not $Hex)     { $Hex     = [string](Cfg "hex" "") }
if (-not $Uv4)     { $Uv4     = [string](Cfg "uv4" "") }
if (-not $CubeCli) { $CubeCli = [string](Cfg "cubeCli" "") }
if (-not $Port)    { $Port    = [string](Cfg "port" "COM16") }
if ($Baud -le 0)      { $Baud      = [int](Cfg "baud" 115200) }
if ($Ms -le 0)        { $Ms        = [int](Cfg "ms" 3000) }
if ($MaxRounds -le 0) { $MaxRounds = [int](Cfg "maxRounds" 20) }
if (-not $Judge)      { $Judge     = [string](Cfg "judge" (Join-Path $toolsDir "serial-judge.json")) }

# The judge file is read FIRST, because it also declares the sampling window its
# criteria assume (a criterion like "pos.min<900; pos.max>3800" needs a window that
# covers one full step period - with a shorter window it reports FAIL on healthy
# firmware, which is exactly what happened on this script's first real run).
if (-not (Test-Path $Judge)) { Fail 1 ("judge file not found: " + $Judge) }
# Read as UTF-8 EXPLICITLY: the file carries human-readable CJK descriptions, and
# PS 5.1 would otherwise decode it as GBK - the mojibake can even produce stray
# quote characters and make ConvertFrom-Json throw.
$judgeObj = Get-Content $Judge -Raw -Encoding UTF8 | ConvertFrom-Json
$judgeMs = 0
if ($judgeObj.PSObject.Properties.Name -contains "ms") { $judgeMs = [int]$judgeObj.ms }

if ($Ms -le 0)        { $Ms        = [int](Cfg "ms" 0) }
if ($Ms -le 0)        { $Ms        = 6000 }
# The sampling window must never be SHORTER than what the criteria assume.
# A longer window can only add samples (no criterion is invalidated by it), while a
# shorter one makes a healthy firmware report FAIL - that is exactly what bit this
# script's first real run: the saved config said 3000ms and overrode the 6000ms the
# judge file declares, so "pos.min<900; pos.max>3800" failed on a good board.
if ($judgeMs -gt $Ms) { $Ms = $judgeMs; Say ("NOTE: sampling window raised to " + $Ms + "ms (required by the judge file)") }

# ------------------------------------------------- tool discovery (no machine paths)
function Find-Under([string[]]$bases, [string]$file) {
  foreach ($b in $bases) {
    if (-not (Test-Path $b)) { continue }
    $hit = Get-ChildItem -Path $b -Filter $file -Recurse -Depth 4 -File -ErrorAction SilentlyContinue |
             Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  return ""
}

function Find-Tool([string]$explicit, [string]$exeName, [string[]]$relCands, [string[]]$globBases) {
  if ($explicit) {
    if (Test-Path $explicit) { return $explicit }
    Fail 1 ("configured tool not found: " + $explicit)
  }
  $c = Get-Command $exeName -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $drives = @()
  foreach ($d in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
    if ($d.Root) { $drives += $d.Root.TrimEnd("\") }
  }
  foreach ($d in $drives) {
    foreach ($r in $relCands) {
      $p = Join-Path $d $r
      if (Test-Path $p) { return $p }
    }
  }
  $bases = @()
  foreach ($d in $drives) { foreach ($g in $globBases) { $bases += (Join-Path $d $g) } }
  return (Find-Under $bases $exeName)
}

$uv4Exe = Find-Tool $Uv4 "UV4.exe" `
  @("Keil5\UV4\UV4.exe", "Keil_v5\UV4\UV4.exe", "Program Files\Keil_v5\UV4\UV4.exe", "Program Files (x86)\Keil_v5\UV4\UV4.exe") `
  @("Keil5", "Keil_v5", "Program Files\Keil_v5")

$cubeExe = Find-Tool $CubeCli "STM32_Programmer_CLI.exe" `
  @("STM32CubeCLT\STM32CubeProgrammer\bin\STM32_Programmer_CLI.exe",
    "Program Files\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin\STM32_Programmer_CLI.exe") `
  @("STM32CubeCLT*", "ST\STM32CubeCLT*", "Program Files\STMicroelectronics")

if ($Save) {
  $out = [ordered]@{}
  if ($Project) { $out["uvprojx"] = $Project }
  if ($Hex)     { $out["hex"] = $Hex }
  if ($uv4Exe)  { $out["uv4"] = $uv4Exe }
  if ($cubeExe) { $out["cubeCli"] = $cubeExe }
  $out["port"] = $Port
  $out["baud"] = $Baud
  $out["ms"] = $Ms
  $out["maxRounds"] = $MaxRounds
  $out["judge"] = $Judge
  ($out | ConvertTo-Json) | Set-Content -Path $cfgPath -Encoding UTF8
  Say ("SAVED config -> " + $cfgPath + "  (git-ignored)")
}

# ---------------------------------------------------------------- rollback
function Invoke-Rollback([string]$why) {
  if (-not (Test-Path $lastGood)) {
    Say ("ROLLBACK: skipped (" + $why + ") - no last-good.hex yet")
    return
  }
  if (-not $cubeExe) {
    Say ("ROLLBACK: skipped (" + $why + ") - STM32_Programmer_CLI not found")
    return
  }
  Say ("ROLLBACK: reflashing last-good.hex (" + $why + ")")
  & $cubeExe -c port=SWD -w $lastGood -v -g 0x08000000 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { Say "ROLLBACK: ok - board is back on the previous firmware" }
  else { Say ("ROLLBACK: FAILED (exit " + $LASTEXITCODE + ") - board may hold an incomplete image") }
}

if ($Rollback) { Invoke-Rollback "manual"; exit 0 }

# ---------------------------------------------------------------- guards
$groups = @($judgeObj.groups | Where-Object { $_.name -and $_.expect })
if ($Only) { $groups = @($groups | Where-Object { $_.name -eq $Only }) }
if (-not $groups.Count) { Fail 1 "no judge group to run" }

$busy = @()
foreach ($n in @("UV4", "STM32 ST-LINK Utility", "STM32CubeProgrammer")) {
  $p = Get-Process -Name $n -ErrorAction SilentlyContinue
  if ($p) { $busy += ($n + "(pid " + ($p | Select-Object -First 1).Id + ")") }
}
if ($busy.Count) { Say ("NOTE: these may hold the debugger exclusively: " + ($busy -join ", ")) }

# ---------------------------------------------------------------- 1) build
if (-not $NoBuild) {
  if (-not $Project) { Fail 1 "no -Project given and none saved; run once with -Project <path.uvprojx> -Save" }
  if (-not (Test-Path $Project)) { Fail 1 ("project not found: " + $Project) }
  if (-not $uv4Exe) { Fail 1 "UV4.exe not found; pass -Uv4 <path> (and -Save to remember it)" }
  Say ("BUILD: " + (Split-Path $Project -Leaf))
  $sw = [Diagnostics.Stopwatch]::StartNew()
  & $uv4Exe -b $Project -j0 -o $buildLog 2>&1 | Out-Null
  $rc = $LASTEXITCODE
  $sw.Stop()
  $tail = ""
  if (Test-Path $buildLog) {
    $lines = @(Get-Content $buildLog | Where-Object { $_ -match "Error|Warning" })
    if ($lines.Count) { $tail = ($lines[-1]).Trim() }
  }
  Say ("BUILD: exit=" + $rc + "  " + [math]::Round($sw.Elapsed.TotalSeconds, 1) + "s  " + $tail)
  if ($rc -ge 2) {   # Keil UV4 exit code: 0=clean, 1=warnings (keep going), 2+=real failure
    Invoke-Rollback ("build exit " + $rc)
    Fail 2 ("build failed (exit " + $rc + ")")
  }
  if (-not $Hex) {
    $Hex = (Get-ChildItem -Path (Split-Path $Project -Parent) -Filter "*.hex" -Recurse -File -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  }
}

# ---------------------------------------------------------------- 2) flash
if (-not $NoFlash) {
  if (-not $Hex -or -not (Test-Path $Hex)) { Fail 1 ("hex not found: " + $Hex) }
  if (-not $cubeExe) { Fail 1 "STM32_Programmer_CLI not found; pass -CubeCli <path> (and -Save)" }
  Say ("FLASH: " + (Split-Path $Hex -Leaf) + "  (" + (Get-Item $Hex).Length + " bytes)")
  $out = & $cubeExe -c port=SWD -w $Hex -v -g 0x08000000 2>&1 | Out-String
  $rc = $LASTEXITCODE
  $okLine = ([regex]::Match($out, "Download verified successfully|File download complete|Programming Done")).Value
  Say ("FLASH: exit=" + $rc + "  " + $okLine)
  if ($rc -ne 0 -or -not $okLine) {
    Invoke-Rollback ("flash exit " + $rc)
    Fail 3 ("flash failed (exit " + $rc + ")")
  }
  Copy-Item $Hex $lastGood -Force
  Say "FLASH: saved this image as last-good.hex"
}

# ---------------------------------------------------------------- 3) sample
Say ("SAMPLE: " + $Port + " @" + $Baud + " for " + $Ms + "ms")
$readOut = & node $bridge read --ms $Ms --port $Port --baud $Baud --preset firewater --out $capPath 2>&1 | Out-String
$rc = $LASTEXITCODE
if ($rc -ne 0) { Fail 1 ("sample failed (exit " + $rc + "): " + ($readOut.Trim() -split "`n")[0]) }
$bytes = 0; $chans = ""
try {
  $j = $readOut | ConvertFrom-Json
  $bytes = $j.bytes
  $chans = (($j.channels.PSObject.Properties | ForEach-Object { $_.Name }) -join ",")
} catch { }
Say ("SAMPLE: bytes=" + $bytes + "  channels=[" + $chans + "]")

# ---------------------------------------------------------------- 4) judge + ledger
Say ("JUDGE: " + $Judge + "  (" + $groups.Count + " groups, maxRounds=" + $MaxRounds + ")")
$pass = 0; $fail = 0; $stop = $false
foreach ($g in $groups) {
  $t = & node $bridge trial append --in $capPath --expect $g.expect --note $g.name --ledger $ledger --max-rounds $MaxRounds 2>&1 | Out-String
  $rc = $LASTEXITCODE
  $verdict = "?"
  try { $verdict = ($t | ConvertFrom-Json).verdict } catch { }
  if ($rc -eq 3) {
    Say ("  STOP  " + $g.name + "  (round budget reached - not recorded)")
    $stop = $true
    break
  }
  if ($rc -eq 0) { $pass++ } else { $fail++ }
  Say ("  " + $verdict.PadRight(4) + "  " + $g.name.PadRight(12) + "  expect: " + $g.expect)
}

Say ("LEDGER: " + $ledger)
$list = & node $bridge trial list --last 3 --ledger $ledger 2>&1 | Out-String
try {
  $lj = $list | ConvertFrom-Json
  Say ("  total=" + $lj.total + " remaining=" + $lj.remaining + " passRate=" + $lj.passRate + " budgetExhausted=" + $lj.budgetExhausted)
} catch { }

if ($stop) { Say ("RESULT: STOPPED - round budget exhausted (" + $pass + " pass / " + $fail + " fail)"); exit 5 }
if ($fail -gt 0) { Say ("RESULT: FAIL - " + $pass + " pass / " + $fail + " fail"); exit 4 }
Say ("RESULT: ALL PASS - " + $pass + " groups, capture kept at " + $capPath)
exit 0
