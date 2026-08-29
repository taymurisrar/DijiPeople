# Open Product Decisions

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Records where the engineering behaviour is understood but the **correct product**
**behaviour is not decided**. These are questions for a human, not tasks for an
agent, and no agent may resolve one by guessing.

Each states the question, the options and what each option costs.

## Awaiting a product decision

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-1979](../../docs/bugs/BUG-1979-seven-attendance-settings-are-overwritten-on-write-and-the-a.md) | Seven attendance settings are overwritten on write and the admin is never told | BUG | MEDIUM | P2 | PRODUCT_DECISION | api:tenant-settings | PRODUCT_DECISION |
| [BUG-1980](../../docs/bugs/BUG-1980-one-saved-attendance-policy-permanently-overrides-the-attend.md) | One saved attendance policy permanently overrides the attendance settings category | BUG | MEDIUM | P2 | PRODUCT_DECISION | api:attendance | PRODUCT_DECISION |
| [BUG-1981](../../docs/bugs/BUG-1981-resolvepolicy-hardcodes-seven-location-values-and-inverts-tw.md) | resolvePolicy hardcodes seven location values and inverts two AttendancePolicy column defaults | BUG | MEDIUM | P2 | PRODUCT_DECISION | api:attendance | PRODUCT_DECISION |
| [BUG-2045](../../docs/bugs/BUG-2045-timesheet-background-job-completions-make-up-71-percent-of-t.md) | Timesheet background-job completions make up 71 percent of the tenant audit trail | BUG | MEDIUM | P2 | PRODUCT_DECISION | api:timesheets, api:audit, api:tenant-settings | PRODUCT_DECISION |
| [ITEM-0106](../../docs/backlog/items/ITEM-0106-an-employee-cannot-use-self-service-until-their-manager-acti.md) | An employee cannot use self-service until their manager activates their own account | PRODUCT_DECISION | MEDIUM | P2 | PRODUCT_DECISION | api:leave, api:employees | PRODUCT_DECISION |
| [ITEM-0108](../../docs/backlog/items/ITEM-0108-decide-whether-the-roughly-one-hour-session-lifetime-is-idle.md) | Decide whether the roughly one-hour session lifetime is idle or absolute | PRODUCT_DECISION | LOW | P2 | PRODUCT_DECISION | api:auth | PRODUCT_DECISION |
| [BUG-2007](../../docs/bugs/BUG-2007-projects-and-customers-can-be-created-but-never-deleted.md) | Projects and customers can be created but never deleted | BUG | LOW | P3 | PRODUCT_DECISION | api:projects | PRODUCT_DECISION |
| [ITEM-0079](../../docs/backlog/items/ITEM-0079-activation-does-not-gate-on-a-workspace-having-any-module-en.md) | Activation does not gate on a workspace having any module enabled | PRODUCT_DECISION | LOW | P3 | PRODUCT_DECISION | api:tenant-control-plane | PRODUCT_DECISION |
