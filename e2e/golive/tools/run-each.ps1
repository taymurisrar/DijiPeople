# RUN-007: runs groups of tests (by DPQA id) one group at a time, restarting ONLY the QA API before each group so the in-memory login limiter (20 / 10 min per IP+path)
# and the 60 s entitlement snapshot start clean. Needed for agent sign-in polling tests, whose own retries would otherwise exhaust the limiter. Retains traces on failure.
# Usage (from e2e/): powershell -File golive\tools\run-each.ps1 -Worktree "<path>" -Groups "CUS-001|CUS-002","CUS-003" [-Project chromium] [-Run run007] [-Tag cus]
param([Parameter(Mandatory)][string]$Worktree, [Parameter(Mandatory)][string[]]$Groups, [int]$ApiPort = 4397, [int]$SmtpPort = 1325, [string]$Project = 'chromium', [string]$Run = 'run007', [string]$Tag = 'each', [string]$TlsUrl = '')
$ErrorActionPreference = 'Continue'
$dir = "golive-results\$Run"; New-Item -ItemType Directory -Force $dir | Out-Null
$n = 0
foreach ($g in $Groups) {
  $n++
  & "$PSScriptRoot\restart-api.ps1" -Worktree $Worktree -Port $ApiPort -SmtpPort $SmtpPort | Out-Null
  Remove-Item "golive-results\.auth" -Recurse -Force -ErrorAction SilentlyContinue
  if ($Project -eq 'webkit' -and $TlsUrl) { $env:QA_WEB_URL = $TlsUrl }
  $pattern = '\[DPQA-(' + $g + ')\]'
  "=== $Project $Tag$n $(Get-Date -Format s): $g"
  & npx playwright test -c playwright.golive.config.ts "--project=$Project" --grep $pattern
  $exit = $LASTEXITCODE
  Remove-Item Env:QA_WEB_URL -ErrorAction SilentlyContinue
  $name = "results-$Project-$Tag{0:D2}.json" -f $n
  Copy-Item golive-results\results.json "$dir\$name" -Force
  "exit=$exit saved=$dir\$name"
}
"ALL GROUPS DONE $(Get-Date -Format s)"
