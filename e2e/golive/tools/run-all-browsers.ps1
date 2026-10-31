# Runs the remaining browser projects one after another, restarting ONLY the QA API (its port) between them to clear the in-memory login limiter.
# Usage (from e2e/): powershell -File golive\tools\run-all-browsers.ps1 -Worktree <validation worktree> -ApiPort 4197 -SmtpPort 1125 -TlsUrl https://qa-starter.localhost:3544
param([Parameter(Mandatory)][string]$Worktree, [int]$ApiPort = 4197, [int]$SmtpPort = 1125, [string]$TlsUrl = '', [string[]]$Projects = @('firefox', 'webkit', 'mobile', 'tablet'))
foreach ($p in $Projects) {
  & "$PSScriptRoot\restart-api.ps1" -Worktree $Worktree -Port $ApiPort -SmtpPort $SmtpPort | Out-Null
  Remove-Item "golive-results\.auth\api-tokens.json" -ErrorAction SilentlyContinue
  if ($p -eq 'webkit' -and $TlsUrl) { $env:QA_WEB_URL = $TlsUrl }   # WebKit needs https: production cookies are Secure
  "=== $p $(Get-Date -Format s)"
  & "$PSScriptRoot\run-project.ps1" -Project $p
  Remove-Item Env:QA_WEB_URL -ErrorAction SilentlyContinue
}
"ALL DONE $(Get-Date -Format s)"
