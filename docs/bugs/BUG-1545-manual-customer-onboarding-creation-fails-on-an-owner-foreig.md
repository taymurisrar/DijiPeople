---
ID: BUG-1545
aliases: [BUG-1545]
Title: Manual customer onboarding creation fails on an owner foreign key
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [platform-runtime, onboarding]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-290
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1545 — Manual customer onboarding creation fails on an owner foreign key

> **Architect triage, 2026-08-27 — `PLAN_REQUIRED`.** The owner relation is a modelling decision -- whether a platform user may own an onboarding -- not a null check. May need an ADR.


## Summary

Creating a customer onboarding from the admin console fails with a foreign key
violation. The backend defaults the onboarding owner to the acting platform
user's id, and that id is not a valid `User` reference, so the insert is
rejected. Admin-initiated provisioning is blocked; the paid signup path, which
sets the owner differently, is unaffected.

## Expected Behavior

A platform operator can create a customer onboarding from the admin console.
Whatever the owner defaults to, it resolves to a record the foreign key accepts.

## Actual Behavior

`POST /api/platform-runtime/customer-onboarding` fails on
`CustomerOnboarding_onboardingOwnerUserId_fkey` (Prisma `P2003`, Postgres
`23503`).

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open Onboarding and start a new onboarding record.
3. Complete the required fields and save.
4. Observe the constraint failure.

## Evidence

Observed on production, 2026-08-26. The response body named the constraint
`CustomerOnboarding_onboardingOwnerUserId_fkey` with Prisma error `P2003` and
the underlying Postgres `23503`.

The paid signup path provisioned successfully in the same session, so the defect
is specific to admin-initiated creation.

## Root Cause

Not established beyond the observed constraint. The acting principal on this
route is a platform user (`authSubjectType: 'platform-user'`), and
`onboardingOwnerUserId` references the tenant-side `User` model. Defaulting one
to the other cannot succeed, but whether the default is the intended behaviour
or a fallback that was never exercised has not been confirmed.

## Impact

Platform operators cannot create onboardings by hand. Any customer who does not
arrive through paid self-service — a partner-sourced deal, a migrated account, a
manually negotiated contract — cannot be provisioned through the console.

The commercial path works, so this is a gap in operator tooling rather than a
revenue blocker.

## Affected Areas

- `services/api/src/modules/platform-runtime` — customer onboarding create
- `services/api/src/modules/onboarding`
- `apps/admin` — the Onboarding create form
- `CustomerOnboarding.onboardingOwnerUserId` in `schema.prisma`

## Proposed Resolution

Decide what the owner of an admin-created onboarding should be, rather than
defaulting to whichever principal happened to make the call. If a platform user
is a legitimate owner, the column needs to express that; if it must be a tenant
user, the form should require one and the default should be removed.

This is a modelling decision, not a null check — it should be settled before a
patch.

## Acceptance Criteria

- A platform operator can create a customer onboarding from the console.
- The owner stored resolves to a real record under whatever relation is chosen.
- Leaving the owner unset either succeeds with a defined meaning or is rejected
  by validation before reaching the database.

## Regression Coverage

None yet. Needs a test that creates an onboarding as a platform principal.
Requires a `REG-nnn` entry once written.

## Dependencies

None, though the modelling decision may warrant an ADR.

## Related Items

Found in the same production admin E2E pass as [[BUG-1515]]. Shares a surface
with [[BUG-1547]] and [[BUG-1548]], which are also onboarding-form defects.

## Resolution

Partially fixed 2026-08-28 on `agent/open-bug-sweep`. The crash is gone; the
modelling decision this record asks for is **still open**, deliberately.

What was happening: `CustomerOnboarding.onboardingOwnerUserId` is declared
`User?` — a *tenant* user — and the create expression fell back to
`customer.assignedToUserId` and then `actor.platform?.id`. Both are
`PlatformUser` ids (`CustomerAccount.assignedToUser` is declared
`PlatformUser?`), so the insert was rejected by the foreign key every time.

The fallbacks are removed. An admin-created onboarding now takes the owner the
form supplied, or none — the column is nullable — so admin-initiated
provisioning works again.

**What is not settled, and should be.** Two reads in the same file filter this
column by `actor.platform?.id`, so the code's own intent is plainly a platform
user and the *relation* is what is wrong. This codebase's convention agrees:
`CustomerAccount` carries `assignedToUser` and `accountManagerUser` as
`PlatformUser`, and `primaryOwnerUser` as `User`. An onboarding is platform-side
work, so `onboardingOwnerUserId` should almost certainly reference
`PlatformUser`.

Repointing a foreign key is a migration with a data question behind it — any row
already holding a real `User` id would fail it — and this record explicitly says
the modelling decision should be settled rather than patched. So it is left for
an ExecPlan. Until then, the "my onboardings" filters that read this column
return nothing, which is what they already did.

## QA Retest

Not retested against a database.

`onboarding-prerequisites.spec.ts` asserts no platform id can be written to the
column — both fallbacks, by name, since each was independently wrong.

**Retest should confirm two things:** that creating a customer onboarding from
the admin console now succeeds, and that the onboarding it creates has no owner.
The second is the visible consequence of leaving the modelling open, and if that
is unacceptable to operations then the migration is the answer rather than
restoring a fallback that writes an id the column cannot hold.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - the FK violation is fixed by not writing a platform id into a tenant-user column. The relation itself is still wrong and needs an ExecPlan. REG-290.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-290 (see the regression register)

<!-- GRAPH:END -->
