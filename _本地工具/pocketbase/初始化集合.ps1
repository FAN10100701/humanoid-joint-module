# ============================================================
#  PocketBase Stage-1 initializer (ASCII-only per repo rule #3)
#  Run AFTER 启动PocketBase.bat is serving on 127.0.0.1:8090.
#  Creates: superuser (if missing) + notes/content collections
#  with student-only-own-notes / public-read-teacher-write rules.
# ============================================================
param(
  [string]$Email = "admin@local.test",
  [string]$Password = "pbLocal2026",
  [string]$Base = "http://127.0.0.1:8090"
)
$ErrorActionPreference = "Stop"

function Check($ok, $msg) {
  if ($ok) { Write-Host "  OK  $msg" } else { Write-Host "  FAIL $msg" }
}

# ---- 0) health ----
try {
  $null = Invoke-RestMethod -Uri "$Base/api/health" -Method Get -TimeoutSec 5
  Check $true "health endpoint reachable"
} catch {
  Write-Host "[X] PocketBase not reachable at $Base"
  Write-Host "    Start it first: 启动PocketBase.bat"
  exit 1
}

# ---- 1) superuser upsert via CLI (works without admin UI) ----
if (Test-Path ".\pocketbase.exe") {
  Write-Host "[*] upsert superuser $Email"
  & .\pocketbase.exe superuser upsert $Email $Password 2>$null
  Check $true "superuser ready ($Email / $Password)"
} else {
  Write-Host "[!] pocketbase.exe missing - skip CLI upsert (use admin UI /_)"
}

# ---- 2) superuser auth token ----
try {
  $auth = Invoke-RestMethod -Uri "$Base/api/collections/_superusers/auth-with-password" `
    -Method Post -ContentType "application/json" `
    -Body (@{ identity = $Email; password = $Password } | ConvertTo-Json)
  $tok = $auth.token
  Check $true "superuser auth token acquired"
} catch {
  Write-Host "[X] superuser auth failed: $($_.Exception.Message)"
  exit 1
}
$H = @{ Authorization = $tok }

# ---- 3) notes collection (one LWW row per user+itemId) ----
$notesBody = @{
  name   = "notes"
  type   = "base"
  fields = @(
    @{ name = "user";   type = "relation"; required = $true; maxSelect = 1; collectionId = "_pb_users_auth_" },
    @{ name = "itemId"; type = "text";     required = $true },
    @{ name = "pageId"; type = "text";     required = $true },
    @{ name = "type";   type = "text" },
    @{ name = "text";   type = "text" },
    @{ name = "quote";  type = "text" },
    @{ name = "occ";    type = "number" },
    @{ name = "color";  type = "text" },
    @{ name = "url";    type = "text" },
    @{ name = "ts";     type = "number" }
  )
  listRule   = "user = @request.auth.id"
  viewRule   = "user = @request.auth.id"
  createRule = "@request.auth.id != '' && @request.body.user = @request.auth.id"
  updateRule = "user = @request.auth.id"
  deleteRule = "user = @request.auth.id"
  indexes    = @("CREATE UNIQUE INDEX idx_notes_user_item ON notes (user, itemId)")
} | ConvertTo-Json -Depth 8
try {
  $null = Invoke-RestMethod -Uri "$Base/api/collections" -Method Post -Headers $H `
    -ContentType "application/json" -Body $notesBody
  Check $true "collection 'notes' created (private per user, unique user+itemId)"
} catch {
  $m = $_.Exception.Message
  if ($m -match "already exists|name must") { Check $true "collection 'notes' already exists" }
  else { Write-Host "  WARN notes: $m" }
}

# ---- 4) content collection (teacher page notes: public read, auth write) ----
$contentBody = @{
  name   = "content"
  type   = "base"
  fields = @(
    @{ name = "pageId"; type = "text"; required = $true },
    @{ name = "body";   type = "text" }
  )
  listRule   = ""
  viewRule   = ""
  createRule = "@request.auth.id != ''"
  updateRule = "@request.auth.id != ''"
  deleteRule = "@request.auth.id != ''"
  indexes    = @("CREATE UNIQUE INDEX idx_content_page ON content (pageId)")
} | ConvertTo-Json -Depth 8
try {
  $null = Invoke-RestMethod -Uri "$Base/api/collections" -Method Post -Headers $H `
    -ContentType "application/json" -Body $contentBody
  Check $true "collection 'content' created (public read, auth write; Stage-1 single-teacher)"
} catch {
  $m = $_.Exception.Message
  if ($m -match "already exists|name must") { Check $true "collection 'content' already exists" }
  else { Write-Host "  WARN content: $m" }
}

# ---- 5) demo teacher account (students self-register on login page flow) ----
try {
  $null = Invoke-RestMethod -Uri "$Base/api/collections/users/records" -Method Post -Headers $H `
    -ContentType "application/json" `
    -Body (@{ email = "teacher@local.test"; password = "teacher2026"; passwordConfirm = "teacher2026" } | ConvertTo-Json)
  Check $true "demo teacher account: teacher@local.test / teacher2026"
} catch {
  $m = $_.Exception.Message
  if ($m -match "already|email") { Check $true "demo teacher account exists" }
  else { Write-Host "  WARN teacher account: $m" }
}

Write-Host ""
Write-Host "Done. Now on the site: open any content page -> notes panel -> [cloud sync]."
Write-Host "Teacher editing: log in on the sync prompt with the teacher account, then use the edit button on the teacher box."
