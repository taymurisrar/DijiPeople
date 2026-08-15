# Open Backlog

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Active work: bugs that are `OPEN` / `IN_PROGRESS` / `FIXED` (fixed but not yet
QA-verified), and items that are `NEW` / `TRIAGE_REQUIRED` / `READY` /
`IN_PROGRESS` / `VALIDATING`.

The Architect reads this before planning any substantial change —
`BACKLOG_PRECHECK` in [`.agent/agents/architect.md`](../../.agent/agents/architect.md).

## Awaiting Architect triage

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0019](../../docs/bugs/BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable.md) | Partner inquiry and onboarding review screens have no inbound link | UX | HIGH | P1 | OPEN | apps/admin | TRIAGE_REQUIRED |
| [ITEM-0003](../../docs/backlog/items/ITEM-0003-tenant-erasure-never-exercised-against-a-database.md) | Tenant erasure has never been exercised against a database | TEST_GAP | HIGH | P1 | TRIAGE_REQUIRED | api:tenant-control-plane | TRIAGE_REQUIRED |
| [BUG-0020](../../docs/bugs/BUG-0020-window-prompt-used-for-governed-reasons.md) | window.prompt collects governed reasons instead of the design system dialog | UX | MEDIUM | P2 | OPEN | apps/admin, apps/web | TRIAGE_REQUIRED |
| [BUG-0021](../../docs/bugs/BUG-0021-landing-contact-form-fabricates-lead-data.md) | The landing contact form fabricates lead data and has no honeypot | DATA_INTEGRITY | MEDIUM | P2 | OPEN | apps/landing, api:leads | TRIAGE_REQUIRED |
| [BUG-0022](../../docs/bugs/BUG-0022-provision-tenant-has-no-confirmation-step.md) | "Provision tenant" has no confirmation step and no idempotency key | UX | MEDIUM | P2 | OPEN | apps/admin, api:tenant-control-plane | TRIAGE_REQUIRED |
| [ITEM-0002](../../docs/backlog/items/ITEM-0002-no-live-api-session-test-harness.md) | No harness exists for testing against a running API with real sessions | TEST_GAP | MEDIUM | P2 | TRIAGE_REQUIRED | services/api, apps/admin | TRIAGE_REQUIRED |
| [ITEM-0005](../../docs/backlog/items/ITEM-0005-customeraccount-leadid-has-no-unique-constraint.md) | CustomerAccount.leadId has no unique constraint, so double conversion is unprevented | TECH_DEBT | MEDIUM | P2 | TRIAGE_REQUIRED | services/api/prisma, api:super-admin | TRIAGE_REQUIRED |
| [ITEM-0006](../../docs/backlog/items/ITEM-0006-adr-one-source-of-truth-for-the-tenant-base-domain.md) | ADR needed — one source of truth for the tenant base domain | ARCHITECTURE | MEDIUM | P2 | TRIAGE_REQUIRED | pkg:config, services/api, apps/web, apps/admin, apps/landing | TRIAGE_REQUIRED |
| [ITEM-0009](../../docs/backlog/items/ITEM-0009-no-observability-platform-exists.md) | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | P2 | TRIAGE_REQUIRED | services/api, apps/web, apps/admin | TRIAGE_REQUIRED |
| [ITEM-0010](../../docs/backlog/items/ITEM-0010-deployed-sha-is-not-exposed.md) | The running system does not expose its deployed SHA | INFRA | MEDIUM | P2 | READY | services/api | TRIAGE_REQUIRED |
| [ITEM-0012](../../docs/backlog/items/ITEM-0012-cross-check-route-methods-against-their-callers.md) | Cross-check app/api route methods against the hrefs that target them | TEST_GAP | MEDIUM | P2 | TRIAGE_REQUIRED | apps/web, apps/admin | TRIAGE_REQUIRED |
| [ITEM-0013](../../docs/backlog/items/ITEM-0013-assert-every-public-controller-is-rate-limited.md) | Assert mechanically that every @Public() controller carries the rate-limit guard | TEST_GAP | MEDIUM | P2 | READY | services/api | TRIAGE_REQUIRED |
| [ITEM-0014](../../docs/backlog/items/ITEM-0014-branch-protection-is-not-configured.md) | Branch protection is not configured on the remote | INFRA | MEDIUM | P2 | TRIAGE_REQUIRED | .github | TRIAGE_REQUIRED |
| [BUG-0024](../../docs/bugs/BUG-0024-start-onboarding-api-and-proxy-have-no-caller.md) | The start-onboarding API endpoint and its proxy have no caller | BUG | LOW | P3 | OPEN | apps/admin, api:super-admin | TRIAGE_REQUIRED |
| [ITEM-0011](../../docs/backlog/items/ITEM-0011-framework-validation-should-catch-absence-claims.md) | Framework validation should catch false absence claims in context documents | TECH_DEBT | LOW | P3 | TRIAGE_REQUIRED | .agent/context, scripts | TRIAGE_REQUIRED |
| [ITEM-0015](../../docs/backlog/items/ITEM-0015-make-the-tenant-readiness-assertion-auditable.md) | Make the tenant readiness() authorization assertion auditable | FOLLOW_UP | LOW | P3 | TRIAGE_REQUIRED | api:tenant-control-plane | TRIAGE_REQUIRED |

## CRITICAL

_None._

