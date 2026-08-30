# QA Test Plans

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-qa.mjs`.

One evergreen plan per product area: scope, risks, the cases that must always
be covered, and the declared coverage per dimension. QA loads the plan for
every area a change touches **before** designing anything new.

**Plans: 26** · scenarios across them: 312

| Plan | Area | Risk | Status | Scenarios | Related bugs | Verified against |
|---|---|---|---|---|---|---|
| [PLAN-008](../../../docs/qa/test-plans/PLAN-008-agent-desktop.md) | agent-desktop | HIGH | CURRENT | 7 | BUG-0033, BUG-0034, BUG-0035, BUG-0036 | `287612d` |
| [PLAN-022](../../../docs/qa/test-plans/PLAN-022-approvals.md) | approvals | HIGH | CURRENT | 4 | BUG-1968, BUG-2015, BUG-1970, BUG-1969 | `a86362cf` |
| [PLAN-009](../../../docs/qa/test-plans/PLAN-009-attendance.md) | attendance | CRITICAL | CURRENT | 19 | BUG-0002, BUG-0047 | `287612d` |
| [PLAN-001](../../../docs/qa/test-plans/PLAN-001-authentication.md) | authentication | CRITICAL | CURRENT | 9 | BUG-0008, BUG-0009, BUG-0010, BUG-0627 | `0c61b7e` |
| [PLAN-002](../../../docs/qa/test-plans/PLAN-002-authorization.md) | authorization | CRITICAL | CURRENT | 19 | BUG-0003, BUG-0004, BUG-0006, BUG-0007, BUG-0047, BUG-0071, BUG-0072 | `287612d` |
| [PLAN-020](../../../docs/qa/test-plans/PLAN-020-billing.md) | billing | CRITICAL | CURRENT | 18 | BUG-0531, BUG-0533, BUG-0534, BUG-0027, BUG-0030 | `99dc70a` |
| [PLAN-004](../../../docs/qa/test-plans/PLAN-004-commercial-onboarding.md) | commercial-onboarding | HIGH | CURRENT | 9 | BUG-0011, BUG-0012, BUG-0024, BUG-0027, BUG-0028, BUG-0029, BUG-0030 | `287612d` |
| [PLAN-012](../../../docs/qa/test-plans/PLAN-012-deployment-release.md) | deployment-release | HIGH | CURRENT | 28 | BUG-0023, BUG-0026, BUG-0037, BUG-0042, BUG-0047 | `287612d` |
| [PLAN-029](../../../docs/qa/test-plans/PLAN-029-framework.md) | framework | MEDIUM | CURRENT | 1 | BUG-2413 | `39d8ddc4` |
| [PLAN-013](../../../docs/qa/test-plans/PLAN-013-landing.md) | landing | HIGH | CURRENT | 24 | BUG-0061, BUG-0062, BUG-0063, BUG-0064, BUG-0065, BUG-0066 | `c332992` |
| [PLAN-005](../../../docs/qa/test-plans/PLAN-005-lead-management.md) | lead-management | HIGH | CURRENT | 6 | BUG-0013, BUG-0018, BUG-0021, BUG-0031, BUG-0032 | `287612d` |
| [PLAN-023](../../../docs/qa/test-plans/PLAN-023-leave.md) | leave | HIGH | CURRENT | 3 | BUG-1967, BUG-1966, BUG-1962, BUG-1970 | `9def9971` |
| [PLAN-015](../../../docs/qa/test-plans/PLAN-015-legal.md) | legal | HIGH | CURRENT | 5 | — | `bd0fb36` |
| [PLAN-030](../../../docs/qa/test-plans/PLAN-030-monitoring.md) | monitoring | HIGH | CURRENT | 3 | BUG-2459, BUG-2460, BUG-2465, BUG-1754, BUG-1750, BUG-1420, BUG-1419 | `39d8ddc4` |
| [PLAN-014](../../../docs/qa/test-plans/PLAN-014-outbox.md) | outbox | HIGH | CURRENT | 2 | BUG-0070 | `bd0fb36` |
| [PLAN-006](../../../docs/qa/test-plans/PLAN-006-partner-lifecycle.md) | partner-lifecycle | HIGH | CURRENT | 6 | BUG-0016, BUG-0019, BUG-0025, BUG-0048 | `287612d` |
| [PLAN-010](../../../docs/qa/test-plans/PLAN-010-payroll.md) | payroll | CRITICAL | CURRENT | 7 | BUG-0001, BUG-0039 | `287612d` |
| [PLAN-019](../../../docs/qa/test-plans/PLAN-019-platform-admin.md) | platform-admin | HIGH | CURRENT | 56 | BUG-0073, BUG-0074, BUG-1419, BUG-1420, BUG-1421, BUG-1422, BUG-1423, BUG-1424, BUG-1425 | `4290c03` |
| [PLAN-031](../../../docs/qa/test-plans/PLAN-031-routing.md) | routing | MEDIUM | CURRENT | 1 | BUG-2461 | `39d8ddc4` |
| [PLAN-011](../../../docs/qa/test-plans/PLAN-011-runtime-modules.md) | runtime-modules | HIGH | CURRENT | 34 | BUG-0019, BUG-0020, BUG-0044 | `287612d` |
| [PLAN-016](../../../docs/qa/test-plans/PLAN-016-seat-billing.md) | seat-billing | CRITICAL | CURRENT | 4 | — | `39bd665` |
| [PLAN-021](../../../docs/qa/test-plans/PLAN-021-settings.md) | settings | HIGH | CURRENT | 14 | BUG-0668, BUG-0669 | `d5d9ce7` |
| [PLAN-018](../../../docs/qa/test-plans/PLAN-018-subscription-changes.md) | subscription-changes | CRITICAL | CURRENT | 1 | — | `ce9bb56` |
| [PLAN-017](../../../docs/qa/test-plans/PLAN-017-subscription-orders.md) | subscription-orders | CRITICAL | CURRENT | 4 | — | `2051133` |
| [PLAN-003](../../../docs/qa/test-plans/PLAN-003-tenant-isolation.md) | tenant-isolation | CRITICAL | CURRENT | 13 | BUG-0005 | `0c61b7e` |
| [PLAN-007](../../../docs/qa/test-plans/PLAN-007-tenant-provisioning.md) | tenant-provisioning | CRITICAL | CURRENT | 15 | BUG-0014, BUG-0015, BUG-0017, BUG-0022 | `0c61b7e` |
