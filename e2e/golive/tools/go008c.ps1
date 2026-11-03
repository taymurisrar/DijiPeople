Set-Location 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e'
$wt = 'D:\My Work\hrm-dijipeople\dijipeople-starter-verify8'
$g = @('CUS-001','CUS-003','SEC-003|SEC-004','INV-101|BRAND-005|BEM-010','PUB-007')
& 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e\golive\tools\run-each.ps1' -Worktree $wt -Run run008 -Tag 'c29r-' -Groups $g
'THIRD SEQUENCE DONE'
