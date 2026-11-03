Set-Location 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e'
$wt = 'D:\My Work\hrm-dijipeople\dijipeople-starter-verify8'
$g = @('CUS-001|CUS-002','CUS-003|CUS-004','CUS-005|CUS-006|CUS-007','CUS-010','CUS-011','CUS-012','CUS-020','CUS-030|CUS-031|CUS-032','CUS-040|SESS-030','SEC-003|SEC-004','INV-101|BRAND-005|BEM-010','PUB-007','SESS-005','SESS-005','SESS-005')
& 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e\golive\tools\run-each.ps1' -Worktree $wt -Run run008 -Tag 'c29-' -Groups $g
'SECOND SEQUENCE DONE'
