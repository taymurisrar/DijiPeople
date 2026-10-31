# RUN-006: provisions the plan-matrix tenants through the REAL onboarding workflow (run from e2e/, API up, platform admin seeded, wildcardDnsReady=true).
#   qa-growth (growth), qa-enterprise (enterprise); Custom needs the mechanism named by the development handoff (RUN-006-PREPARATION Q3) and is added by hand.
# Afterwards put QA_TENANT_G_*/QA_TENANT_E_* (and C when it exists) in .env.qa.local (gitignored): SLUG=qa-growth OWNER=qa-owner-g@qa.dijipeople.test, SLUG=qa-enterprise OWNER=qa-owner-e@qa.dijipeople.test
$ErrorActionPreference = 'Stop'
$t = 'golive\tools'
$plans = @(@('qa-growth', 'QA Growth', 'qa-owner-g@qa.dijipeople.test', 'growth', 'g'), @('qa-enterprise', 'QA Enterprise', 'qa-owner-e@qa.dijipeople.test', 'enterprise', 'e'))
foreach ($p in $plans) {
  node "$t\provision-tenant.mjs" $p[0] $p[1] $p[2] $p[3]
  1..2 | ForEach-Object { node "$t\owner-access.mjs" $p[0] }          # first activates the owner, second moves the tenant to ACTIVE
  node "$t\seed-role-users.mjs" $p[0] $p[2] $p[4]                      # employee, manager, hr, payroll-manager
}
