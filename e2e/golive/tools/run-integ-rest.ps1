param([Parameter(Mandatory)][string]$Worktree, [string]$Run = 'integ')
$ErrorActionPreference = 'Continue'
& "$PSScriptRoot\ensure-stack.ps1"
$rb = "$PSScriptRoot\run-batches.ps1"; $re = "$PSScriptRoot\run-each.ps1"
& $re -Worktree $Worktree -Run $Run -Tag 'c29b-' -Groups @('SEC-020', 'CUS-002', 'CUS-004', 'CUS-031|CUS-032')
foreach ($b in 'b09', 'b10', 'b11') { powershell -NoProfile -File $rb -Worktree $Worktree -Run $Run -Tag 'c-' -Only $b }
"INTEG CHROMIUM REST DONE $(Get-Date -Format s)"
