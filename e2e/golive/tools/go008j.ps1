Set-Location 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e'
$wt='D:\My Work\hrm-dijipeople\dijipeople-starter-verify8'
$g = @('SEC-020','RSV-003','REV-006','SEC-001|SEC-002','SEC-003|SEC-004','SEC-005|SEC-006|SEC-007|SEC-008','SEC-010','PUB-007')
& 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e\golive\tools\run-each.ps1' -Worktree $wt -Run run008 -Tag 'c3-' -Groups $g
'FOURTH DONE'
