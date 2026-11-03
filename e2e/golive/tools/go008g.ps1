Set-Location 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e'
foreach ($p in 'webkit','firefox','mobile','tablet','chromium') {
  & 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e\golive\tools\restart-api.ps1' -Worktree 'D:\My Work\hrm-dijipeople\dijipeople-starter-verify8' -Port 4397 -SmtpPort 1325 | Out-Null
  if ($p -eq 'webkit') { $env:QA_WEB_URL='https://qa-starter.localhost:3744' }
  npx playwright test -c playwright.golive.config.ts "--project=$p" --grep 'SESS-05[0-3]' --repeat-each=3 --trace=retain-on-failure
  Remove-Item Env:QA_WEB_URL -ErrorAction SilentlyContinue
  Copy-Item golive-results\results.json "golive-results\run008\results-$p-sess-final.json" -Force
}
'SESSFINAL DONE'
