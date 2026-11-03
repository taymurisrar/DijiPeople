Set-Location 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e'
$wt='D:\My Work\hrm-dijipeople\dijipeople-starter-verify8'
& 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e\golive\tools\restart-api.ps1' -Worktree $wt -Port 4397 -SmtpPort 1325 | Out-Null
Remove-Item 'golive-results\.auth' -Recurse -Force -ErrorAction SilentlyContinue
npx playwright test -c playwright.golive.config.ts --project=chromium golive/tests/18-security-regression.spec.ts
Copy-Item golive-results\results.json golive-results\run008\results-chromium-c18-iso.json -Force
& 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e\golive\tools\run-batches.ps1' -Worktree $wt -Run run008 -Tag 'c2-' -Only b05
'SEC INVESTIGATION DONE'
