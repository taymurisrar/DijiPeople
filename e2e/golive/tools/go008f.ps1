Set-Location 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e'
& 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e\golive\tools\restart-api.ps1' -Worktree 'D:\My Work\hrm-dijipeople\dijipeople-starter-verify8' -Port 4397 -SmtpPort 1325 | Out-Null
$env:QA_WEB_URL='https://qa-starter.localhost:3744'
npx playwright test -c playwright.golive.config.ts --project=webkit --grep 'SESS-053' --repeat-each=4 --trace=retain-on-failure
Copy-Item golive-results\results.json golive-results\run008\results-webkit-sess-ctl2.json -Force
'CTL2 DONE'
