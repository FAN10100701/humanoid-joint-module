# Download AgiBot X1 official STL meshes (GitHub AgibotTech/agibot_x1_train, resources/robots/x1/meshes/)
# Existing files are skipped automatically.
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# derive project paths at runtime (script lives in <project>\_local_tools)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$proj = Split-Path -Parent $root
$vis  = Get-ChildItem -Path $proj -Directory | Where-Object { $_.Name -like '00_*' } | Select-Object -First 1
$dst  = Join-Path $vis.FullName 'models\x1'
if(-not (Test-Path $dst)){ New-Item -ItemType Directory -Force -Path $dst | Out-Null }
$base = 'https://raw.githubusercontent.com/AgibotTech/agibot_x1_train/main/resources/robots/x1/meshes/'
$files = @(
'arm_r_wrist_a_ball.STL','arm_r_wrist_a_loop.STL','arm_r_wrist_b_ball.STL','arm_r_wrist_b_loop.STL',
'arm_r_wrist_motor_a_link.STL','arm_r_wrist_motor_b_link.STL','base_link_simple.STL',
'left_ankle_pitch.STL','left_ankle_roll.STL','left_elbow_pitch.STL','left_elbow_yaw.STL',
'left_hip_pitch.STL','left_hip_roll.STL','left_hip_yaw.STL','left_knee_pitch.STL',
'left_shoulder_pitch.STL','left_shoulder_roll.STL','left_shoulder_yaw.STL','left_wrist_pitch.STL',
'leg_l_toe_a_ball.STL','leg_l_toe_a_link.STL','leg_l_toe_a_loop.STL','leg_l_toe_b_ball.STL','leg_l_toe_b_link.STL','leg_l_toe_b_loop.STL',
'leg_r_toe_a_ball.STL','leg_r_toe_a_link.STL','leg_r_toe_a_loop.STL','leg_r_toe_b_ball.STL','leg_r_toe_b_link.STL','leg_r_toe_b_loop.STL',
'lumber_pitch.STL','lumber_roll.STL','lumber_yaw.STL',
'right_ankle_pitch.STL','right_ankle_roll.STL','right_elbow_pitch.STL','right_elbow_yaw.STL',
'right_hip_pitch.STL','right_hip_roll.STL','right_hip_yaw.STL','right_knee_pitch.STL',
'right_shoulder_pitch.STL','right_shoulder_roll.STL','right_shoulder_yaw.STL','right_wrist_pitch.STL',
'waist_motor_a_ball.STL','waist_motor_a_link.STL','waist_motor_a_loop.STL',
'waist_motor_b_ball.STL','waist_motor_b_link.STL','waist_motor_b_loop.STL'
)
$ok=0; $fail=@()
foreach($f in $files){
  $p = Join-Path $dst $f
  if((Test-Path $p) -and ((Get-Item $p).Length -gt 1000)){ $ok++; continue }
  $done=$false
  for($try=1; $try -le 4 -and -not $done; $try++){
    try{
      Invoke-WebRequest -Uri ($base+$f) -OutFile $p -UseBasicParsing -TimeoutSec 120
      if((Test-Path $p) -and ((Get-Item $p).Length -gt 1000)){ $done=$true; $ok++ }
    } catch { Start-Sleep -Milliseconds (800*$try) }
  }
  if(-not $done){ $fail += $f }
}
Write-Output ("dst: " + $dst)
Write-Output ("done: " + $ok + " / " + $files.Count)
if($fail.Count){ Write-Output ("failed: " + ($fail -join ', ')) } else { Write-Output "all ok" }
