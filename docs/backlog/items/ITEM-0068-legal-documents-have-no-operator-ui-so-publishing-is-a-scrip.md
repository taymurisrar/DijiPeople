---
ID: ITEM-0068
aliases: [ITEM-0068]
Title: Legal documents have no operator UI, so publishing is a script
Type: UX
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [legal, admin]
Source: IMPLEMENTATION
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation: TASK-0009
TargetMilestone:
BlockedBy:
---

# ITEM-0068 — Legal documents have no operator UI, so publishing is a script

## Summary

The `legal` module has exactly one controller — `public-legal.controller.ts` —
which serves published versions to anonymous visitors and 404s otherwise. There
is no platform-admin controller, no route, no screen.

So `LegalService` carries `publish()`, `createDraft()` and `updateDraft()`, and
**nothing calls any of them.** They were written, tested at the unit level, and
left unreachable. That is `declared-but-unwired-step`, and its consequence here
was silent rather than loud: with nothing published, the subscribe wizard
required no agreements, and every purchase recorded no consent at all.

`npm --workspace api run legal:publish` now exists and closes the immediate gap.
This item is the rest of it.

## Why a script was the right first move, and is not the right end state

The script is deliberate, auditable, idempotent, dry-run by default, and it
attributes publication to a real platform user. It unblocks the owner today and
it is repeatable across environments.

What it cannot do:

- **Show the operator what they are about to publish.** Publishing binds
  customers to a text. Doing that from a terminal, without seeing the rendered
  document or a diff against the version it replaces, is the wrong ceremony for
  the act.
- **Let anyone but a database-credential holder do it.** Legal text is owned by
  whoever is accountable for it, and that is not necessarily an engineer.
- **Support the ordinary lifecycle.** A correction means `createDraft()` →
  edit → review → publish. Only the last of those four has a door, so a
  correction today means editing `seed-legal.ts` and redeploying, which is an
  absurd path for a typo in a privacy policy.
- **Schedule an effective date.** `publish()` accepts `effectiveFrom` and the
  script never passes it, so every publication is immediate. Giving customers
  notice of a terms change is a normal obligation and currently impossible.

## Proposed Approach

A platform-admin surface in `apps/admin`, behind the existing platform guard:

1. `legal.controller.ts` under the platform path — list documents, read a
   version, create a draft, update a draft, publish with an optional
   `effectiveFrom`. Both permission decorators, as every guarded controller in
   this repository carries.
2. A screen that renders the markdown, shows a diff against the version in
   force, names the placeholders still unfilled, and requires an explicit
   confirmation naming the document.
3. Keep the script. It is the right tool for a fresh environment and for CI, and
   the two paths share `LegalService` so they cannot drift.

Needs an ExecPlan: it adds a controller, permission keys and an admin screen,
and the permission keys are the part worth getting right first.

## Acceptance Criteria

- An operator with the right permission can publish without database access.
- The screen shows the rendered text and a diff before any publication.
- Unfilled placeholders are listed before the attempt, not thrown after it.
- `effectiveFrom` can be set to a future date.
- The script keeps working and keeps sharing `LegalService`.
- Publication is attributed to the acting platform user, never to a constant.

## Evidence

- `ls services/api/src/modules/legal/` — `public-legal.controller.ts` is the
  only controller.
- `grep -rn "legalService.publish\|legal.publish" services/api/src` — no caller
  before this task.
- `services/api/prisma/publish-legal.ts` — the script written to close the gap.
- `services/api/test/legal-publish.e2e-spec.ts` — the contract the UI must also
  satisfy.

## Related Items

- [[TASK-0009]] — where the script was written.
- [[TASK-0008]] — the parent whose checkout was capturing no consent because of
  this.
- [[declared-but-unwired-step]] — the pattern.