## HIGH

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0015](../../docs/bugs/BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable.md) | A tenant that fails before identities-and-billing is permanently unrecoverable | STATE_MACHINE | HIGH | P1 | OPEN | api:tenant-control-plane | PLAN_REQUIRED |
| [BUG-0019](../../docs/bugs/BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable.md) | Partner inquiry and onboarding review screens have no inbound link | UX | HIGH | P1 | OPEN | apps/admin | TRIAGE_REQUIRED |
| [ITEM-0003](../../docs/backlog/items/ITEM-0003-tenant-erasure-never-exercised-against-a-database.md) | Tenant erasure has never been exercised against a database | TEST_GAP | HIGH | P1 | TRIAGE_REQUIRED | api:tenant-control-plane | TRIAGE_REQUIRED |

## MEDIUM

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0009](../../docs/bugs/BUG-0009-session-revocation-depended-on-the-refresh-cookie.md) | Server-side session revocation depended on the refresh cookie surviving | SECURITY | MEDIUM | P2 | FIXED | app:admin, api:auth | FIX_NOW |
| [BUG-0010](../../docs/bugs/BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500.md) | Unguarded cookie options could turn admin sign-out into a 500 | INFRA | MEDIUM | P2 | FIXED | app:admin | FIX_NOW |
| [BUG-0017](../../docs/bugs/BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance.md) | The admin-editable tenant base domain does not drive hostname issuance | INTEGRATION | MEDIUM | P2 | OPEN | pkg:config, api:tenant-control-plane | PLAN_REQUIRED |
| [BUG-0020](../../docs/bugs/BUG-0020-window-prompt-used-for-governed-reasons.md) | window.prompt collects governed reasons instead of the design system dialog | UX | MEDIUM | P2 | OPEN | apps/admin, apps/web | TRIAGE_REQUIRED |
| [BUG-0021](../../docs/bugs/BUG-0021-landing-contact-form-fabricates-lead-data.md) | The landing contact form fabricates lead data and has no honeypot | DATA_INTEGRITY | MEDIUM | P2 | OPEN | apps/landing, api:leads | TRIAGE_REQUIRED |
| [BUG-0022](../../docs/bugs/BUG-0022-provision-tenant-has-no-confirmation-step.md) | "Provision tenant" has no confirmation step and no idempotency key | UX | MEDIUM | P2 | OPEN | apps/admin, api:tenant-control-plane | TRIAGE_REQUIRED |
| [ITEM-0002](../../docs/backlog/items/ITEM-0002-no-live-api-session-test-harness.md) | No harness exists for testing against a running API with real sessions | TEST_GAP | MEDIUM | P2 | TRIAGE_REQUIRED | services/api, apps/admin | TRIAGE_REQUIRED |
| [ITEM-0005](../../docs/backlog/items/ITEM-0005-customeraccount-leadid-has-no-unique-constraint.md) | CustomerAccount.leadId has no unique constraint, so double conversion is unprevented | TECH_DEBT | MEDIUM | P2 | TRIAGE_REQUIRED | services/api/prisma, api:super-admin | TRIAGE_REQUIRED |
| [ITEM-0006](../../docs/backlog/items/ITEM-0006-adr-one-source-of-truth-for-the-tenant-base-domain.md) | ADR needed — one source of truth for the tenant base domain | ARCHITECTURE | MEDIUM | P2 | TRIAGE_REQUIRED | pkg:config, services/api, apps/web, apps/admin, apps/landing | TRIAGE_REQUIRED |
| [ITEM-0009](../../docs/backlog/items/ITEM-0009-no-observability-platform-exists.md) | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | P2 | TRIAGE_REQUIRED | services/api, apps/web, apps/admin | TRIAGE_REQUIRED |
| [ITEM-0010](../../docs/backlog/items/ITEM-0010-deployed-sha-is-not-exposed.md) | The running system does not expose its deployed SHA | INFRA | MEDIUM | P2 | READY | services/api | TRIAGE_REQUIRED |
| [ITEM-0012](../../docs/backlog/items/ITEM-0012-cross-check-route-methods-against-their-callers.md) | Cross-check app/api route methods against the hrefs that target them | TEST_GAP | MEDIUM | P2 | TRIAGE_REQUIRED | apps/web, apps/admin | TRIAGE_REQUIRED |
| [ITEM-0013](../../docs/backlog/items/ITEM-0013-assert-every-public-controller-is-rate-limited.md) | Assert mechanically that every @Public() controller carries the rate-limit guard | TEST_GAP | MEDIUM | P2 | READY | services/api | TRIAGE_REQUIRED |
| [ITEM-0014](../../docs/backlog/items/ITEM-0014-branch-protection-is-not-configured.md) | Branch protection is not configured on the remote | INFRA | MEDIUM | P2 | TRIAGE_REQUIRED | .github | TRIAGE_REQUIRED |

## LOW and unrated

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0023](../../docs/bugs/BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist.md) | The testing-architecture context claims two e2e specs do not exist | DOCUMENTATION | LOW | P3 | OPEN | .agent/context | FIX_NOW |
| [BUG-0024](../../docs/bugs/BUG-0024-start-onboarding-api-and-proxy-have-no-caller.md) | The start-onboarding API endpoint and its proxy have no caller | BUG | LOW | P3 | OPEN | apps/admin, api:super-admin | TRIAGE_REQUIRED |
| [ITEM-0011](../../docs/backlog/items/ITEM-0011-framework-validation-should-catch-absence-claims.md) | Framework validation should catch false absence claims in context documents | TECH_DEBT | LOW | P3 | TRIAGE_REQUIRED | .agent/context, scripts | TRIAGE_REQUIRED |
| [ITEM-0015](../../docs/backlog/items/ITEM-0015-make-the-tenant-readiness-assertion-auditable.md) | Make the tenant readiness() authorization assertion auditable | FOLLOW_UP | LOW | P3 | TRIAGE_REQUIRED | api:tenant-control-plane | TRIAGE_REQUIRED |
