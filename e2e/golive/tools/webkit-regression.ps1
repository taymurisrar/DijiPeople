# DP-QA-023 repeated WebKit regression with traces: N repetitions of the smoke routes that previously threw "pageerror ... access control checks" on RSC prefetches.
# Usage (from e2e/, TLS front up): powershell -File golive\tools\webkit-regression.ps1 -TlsUrl https://qa-starter.localhost:3544 [-Repeat 10]
# Output: golive-results\run006\webkit-regression.json (+ traces on failure under golive-results\artifacts) and a per-route failure count.
param([Parameter(Mandatory)][string]$TlsUrl, [int]$Repeat = 10, [string]$Run = 'run006')
New-Item -ItemType Directory -Force "golive-results\$Run" | Out-Null
$env:QA_WEB_URL = $TlsUrl
npx playwright test -c playwright.golive.config.ts --project=webkit --grep "SMK-004|SMK-011|SMK-015|SMK-001|SMK-002" --repeat-each=$Repeat --trace=retain-on-failure
Copy-Item golive-results\results.json "golive-results\$Run\webkit-regression.json" -Force
Remove-Item Env:QA_WEB_URL
node -e "
const j=require('./golive-results/$Run/webkit-regression.json');const c={};
(function w(ss){for(const s of ss||[]){for(const sp of s.specs||[])for(const t of sp.tests){const r=t.results.at(-1);const k=sp.title.slice(0,45);c[k]=c[k]||{pass:0,fail:0};r&&r.status==='passed'?c[k].pass++:c[k].fail++}w(s.suites)}})(j.suites);
console.table(c)"
