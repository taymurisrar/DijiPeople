---
ID: BUG-3547
aliases: [BUG-3547]
Title: The platform role picker offers two Platform Owner roles and a legacy Member role
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [apps/admin, services/api/src/modules/platform-auth]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-528
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
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

REG-528 (`apps/admin/lib/platform-rbac.spec.ts` — "BUG-3547 the role picker
offers each role once", "formatPlatformRole";
`services/api/src/modules/platform-users/platform-users-rbac.spec.ts` —
"BUG-3547 new assignments of retired roles"). Proven to fail against the
pre-fix code: the 5 retired-role tests fail when `platform-users.service.ts`
is reverted to `10d5d148`, and at that commit `platform-rbac.ts` exports no
`platformRoleOptions`/`isAssignablePlatformRole`/`DEFAULT_NEW_PLATFORM_ROLE`
and still labels `SUPER_ADMIN` "Platform Owner (legacy Super Admin)".

## Dependencies

Resolved — WP-02 implemented option (a): `SUPER_ADMIN` now reads "Platform
Super Admin" (a single, correctly-labelled entry, no "(legacy …)" suffix), and
neither `PLATFORM_OWNER` nor `MEMBER` is offered for a *new* assignment (the
picker defaults to `READ_ONLY_AUDITOR`); both remain valid and functioning for
existing accounts (`PLATFORM_ROLE_NOT_ASSIGNABLE` on an attempt to newly
assign either).

## Related Items

- [[BUG-3544]] — the same `SUPER_ADMIN`/`PLATFORM_OWNER` alias mechanism is
  the root cause of a separate authorization defect found in the same
  discovery pass.
- TASK-0032 — the program that found this.

## Resolution

Fixed by commits `63ebc122` and `3b2dbf6e` on `agent/pah-wp02-rbac`
(TASK-0032 WP-02, merged as `d5535f0a`): `SUPER_ADMIN` now labels as "Platform
Super Admin"; the picker for a new assignment offers 14 roles, excluding
`PLATFORM_OWNER` and `MEMBER`, defaulting to `READ_ONLY_AUDITOR`; assigning
either retired role to a new user returns `400 PLATFORM_ROLE_NOT_ASSIGNABLE`
naming the role to use instead; an unchanged existing `MEMBER`'s own role is
still accepted on save.

## QA Retest

Verified by TASK-0032 WP-09 live QA against the throwaway stack and the
passing `platform-rbac.spec.ts` / `platform-users-rbac.spec.ts`.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; discovery stream D1.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032). Scope: make the
  relationship visible in the picker; the choice between hiding SUPER_ADMIN
  from new assignments vs. badging both options is left to the implementing
  specialist to raise as a question if it is not obvious from context.
- 2026-09-25 — fixed at `63ebc122`/`3b2dbf6e` (WP-02, option (a) — retire both
  `PLATFORM_OWNER` and `MEMBER` from new assignments); verified by WP-09 live
  QA; Architect disposition DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[platform-auth]]
- Regression — REG-528 (see the regression register)

<!-- GRAPH:END -->
