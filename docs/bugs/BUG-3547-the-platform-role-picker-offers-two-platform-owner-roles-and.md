---
ID: BUG-3547
aliases: [BUG-3547]
Title: The platform role picker offers two Platform Owner roles and a legacy Member role
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [apps/admin, services/api/src/modules/platform-auth]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt:
---

# BUG-3547 — The platform role picker offers two Platform Owner roles and a legacy Member role

## Summary

The platform role picker in `apps/admin` lists `SUPER_ADMIN` labelled
"Platform Owner (legacy Super Admin)" right next to `PLATFORM_OWNER` labelled
"Platform Owner" — two entries an operator would read as duplicates — and
also lists `MEMBER`, whose own source code names it `LEGACY_MEMBER_PERMISSIONS`.
An operator assigning a new platform user's role has no way to tell, from the
picker alone, which of the two "Platform Owner" options is the one to use, or
that "Member" is a legacy catch-all rather than an ordinary limited role.

## Expected Behavior

The role picker should not present two functionally-identical roles under
near-identical labels without distinguishing which is preferred, and should
not offer a role the codebase itself considers legacy without signalling that
to the person assigning it.

## Actual Behavior

`formatPlatformRole` explicitly relabels `SUPER_ADMIN` as "Platform Owner
(legacy Super Admin)" — the product's own naming already treats it as an
alias for `PLATFORM_OWNER` — yet both appear as separate, fully selectable
options in the same 16-role list, with identical permissions
(`platform.*`) and identical treatment everywhere in the codebase
(`isPlatformSuperAdmin`, the `platformAccessForRole` elevated list,
`PLATFORM_OPERATORS`). `MEMBER` uses `LEGACY_MEMBER_PERMISSIONS` internally
but is presented in the picker as an ordinary role with no "legacy" marker.

## Reproduction

1. In `apps/admin`, open the platform-user create or edit screen that uses
   the role picker (`PLATFORM_ROLES` from `apps/admin/lib/platform-rbac.ts`).
2. Observe the option list contains both "Platform Owner (legacy Super
   Admin)" (`SUPER_ADMIN`) and "Platform Owner" (`PLATFORM_OWNER`) as two
   separate, equally selectable entries.
3. Observe "Member" (`MEMBER`) is listed with no indication it is the
   pre-role-expansion legacy catch-all the source code names it.

## Evidence

- `apps/admin/lib/platform-rbac.ts:22-32` — `isPlatformSuperAdmin(role) = role
  === "SUPER_ADMIN" || role === "PLATFORM_OWNER"`; `formatPlatformRole` labels
  `SUPER_ADMIN` as `"Platform Owner (legacy Super Admin)"`, distinct from
  `PLATFORM_OWNER`'s plain `"Platform Owner"` label — both remain independently
  selectable in `PLATFORM_ROLES` (16 entries, matching the Prisma enum).
- `services/api/src/modules/platform-auth/platform-permissions.ts` —
  `ROLE_PERMISSIONS` grants `SUPER_ADMIN` and `PLATFORM_OWNER` the identical
  `platform.*` wildcard; `platformAccessForRole` (lines 261-279) treats both
  as the "elevated" pair for the `roleKeys` alias (see [[BUG-3544]]).
- `apps/admin/lib/runtime/platform-module-registry.ts:23` —
  `PLATFORM_OPERATORS = ["PLATFORM_OWNER", "PLATFORM_ADMIN", "SUPER_ADMIN"]`,
  treating `SUPER_ADMIN` and `PLATFORM_OWNER` as the same operator tier.
- `services/api/src/modules/platform-auth/platform-permissions.ts:69` —
  `MEMBER`'s permission set is named `LEGACY_MEMBER_PERMISSIONS` in source,
  and both `RolesGuard` and `platformAccessForRole` special-case it (the
  `'system-customizer'` alias) — a pre-role-expansion catch-all by every
  internal signal, with no such signal surfaced in the UI picker.
- `seed-admin.ts:38,95,102` — `SUPER_ADMIN` is the only role any seed script
  creates, i.e. the "legacy" label is also the only bootstrapped account,
  which is worth preserving even if the picker is cleaned up.

## Root Cause

The platform role model grew a second "top of the org" role
(`PLATFORM_OWNER`) after `SUPER_ADMIN` was already the seeded root account,
and the UI layer (`formatPlatformRole`) was updated to acknowledge the
relationship in its label text, but the role **picker** was never updated to
either merge the two options, hide the legacy one from new assignments, or
otherwise make the relationship obvious at selection time. `MEMBER` was never
annotated in the UI at all despite being named legacy in source.

## Impact

Cosmetic/usability — no access or data impact by itself, but it creates a
real risk of an operator assigning the "wrong" one of two identical-permission
roles to a new hire based on label confusion, or assigning `MEMBER` believing
it to be an ordinary limited role rather than a legacy catch-all being kept
only for existing accounts. Reachable in production today.

## Affected Areas

- `apps/admin/lib/platform-rbac.ts` (`PLATFORM_ROLES`, `formatPlatformRole`)
- The platform-user create/edit role-picker screen(s) in `apps/admin`
- `services/api/src/modules/platform-auth/platform-permissions.ts` (the
  underlying role/permission model these labels describe)

## Proposed Resolution

A product decision is needed on the end state (this is flagged, not
resolved, by discovery): either (a) stop offering `SUPER_ADMIN` as a
selectable option for *new* assignments while keeping it valid for existing
accounts (the seeded root account), with the picker showing only
`PLATFORM_OWNER` for new top-tier assignments, or (b) keep both selectable but
visually group/annotate them so the relationship is unmistakable at
assignment time (e.g. a "legacy" badge, or nesting one under the other).
Similarly, either hide `MEMBER` from new assignments or badge it "legacy".
No ExecPlan needed for the UI change itself; the underlying role/permission
model is unaffected either way.

## Acceptance Criteria

- An operator assigning a new platform user's role cannot confuse
  `SUPER_ADMIN` and `PLATFORM_OWNER` as two different capability tiers.
- `MEMBER` is visibly marked as legacy, or removed from new-assignment flows.
- Existing accounts on `SUPER_ADMIN`/`MEMBER` continue to function unchanged.

## Regression Coverage

`apps/admin/lib/platform-rbac.spec.ts` already covers `formatPlatformRole`'s
labels; extend it to assert whatever legacy-marking behaviour is decided. No
`REG-nnn` entry yet — this is a UX decision pending Architect/product input,
not yet a regression-tested fix.

## Dependencies

A product decision on which of the two resolution options to take (see
Proposed Resolution).

## Related Items

- [[BUG-3544]] — the same `SUPER_ADMIN`/`PLATFORM_OWNER` alias mechanism is
  the root cause of a separate authorization defect found in the same
  discovery pass.
- TASK-0032 — the program that found this.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; discovery stream D1.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032). Scope: make the
  relationship visible in the picker; the choice between hiding SUPER_ADMIN
  from new assignments vs. badging both options is left to the implementing
  specialist to raise as a question if it is not obvious from context.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[platform-auth]]

<!-- GRAPH:END -->
