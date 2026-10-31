# RUN-005 environment preparation (LOCAL ONLY). Creates a detached validation worktree at an EXACT candidate SHA and a fresh throwaway DB.
# Usage (PowerShell):  .\prepare-run005.ps1 -Sha <40-hex> [-Db dijipeople_starterv5_test] [-Worktree <path>]
# Refuses: abbreviated/unknown SHA, DB names not ending _test, a dirty QA tree. Never touches the development worktree and never merges.
# After it finishes, follow QA-RUNBOOK "RUN-005" for build, API start (restart-api.ps1), mail sink, TLS front, provisioning.
param(
  [Parameter(Mandatory)][string]$Sha,
  [string]$Database = 'dijipeople_starterv5_test',
  [string]$Worktree = ''
)
$ErrorActionPreference = 'Stop'
if ($Sha -notmatch '^[0-9a-f]{40}$') { throw 'Pass the full 40-hex candidate SHA supplied by the development agent.' }
if ($Database -notmatch '_test$') { throw 'Refusing: QA databases must end in _test.' }
$qaRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
if (-not $Worktree) { $Worktree = Join-Path (Split-Path $qaRoot -Parent) 'dijipeople-starter-verify5' }
if (git -C $qaRoot status --porcelain -- e2e docs/qa) { throw 'QA tree is dirty: commit QA edits first so the QA suite SHA is meaningful.' }
git -C $qaRoot cat-file -e "$Sha^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { throw "Commit $Sha is not in this repository's object store (fetch the remediation branch first; do not merge it)." }

$run = [ordered]@{
  application_sha = $Sha
  qa_suite_sha    = (git -C $qaRoot rev-parse HEAD)
  database        = $Database
  fixture_version = 'RUN-005 / provision-tenant+owner-access+seed-role-users (qa-starter via seed-demo + Starter sub; qa-prov-a, qa-prov-b starter; qa-growth growth)'
  node            = (node --version)
  playwright      = (npx --prefix (Join-Path $qaRoot 'e2e') playwright --version)
  os              = [System.Environment]::OSVersion.VersionString
  prepared_at     = (Get-Date).ToString('s')
}
if (-not (Test-Path $Worktree)) { git -C $qaRoot worktree add --detach $Worktree $Sha | Out-Null }
$head = git -C $Worktree rev-parse HEAD
if ($head -ne $Sha) { throw "Validation worktree is at $head, expected $Sha." }
$run['worktree'] = (Resolve-Path $Worktree).Path
New-Item -ItemType Directory -Force (Join-Path $qaRoot 'e2e\golive-results\run005') | Out-Null
$run | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $qaRoot 'e2e\golive-results\run005\environment.json')
$run | ConvertTo-Json
Write-Host @"

Next (manual, in order - each is documented in QA-RUNBOOK):
  1. createdb $Database ; cd $Worktree\services\api ; npx prisma migrate deploy --config prisma.config.ts ; seed:config ; seed:admin ; seed:demo (qa-starter)
  2. npm ci in the worktree ; apps/web production build (next build --webpack)
  3. e2e\golive\tools\restart-api.ps1 (ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE, SMTP sink env) ; node mail-sink.cjs ; next start -p 3014 ; node tls-proxy.cjs
  4. provision-tenant.mjs qa-prov-a / qa-prov-b (starter) and qa-growth (planKey growth) ; owner-access.mjs twice each ; seed-role-users.mjs
  5. update .env.qa.local (gitignored) ; cd e2e ; npx playwright test -c playwright.golive.config.ts --list  (must compile) ; run per project
"@
