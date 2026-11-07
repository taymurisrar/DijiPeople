# RUN-007/008: runs one browser project of the go-live suite in spec-file batches, restarting ONLY the QA API between batches (clears the in-memory 20/10min login limiter that
# otherwise turns a long run into a wall of 429s - see QA-RUNBOOK) and keeping one JSON result per batch. The seed / migration group runs last on purpose (OBS-035).
# Usage (from e2e/): powershell -File golive\tools\run-batches.ps1 -Worktree <validation worktree> -ApiPort 4397 -SmtpPort 1325 [-Project chromium] [-Run run007] [-Only b01,b02]
param([Parameter(Mandatory)][string]$Worktree, [int]$ApiPort = 4397, [int]$SmtpPort = 1325, [string]$Project = 'chromium', [string]$Run = 'run007', [string[]]$Only = @(), [string]$TlsUrl = '', [string]$Tag = '')
$ErrorActionPreference = 'Continue'
$batches = [ordered]@{
  b01 = @('01-smoke', '02-auth-security', '03-plan-entitlements', '03b-plan-ungated-features')
  b02 = @('04-isolation-rbac', '05-employees', '06-leave', '07-documents')
  b03 = @('08-settings-notifications', '09-attendance', '10-a11y-responsive-perf', '11-leave-approval-balance')
  b04 = @('12-data-transfer-organization', '13-session-password-invite-concurrency', '14-visual-commands', '15-mail-branding-onboarding')
  b05 = @('16-leave-policy-org-session', '17-attendance-workday-documents-ui', '18-security-regression', '19-growth-and-coverage')
  b06 = @('20-import-export-all-plans', '21-desktop-agent-plan-matrix', '22-branded-emails')
  b07 = @('23-entitlement-matrix', '24-session-idle-expiry')
  b08 = @('28-run007-export-privacy-import')   # spec 29 (Custom plans) runs through run-each.ps1: one API restart per small group, because its agent sign-in polling is limiter-sensitive
  b09 = @('30-run007-email-states-responsive-webkit')
  b10 = @('31-run007-subscription-architecture')
  b11 = @('25-seed-migration-idempotency', '26-deploy-seed-approval-routes', '27-run007-approval-workflows')
  b12 = @('32-run008-remediation-retest')      # RUN-008: DP-QA-043/044/047/005 retests (API level)
  b14 = @('34-integrated-release-checks')   # corrective release: DP-QA-052, tenant-aware smoke, recovery, preservation
  b13 = @('33-run008-admin-ui-and-session-links')   # RUN-008: admin console publish UI + SESS-005 on the production build
}
$dir = "golive-results\$Run"; New-Item -ItemType Directory -Force $dir | Out-Null
foreach ($k in $batches.Keys) {
  if ($Only.Count -and ($Only -notcontains $k)) { continue }
  & "$PSScriptRoot\restart-api.ps1" -Worktree $Worktree -Port $ApiPort -SmtpPort $SmtpPort | Out-Null
  Remove-Item "golive-results\.auth" -Recurse -Force -ErrorAction SilentlyContinue
  if ($Project -eq 'webkit' -and $TlsUrl) { $env:QA_WEB_URL = $TlsUrl }
  "=== $Project $k $(Get-Date -Format s): $($batches[$k] -join ', ')"
  $files = @($batches[$k] | ForEach-Object { "golive/tests/$_.spec.ts" })
  & npx playwright test -c playwright.golive.config.ts "--project=$Project" @files
  $exit = $LASTEXITCODE
  Remove-Item Env:QA_WEB_URL -ErrorAction SilentlyContinue
  Copy-Item golive-results\results.json "$dir\results-$Project-$Tag$k.json" -Force
  "exit=$exit saved=$dir\results-$Project-$Tag$k.json"
}
"ALL BATCHES DONE $(Get-Date -Format s)"

