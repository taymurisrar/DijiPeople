# RUN-007 legacy-migration group (MIG-*): starts a SECOND API from the validation worktree against a migrated legacy copy (dijipeople_starterv7legacy<a|b|c>_test) and runs only the MIG tests against it.
# The fresh-database run is untouched. The legacy copy was prepared BEFORE the candidate's migration (tools/legacy-enterprise-plus.mjs prepare + capture) and migrated afterwards (migrate deploy + seed:config x2).
# Usage (from e2e/): powershell -File golive\tools\run-legacy-mig.ps1 -Worktree "<path>" -Which a [-Port 4497] [-SmtpPort 1325]
param([Parameter(Mandatory)][string]$Worktree, [Parameter(Mandatory)][ValidateSet('a', 'b', 'c')][string]$Which, [int]$Port = 4497, [int]$SmtpPort = 1325, [string]$Run = 'run007', [string]$DbPrefix = 'dijipeople_starterv7legacy')
$ErrorActionPreference = 'Continue'
$qaRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$base = (Get-Content "$qaRoot\.env.qa.local" | Where-Object { $_ -like 'QA_DATABASE_URL=*' }).Substring(16)
$url = $base -replace '/[^/]+$', "/${DbPrefix}${Which}_test"
if ($url -notmatch '@localhost[:/].*_test$') { throw 'refusing: not a local _test database' }
# stop only a previous legacy API on this port
$c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) { Stop-Process -Id $c.OwningProcess -Force; Start-Sleep 3 }
$api = Join-Path $Worktree 'services\api'
$env:TS_NODE_TRANSPILE_ONLY = 'true'; $env:DATABASE_URL = $url; $env:PORT = "$Port"; $env:API_BASE_URL = "http://localhost:$Port/api"; $env:API_ORIGIN = "http://localhost:$Port"
$env:ENTITLEMENT_ENFORCEMENT_MODE = 'ENFORCE'; $env:ENABLE_EMAILS = 'true'; $env:EMAIL_PROVIDER = 'SMTP'
$env:EMAIL_SMTP_HOST = '127.0.0.1'; $env:EMAIL_SMTP_PORT = "$SmtpPort"; $env:EMAIL_SMTP_SECURE = 'false'; $env:EMAIL_SMTP_USER = 'qa'; $env:EMAIL_SMTP_PASSWORD = 'qa'; $env:EMAIL_FROM = 'no-reply@qa.dijipeople.test'
Start-Process -FilePath cmd.exe -ArgumentList '/c', "npx ts-node -r tsconfig-paths/register src/main.ts > ..\..\.qa-api-legacy-$Which.log 2>&1" -WorkingDirectory $api -WindowStyle Hidden
foreach ($k in 'DATABASE_URL', 'PORT', 'API_BASE_URL', 'API_ORIGIN', 'ENTITLEMENT_ENFORCEMENT_MODE', 'ENABLE_EMAILS', 'EMAIL_PROVIDER', 'EMAIL_SMTP_HOST', 'EMAIL_SMTP_PORT', 'EMAIL_SMTP_SECURE', 'EMAIL_SMTP_USER', 'EMAIL_SMTP_PASSWORD', 'EMAIL_FROM') { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
$up = $false
for ($i = 0; $i -lt 40; $i++) { Start-Sleep 3; try { if ((Invoke-WebRequest "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { $up = $true; break } } catch {} }
if (-not $up) { throw "legacy API ($Which) did not start" }
"legacy API $Which up on :$Port"
Set-Location "$qaRoot\e2e"
Copy-Item "golive-results\$Run\legacy-baseline-$($Which.ToUpper()).json" "golive-results\$Run\legacy-baseline.json" -Force
Remove-Item 'golive-results\.auth' -Recurse -Force -ErrorAction SilentlyContinue
$env:QA_DATABASE_URL = $url; $env:QA_API_URL = "http://localhost:$Port"
$env:QA_RUN = $Run
& npx playwright test -c playwright.golive.config.ts --project=chromium --no-deps --grep 'DPQA-MIG-' npx playwright test -c playwright.golive.config.ts --project=chromium --no-deps --grep 'DPQA-MIG-'
Remove-Item Env:QA_RUN -ErrorAction SilentlyContinue
$exit = $LASTEXITCODE
Remove-Item Env:QA_DATABASE_URL, Env:QA_API_URL -ErrorAction SilentlyContinue
Copy-Item golive-results\results.json "golive-results\$Run\results-legacy-$Which.json" -Force
Remove-Item "golive-results\$Run\legacy-baseline.json" -Force -ErrorAction SilentlyContinue
"exit=$exit saved=golive-results\$Run\results-legacy-$Which.json"
