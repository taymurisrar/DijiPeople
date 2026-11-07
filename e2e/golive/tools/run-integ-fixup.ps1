param([Parameter(Mandatory)][string]$Worktree, [string]$Run = 'integ')
$ErrorActionPreference = 'Continue'
Set-Location 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e'
& "$PSScriptRoot\ensure-stack.ps1"
& "$PSScriptRoot\run-each.ps1" -Worktree $Worktree -Run $Run -Tag 'int456-' -Groups @('INT-004', 'INT-005|INT-006')
foreach ($p in 'mobile', 'tablet') {
  & "$PSScriptRoot\restart-api.ps1" -Worktree $Worktree -Port 4397 -SmtpPort 1325 | Out-Null
  npx playwright test -c playwright.golive.config.ts "--project=$p" --grep 'SMK-003|SMK-014'
  Copy-Item golive-results\results.json "golive-results\$Run\results-$p-smkfix.json" -Force
}
"INTEG FIXUP DONE $(Get-Date -Format s)"
