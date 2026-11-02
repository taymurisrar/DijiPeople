# RUN-008 chromium sequence (from e2e/): new RUN-008 batches first, the full RUN-007 regression next, the seed / migration group LAST (running a seed is a state change, OBS-035).
# Spec 29 (Custom plans, limiter-sensitive) runs through run-each.ps1, one API restart per small group. Everything lands in golive-results\run008.
param([Parameter(Mandatory)][string]$Worktree, [string]$Run = 'run008')
$ErrorActionPreference = 'Continue'
$rb = "$PSScriptRoot\run-batches.ps1"; $re = "$PSScriptRoot\run-each.ps1"
function Batch($ids) { foreach ($b in $ids) { powershell -NoProfile -File $rb -Worktree $Worktree -Run $Run -Tag 'c-' -Only $b } }
Batch @('b12', 'b13', 'b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07', 'b08')
powershell -NoProfile -File $re -Worktree $Worktree -Run $Run -Tag 'c29-' -Groups 'CUS-001|CUS-002', 'CUS-003|CUS-004', 'CUS-005|CUS-006|CUS-007', 'CUS-010', 'CUS-011', 'CUS-012', 'CUS-020', 'CUS-030|CUS-031|CUS-032', 'CUS-040|SESS-030', 'SEC-003|SEC-004'
Batch @('b09', 'b10', 'b11')
"CHROMIUM SEQUENCE DONE $(Get-Date -Format s)"
