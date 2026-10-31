# Restarts the QA API of a validation worktree with the QA-only environment: release-floor ENFORCE and the LOCAL SMTP sink.
# Stops only the process that owns the API port (never pattern-kills node). Usage: pwsh restart-api.ps1 -Worktree <path> -Port 4097
param([string]$Worktree = 'D:\My Work\hrm-dijipeople\dijipeople-starter-verify', [int]$Port = 4097, [int]$SmtpPort = 1025)
# RUN-006: Get-NetTCPConnection returned nothing in the agent shell, so the old API silently kept running with a hot login limiter. Find the QA API by command line instead
# (a ts-node main.ts started from THIS validation worktree), and fall back to the port owner when that is visible. Never pattern-kills other sessions' processes.
$apiPath = (Join-Path $Worktree 'node_modulespi').ToLowerInvariant()
$mine = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($Worktree.ToLowerInvariant()) -and $_.CommandLine -match 'ts-node' -and $_.CommandLine -match 'src/main.ts' }
foreach ($p in $mine) { Stop-Process -Id $p.ProcessId -Force }
$c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c -and -not $mine) { Stop-Process -Id $c.OwningProcess -Force }
if ($mine -or $c) { Start-Sleep 3 }
$api = Join-Path $Worktree 'services\api'
$env:TS_NODE_TRANSPILE_ONLY = 'true'
$env:ENTITLEMENT_ENFORCEMENT_MODE = 'ENFORCE'          # DP-QA-005 mechanism: release floor from the environment
$env:ENABLE_EMAILS = 'true'; $env:EMAIL_PROVIDER = 'SMTP'
$env:EMAIL_SMTP_HOST = '127.0.0.1'; $env:EMAIL_SMTP_PORT = "$SmtpPort"; $env:EMAIL_SMTP_SECURE = 'false'
$env:EMAIL_SMTP_USER = 'qa'; $env:EMAIL_SMTP_PASSWORD = 'qa'; $env:EMAIL_FROM = 'no-reply@qa.dijipeople.test'
$env:ENABLE_ACCOUNT_ACTIVATION_EMAIL = 'true'; $env:ENABLE_PASSWORD_RESET_EMAIL = 'true'
Start-Process -FilePath cmd.exe -ArgumentList '/c', 'npx ts-node -r tsconfig-paths/register src/main.ts > ..\..\.qa-api.log 2>&1' -WorkingDirectory $api -WindowStyle Hidden
foreach ($k in 'ENTITLEMENT_ENFORCEMENT_MODE','ENABLE_EMAILS','EMAIL_PROVIDER','EMAIL_SMTP_HOST','EMAIL_SMTP_PORT','EMAIL_SMTP_SECURE','EMAIL_SMTP_USER','EMAIL_SMTP_PASSWORD','EMAIL_FROM','ENABLE_ACCOUNT_ACTIVATION_EMAIL','ENABLE_PASSWORD_RESET_EMAIL') { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
for ($i = 0; $i -lt 30; $i++) { Start-Sleep 3; try { if ((Invoke-WebRequest "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { 'API up'; break } } catch {} }
