param([Parameter(Mandatory)][string]$Worktree, [string]$Run = 'integ')
$ErrorActionPreference = 'Continue'
Set-Location 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e'
& "$PSScriptRoot\ensure-stack.ps1"
node golive\tools\sql.cjs 'delete from \"EmailProviderSetting\" where \"providerType\"=''CONSOLE''' 2>&1 | Out-Null
& "$PSScriptRoot\run-each.ps1" -Worktree $Worktree -Run $Run -Tag 'int004-' -Groups @('INT-004')
& "$PSScriptRoot\run-all-browsers.ps1" -Worktree $Worktree -ApiPort 4397 -SmtpPort 1325 -TlsUrl 'https://qa-starter.localhost:3744' -Run $Run
foreach ($p in 'webkit', 'firefox', 'mobile', 'tablet', 'chromium') {
  & "$PSScriptRoot\restart-api.ps1" -Worktree $Worktree -Port 4397 -SmtpPort 1325 | Out-Null
  if ($p -eq 'webkit') { $env:QA_WEB_URL = 'https://qa-starter.localhost:3744' }
  npx playwright test -c playwright.golive.config.ts "--project=$p" --grep 'SESS-05[0-3]' --repeat-each=3 --trace=retain-on-failure
  Remove-Item Env:QA_WEB_URL -ErrorAction SilentlyContinue
  Copy-Item golive-results\results.json "golive-results\$Run\results-$p-sess-final.json" -Force
}
& "$PSScriptRoot\legacy-integ.ps1"
foreach ($k in 'a', 'b', 'c') { & "$PSScriptRoot\run-legacy-mig.ps1" -Worktree $Worktree -Which $k -Run $Run -DbPrefix 'dijipeople_integlegacy' }
"INTEG REST2 DONE $(Get-Date -Format s)"
