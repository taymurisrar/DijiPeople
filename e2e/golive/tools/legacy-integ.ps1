# RUN-008: three populated legacy copies (RUN-006 database, which still has `enterprise-plus`) -> prepare + capture BEFORE the candidate's migration -> migrate deploy + seed:config x2 with the RUN-008 candidate.
# Run from e2e/. Local throwaway databases only (names end _test).
$ErrorActionPreference = 'Continue'
$wt = 'D:\My Work\hrm-dijipeople\dijipeople-integration'
$base = (Get-Content '..\.env.qa.local' | Where-Object { $_ -like 'QA_DATABASE_URL=*' }).Substring(16)
$admin = $base -replace '/[^/]+$', '/postgres'
$env:QA_RUN = 'integ'
foreach ($w in 'a', 'b', 'c') {
  $db = "dijipeople_integlegacy${w}_test"
  $url = $base -replace '/[^/]+$', "/$db"
  node golive\tools\sqlurl.cjs $admin "drop database if exists $db" "create database $db template dijipeople_starterv6_test"
  $second = if ($w -eq 'a') { 'qa-growth' } else { '-' }
  node golive\tools\legacy-enterprise-plus.mjs prepare $url qa-custom $second
  if ($w -eq 'c') { node golive\tools\sqlurl.cjs $url "update ""CustomerAccount"" set ""selectedPlanId""=null where ""selectedPlanId""=(select id from ""Plan"" where key='enterprise-plus') and id not in (select ""customerAccountId"" from ""Tenant"" where slug='qa-custom')" }
  node golive\tools\legacy-enterprise-plus.mjs capture $url "legacy-baseline-$($w.ToUpper()).json"
  Push-Location "$wt\services\api"
  $env:DATABASE_URL = $url
  npx prisma migrate deploy --config prisma.config.ts 2>&1 | Select-Object -Last 2
  npm run seed:config 2>&1 | Select-Object -Last 1
  npm run seed:config 2>&1 | Select-Object -Last 1
  Remove-Item Env:DATABASE_URL
  Pop-Location
}
Remove-Item Env:QA_RUN
'LEGACY PREP DONE'

