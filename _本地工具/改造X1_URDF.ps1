# ============================================================
# X1 URDF joint upgrade script (ASCII only to avoid encoding issues)
# Converts 15 fixed joints (3 lumber + 12 arm) to revolute,
# and writes human-sensible symmetric joint limits per joint type.
# ============================================================
$ErrorActionPreference = 'Stop'

# locate project dir dynamically to avoid Chinese literals in this script
$proj = Split-Path -Parent $PSScriptRoot
$vis  = Get-ChildItem -Path $proj -Directory | Where-Object { $_.Name -like '00_*' } | Select-Object -First 1
if (-not $vis) { throw 'Cannot find 00_* directory' }
$urdfPath = Join-Path $vis.FullName 'models\x1\x1.urdf'
Write-Host "Target: $urdfPath"

# joint name -> lower,upper (radians), conservative symmetric limits
$targets = [ordered]@{
  'lumber_yaw_joint'            = '-0.80',' 0.80'   # waist yaw +/-45deg
  'lumber_roll_joint'           = '-0.52',' 0.52'   # waist roll +/-30deg
  'lumber_pitch_joint'          = '-0.52',' 0.52'   # waist pitch +/-30deg
  'left_shoulder_pitch_joint'   = '-2.50',' 1.80'   # shoulder swing
  'left_shoulder_roll_joint'    = '-1.20',' 1.20'   # shoulder ab/adduct
  'left_shoulder_yaw_joint'     = '-1.50',' 1.50'   # shoulder twist
  'left_elbow_pitch_joint'      = '-1.80',' 1.80'   # elbow bend
  'left_elbow_yaw_joint'        = '-1.00',' 1.00'   # forearm twist
  'left_wrist_pitch_joint'      = '-0.90',' 0.90'   # wrist bend
  'right_shoulder_pitch_joint'  = '-2.50',' 1.80'
  'right_shoulder_roll_joint'   = '-1.20',' 1.20'
  'right_shoulder_yaw_joint'    = '-1.50',' 1.50'
  'right_elbow_pitch_joint'     = '-1.80',' 1.80'
  'right_elbow_yaw_joint'       = '-1.00',' 1.00'
  'right_wrist_pitch_joint'     = '-0.90',' 0.90'
}

$text = [System.IO.File]::ReadAllText($urdfPath)
$changed = 0

foreach ($name in $targets.Keys) {
  $lo = [string]$targets[$name][0]
  $up = [string]$targets[$name][1]
  # match whole joint block for this name
  $pattern = '(?s)(<joint\s*\r?\n\s*name="' + [regex]::Escape($name) + '"\s*\r?\n\s*type=")fixed(">.*?<limit\s*\r?\n\s*lower=")[^"]*("\s*\r?\n\s*upper=")[^"]*("\s*\r?\n\s*effort=")[^"]*("\s*\r?\n\s*velocity=")[^"]*(")'
  $new = { param($m) $m.Groups[1].Value + 'revolute' + $m.Groups[2].Value + $lo + $m.Groups[3].Value + $up + $m.Groups[4].Value + '40' + $m.Groups[5].Value + '10' + $m.Groups[6].Value }.GetNewClosure()
  $result = [regex]::Replace($text, $pattern, $new)
  if ($result -ne $text) { $changed++ }
  $text = $result
}

if ($changed -ne 15) { throw "Expected 15 joints changed, got $changed" }

# write back as UTF-8 without BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($urdfPath, $text, $utf8NoBom)
Write-Host "OK: $changed joints converted to revolute with limits."

# verify: count revolute vs fixed
$rev = ([regex]::Matches($text, 'type="revolute"')).Count
$fix = ([regex]::Matches($text, 'type="fixed"')).Count
Write-Host "revolute=$rev fixed=$fix"
