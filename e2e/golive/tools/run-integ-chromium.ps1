# Integrated corrective-release regression (chromium): new integration batches first, the full RUN-008 regression next, spec 29 and the security groups through run-each, the seed group LAST.
param([Parameter(Mandatory)][string]$Worktree, [string]$Run = 'integ')
$ErrorActionPreference = 'Continue'
& "$PSScriptRoot\ensure-stack.ps1"
$rb = "$PSScriptRoot\run-batches.ps1"; $re = "$PSScriptRoot\run-each.ps1"
foreach ($b in 'b14', 'b12', 'b13', 'b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07', 'b08') { powershell -NoProfile -File $rb -Worktree $Worktree -Run $Run -Tag 'c-' -Only $b }
$groups = @('CUS-001|CUS-002', 'CUS-003|CUS-004', 'CUS-005|CUS-006|CUS-007', 'CUS-010', 'CUS-011', 'CUS-012', 'CUS-020', 'CUS-030|CUS-031|CUS-032', 'CUS-040|SESS-030', 'SEC-001|SEC-002', 'SEC-003|SEC-004', 'SEC-005|SEC-006|SEC-007|SEC-008', 'SEC-010', 'SEC-020')
& $re -Worktree $Worktree -Run $Run -Tag 'c29-' -Groups $groups
& "$PSScriptRoot\ensure-stack.ps1"
foreach ($b in 'b09', 'b10', 'b11') { powershell -NoProfile -File $rb -Worktree $Worktree -Run $Run -Tag 'c-' -Only $b }
"INTEG CHROMIUM DONE $(Get-Date -Format s)"

