# Runs one Playwright project of the go-live suite and keeps its JSON result under golive-results/<run>/ (the config always writes results.json).
# Usage (from e2e/):  powershell -File golive\tools\run-project.ps1 -Project chromium [-Run run005] [-Grep "<regex>"] [-Tag subset1]
param([Parameter(Mandatory)][string]$Project, [string]$Run = 'run006', [string]$Grep = '', [string]$Tag = '')
$ErrorActionPreference = 'Continue'
$dir = "golive-results\$Run"; New-Item -ItemType Directory -Force $dir | Out-Null
$args2 = @('playwright', 'test', '-c', 'playwright.golive.config.ts', "--project=$Project")
if ($Grep) { $args2 += @('--grep', $Grep) }
& npx @args2
$exit = $LASTEXITCODE
$name = if ($Tag) { "results-$Project-$Tag.json" } else { "results-$Project.json" }
Copy-Item golive-results\results.json "$dir\$name" -Force
"exit=$exit saved=$dir\$name"
