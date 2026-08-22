---
ID: ITEM-0004
aliases: [ITEM-0004]
Title: Tenant activation to ACTIVE has never been reached in any test
Type: TEST_GAP
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [services/api/src/modules/tenant-control-plane]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: DONE
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-22
RelatedBug: BUG-0015
RelatedQA: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0004 — Tenant activation to ACTIVE has never been reached in any test

## Summary

The commercial onboarding E2E proved every activation **gate** — five negative
scenarios, A16.01 through A16.05 — but never reached a successful activation,
because [[BUG-0015]] stranded the test tenant with no owner.

## Why It Matters

The gates are proven; the path through them is not. Everything after activation
is therefore unproven too: post-activation owner and session behaviour, and the
final eight-tab tenant verification the run planned as A17.

This is the end of the primary commercial journey. The product's most important
flow has a proven beginning, a proven middle and an unobserved end.

## Evidence

`docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md`:

- Scope, Not covered: "tenant activation to ACTIVE (blocked by a defect)".
- Known Limitations: "The activation *gates* were proven (A16.01–A16.05); the
  successful activation path, post-activation owner/session behaviour and the
  final eight-tab tenant verification (A17) are **unproven**."
- Verdict table: `TENANT_PROVISIONING` = **FAIL**.

Flow B stopped for the same reason after conversion and onboarding seed.

## Proposed Approach

[[BUG-0015]] is verified, so re-run scenarios A11–A17 of the existing run
against a tenant provisioned cleanly, and record a new QA run rather than
amending the old one — runs are history.

## Acceptance Criteria

A tenant reaches `ACTIVE` in a recorded QA run, its owner can sign in, and the
eight tenant tabs render for that tenant.

## Dependencies

None. BUG-0015 discharged the former blocker; this is now ready QA work.

## Related Items

[[BUG-0015]] · [[BUG-0022]] · modules [[tenant-provisioning|Tenant Provisioning]],
[[tenant-control-plane|Tenant Control Plane]] ·
requirement [[requirement-commercial-onboarding|Commercial Onboarding]].

## Resolution — 2026-08-22, SESSION-0040

Closed by `services/api/test/tenant-activation.e2e-spec.ts` — seventeen tests,
DB-backed, over real HTTP, registered as REG-222 with scenario
[[QA-PROV-005]].

**A tenant reaches `ACTIVE`, and its owner signs in.** The end of the primary
commercial journey has now been observed.

### Against the acceptance criteria

| Criterion | Evidence |
|---|---|
| A tenant reaches `ACTIVE` in a recorded QA run | `status` and `subStatus` read back from the `Tenant` row after `POST /platform/tenants/:id/status`; recorded in `docs/qa/runs/2026-08-22-tenant-activation-be0fd00.md` |
| Its owner can sign in | `POST /api/auth/login` succeeds, returning the owner's user, the tenant id and an access token |
| The eight tenant tabs render for that tenant | all eight `TENANT_PANEL_TABS` endpoints serve data for the activated tenant |

### What the run is driven as

A real platform operator, signed in through `POST /api/admin/auth/login` — not a
hand-minted token. The point of this item was that the journey had never been
walked; walking it with a fabricated session would have skipped part of it.

### Two things the shape of the suite is doing on purpose

**The owner sign-in is a pair.** Refused before activation, accepted after,
against the same account. Asserting only the second would pass on a build where a
suspended workspace never locked anybody out — which is the half with the
security consequence, and `AuthService.login` refusing a non-`ACTIVE` tenant is
the behaviour being relied on.

**The activation is read from the record, not the response.** A handler that
echoed the requested status would satisfy a response check.

### One gate re-driven, and why

A16.01–A16.05 already prove the gates and repeating them would be waste. The
routing refusal is re-driven immediately before the success, because without it
"activation returned 201" is equally consistent with a build where the gate was
deleted. Proven: disabling the routing gate fails three tests.

### A finding, raised rather than absorbed

The tenant reaches `ACTIVE` with one readiness blocker still standing —
*"No module is enabled, so the workspace has nothing a user can open"* — because
the gate filters readiness down to the routing checks. The owner then signs in
successfully and lands somewhere empty.

That is [[ITEM-0079]], `PRODUCT_DECISION`: the gap is established, but whether
the platform should refuse an activation on an operator's behalf is a product
call. The suite asserts today's behaviour deliberately, so the decision cannot be
lost — if the gate is extended, the assertion fails and names the item.

### Verification

```
npx jest --config ./test/jest-e2e.json \
  --runTestsByPath test/tenant-activation.e2e-spec.ts
→ 17 passed
```

Against a throwaway PostgreSQL migrated from `schema.prisma`. The one piece of
shared state the suite touches — the `tenant-provisioning` platform setting the
routing gate reads — is snapshotted and restored.

## History

- 2026-08-15 — imported from the commercial onboarding E2E's Known Limitations.

- 2026-08-15 — Unblocked. `BlockedBy: BUG-0015` is discharged — the identity step is idempotent and retryable, a retry converges, and a run may no longer report SUCCEEDED while the tenant lacks an owner. Reaching ACTIVE in a recorded run is now ordinary work rather than an obstacle. It remains unreached: this task proved the recovery anchors against a real database and the journey as far as the tenant operations surface in a browser, not a successful activation.

- 2026-08-22 — resolved in SESSION-0040. A tenant reached ACTIVE, its owner signed in, and all eight tabs served data. ITEM-0079 raised from what the run exposed.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0015]]
- Modules — [[tenant-control-plane]]
- QA run — [[2026-08-15-commercial-onboarding-e2e-7bbab3d]]

<!-- GRAPH:END -->
