# QA Coverage Matrix

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-qa.mjs`.

What each product area is actually covered by, per dimension. Every cell is
**declared by the area's test plan** and cross-checked against its scenarios:
a plan claiming `GOOD` on a dimension with no scenario of that type, or with
only scenarios that cannot run here, fails `node scripts/rebuild-qa.mjs`.

`GAP` and `PARTIAL` are the useful entries. **When a task touches an area with a**
`GAP` **or** `PARTIAL` **cell on a dimension the change affects, closing it becomes**
**part of that task's scope** — or, when that is too large, a `TEST_GAP` backlog
item. See [`README.md`](README.md).

**Areas: 27** · scenarios: 318 · automated: 276 · blocked by infrastructure: 0

**Open gaps: 142** · partial: 28

| Area | UNIT | API | DATABASE | INTEGRATION | E2E | BROWSER | SECURITY | PERFORMANCE |
|---|---|---|---|---|---|---|---|---|
| [agent-desktop](../../docs/qa/test-plans/PLAN-008-agent-desktop.md) | **GAP** | **GAP** | **GAP** | GOOD | **GAP** | n/a | PARTIAL | n/a |
| [approvals](../../docs/qa/test-plans/PLAN-022-approvals.md) | PARTIAL | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** |
| [attendance](../../docs/qa/test-plans/PLAN-009-attendance.md) | GOOD | **GAP** | **GAP** | PARTIAL | PARTIAL | **GAP** | PARTIAL | **GAP** |
| [authentication](../../docs/qa/test-plans/PLAN-001-authentication.md) | GOOD | PARTIAL | **GAP** | **GAP** | PARTIAL | **GAP** | PARTIAL | n/a |
| [authorization](../../docs/qa/test-plans/PLAN-002-authorization.md) | GOOD | **GAP** | **GAP** | **GAP** | PARTIAL | **GAP** | GOOD | n/a |
| [billing](../../docs/qa/test-plans/PLAN-020-billing.md) | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** |
| [commercial-onboarding](../../docs/qa/test-plans/PLAN-004-commercial-onboarding.md) | **GAP** | PARTIAL | **GAP** | **GAP** | PARTIAL | PARTIAL | **GAP** | n/a |
| [deployment-release](../../docs/qa/test-plans/PLAN-012-deployment-release.md) | GOOD | **GAP** | PARTIAL | **GAP** | **GAP** | **GAP** | **GAP** | n/a |
| [framework](../../docs/qa/test-plans/PLAN-029-framework.md) | PARTIAL | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| [landing](../../docs/qa/test-plans/PLAN-013-landing.md) | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | GOOD | **GAP** | **GAP** |
| [lead-management](../../docs/qa/test-plans/PLAN-005-lead-management.md) | GOOD | GOOD | **GAP** | **GAP** | **GAP** | **GAP** | GOOD | n/a |
| [leave](../../docs/qa/test-plans/PLAN-023-leave.md) | PARTIAL | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** |
| [legal](../../docs/qa/test-plans/PLAN-015-legal.md) | **GAP** | **GAP** | GOOD | n/a | **GAP** | **GAP** | **GAP** | n/a |
| [monitoring](../../docs/qa/test-plans/PLAN-030-monitoring.md) | GOOD | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** |
| [outbox](../../docs/qa/test-plans/PLAN-014-outbox.md) | **GAP** | n/a | GOOD | **GAP** | **GAP** | n/a | n/a | **GAP** |
| [partner-lifecycle](../../docs/qa/test-plans/PLAN-006-partner-lifecycle.md) | **GAP** | GOOD | **GAP** | **GAP** | **GAP** | PARTIAL | **GAP** | n/a |
| [payroll](../../docs/qa/test-plans/PLAN-010-payroll.md) | GOOD | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | PARTIAL | **GAP** |
| [platform-admin](../../docs/qa/test-plans/PLAN-019-platform-admin.md) | **GAP** | **GAP** | **GAP** | **GAP** | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| [reports](../../docs/qa/test-plans/PLAN-034-reports.md) | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** |
| [routing](../../docs/qa/test-plans/PLAN-031-routing.md) | GOOD | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** |
| [runtime-modules](../../docs/qa/test-plans/PLAN-011-runtime-modules.md) | GOOD | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | PARTIAL | n/a |
| [seat-billing](../../docs/qa/test-plans/PLAN-016-seat-billing.md) | **GAP** | n/a | GOOD | **GAP** | **GAP** | n/a | **GAP** | **GAP** |
| [settings](../../docs/qa/test-plans/PLAN-021-settings.md) | PARTIAL | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** |
| [subscription-changes](../../docs/qa/test-plans/PLAN-018-subscription-changes.md) | **GAP** | **GAP** | GOOD | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** |
| [subscription-orders](../../docs/qa/test-plans/PLAN-017-subscription-orders.md) | **GAP** | **GAP** | GOOD | **GAP** | **GAP** | **GAP** | **GAP** | **GAP** |
| [tenant-isolation](../../docs/qa/test-plans/PLAN-003-tenant-isolation.md) | PARTIAL | **GAP** | PARTIAL | **GAP** | PARTIAL | **GAP** | PARTIAL | n/a |
| [tenant-provisioning](../../docs/qa/test-plans/PLAN-007-tenant-provisioning.md) | GOOD | **GAP** | **GAP** | **GAP** | PARTIAL | **GAP** | **GAP** | n/a |

## Dimensions

| Dimension | Evidenced by scenarios of type |
|---|---|
| UNIT | `UNIT` |
| API | `API` |
| DATABASE | `DATABASE` |
| INTEGRATION | `INTEGRATION` |
| E2E | `E2E` |
| BROWSER | `BROWSER_E2E` |
| SECURITY | `SECURITY` |
| PERFORMANCE | `PERFORMANCE` |

## Statuses

| Status | Means |
|---|---|
| `GOOD` | The dimension is covered by scenarios that run, and a regression would be caught |
| `PARTIAL` | Some cases covered; named holes remain, stated in the plan |
| `GAP` | Not covered. A change here is not protected by anything |
| `NOT_APPLICABLE` | The dimension does not apply — say why in the plan |

`BLOCKED_INFRASTRUCTURE` scenarios count towards `PARTIAL` and never towards
`GOOD`. Coverage that cannot execute is a plan, not a test.
