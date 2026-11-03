Set-Location 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e'
foreach ($k in 'a','b','c') {
  & 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa\e2e\golive\tools\run-legacy-mig.ps1' -Worktree 'D:\My Work\hrm-dijipeople\dijipeople-starter-verify8' -Which $k -Run run008 -DbPrefix 'dijipeople_starterv8legacy'
}
'LEGACY MIG DONE'
