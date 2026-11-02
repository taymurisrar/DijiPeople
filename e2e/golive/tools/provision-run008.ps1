# RUN-008 tenant provisioning (run from e2e/, API up with ENFORCE + sink, platform admin seeded, wildcardDnsReady=true).
# Differs from RUN-007 only for tenant C: the Custom plan's price is PUBLISHED through the new supported API (DP-QA-044) and qa-custom is provisioned
# through onboarding DIRECTLY onto the Custom plan - no Starter-then-reassign workaround.
$ErrorActionPreference = 'Stop'
$t = 'golive\tools'
$base = @(@('qa-prov-a', 'QA Prov A', 'qa-owner-a@qa.dijipeople.test', 'starter', 'a'), @('qa-prov-b', 'QA Prov B', 'qa-owner-b@qa.dijipeople.test', 'starter', 'b'), @('qa-growth', 'QA Growth', 'qa-owner-g@qa.dijipeople.test', 'growth', 'g'), @('qa-enterprise', 'QA Enterprise', 'qa-owner-e@qa.dijipeople.test', 'enterprise', 'e'))
foreach ($p in $base) {
  node "$t\provision-tenant.mjs" $p[0] $p[1] $p[2] $p[3]
  1..2 | ForEach-Object { node "$t\owner-access.mjs" $p[0] }
  node "$t\seed-role-users.mjs" $p[0] $p[2] $p[4]
}
# the pristine onboarded tenant: activated, but no role users and no administrator remediation
node "$t\provision-tenant.mjs" qa-probe 'QA Probe' qa-owner-p@qa.dijipeople.test starter
1..2 | ForEach-Object { node "$t\owner-access.mjs" qa-probe }
# Custom plan tenant C
node "$t\create-custom-plan.mjs" qa-cp-baseline employees,organization,leave,attendance,documents,notifications,branding,data-import-export,desktop-agent,email-white-label,email-template-customization
Write-Host '--- onboarding onto the Custom plan BEFORE its price is published (must be refused):'
node "$t\provision-tenant.mjs" qa-custom 'QA Custom' qa-owner-c@qa.dijipeople.test qa-cp-baseline
Write-Host '--- publish the price, then provision:'
node "$t\publish-plan-price.mjs" qa-cp-baseline publish
node "$t\provision-tenant.mjs" qa-custom 'QA Custom' qa-owner-c@qa.dijipeople.test qa-cp-baseline
1..2 | ForEach-Object { node "$t\owner-access.mjs" qa-custom }
node "$t\seed-role-users.mjs" qa-custom qa-owner-c@qa.dijipeople.test c
