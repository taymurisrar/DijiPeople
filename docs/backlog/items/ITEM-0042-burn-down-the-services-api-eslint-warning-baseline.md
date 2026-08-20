---
ID: ITEM-0042
aliases: [ITEM-0042]
Title: Burn down the services/api ESLint warning baseline
Type: TECH_DEBT
Status: READY
Priority: P3
Severity: LOW
AffectedModules: [services/api]
Source: ARCHITECT
OwnerAgent: backend-api
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0042 — Burn down the services/api ESLint warning baseline

## Summary

`services/api` lints with **0 errors and ~910 warnings**. The errors were cleared
on 2026-08-17 and the job was promoted into the required `lint` gate; the
warnings remain, permitted by `--max-warnings=10000`.

Exact composition, measured on `develop` at promotion:

| Count | Rule |
|---|---|
| 359 | `@typescript-eslint/no-unsafe-member-access` |
| 246 | `@typescript-eslint/no-unsafe-assignment` |
| 91 | `@typescript-eslint/no-unsafe-argument` |
| 73 | `@typescript-eslint/no-unsafe-call` |
| 48 | `@typescript-eslint/no-unsafe-return` |
| 44 | `@typescript-eslint/no-base-to-string` |
| 43 | `@typescript-eslint/no-unused-vars` |
| ~6 | everything else |

## Why It Matters

Roughly 817 of the 910 are one family: values typed `any` flowing through the
code, overwhelmingly in specs and in Prisma-adjacent code where a query result is
untyped. Individually each is minor. Together they are the reason nobody read
this job's output — which is how its **error** count grew from 2 to 15 unnoticed
while the job was report-only.

`no-base-to-string` is worth attention on its own: 44 sites stringify a value
that may render as `[object Object]`, and several are in error paths —
`` `error ?? ''` `` in `sanitize-error-log.ts` among them. An error message that
reads `[object Object]` in a production log is a lost incident.

## Proposed Approach

**Not a single sweep.** A 910-warning cleanup is unreviewable and would collide
with everything in flight.

- Ratchet `--max-warnings` down as the count falls, so it can never grow back.
  Start just under the current count, then step down.
- `no-base-to-string` first — smallest, highest value, affects production output.
- `no-unused-vars` (43) next — mechanical and safe.
- The `no-unsafe-*` family last, and by module rather than by rule: fixing it
  properly means typing Prisma results, not adding casts.

## Acceptance Criteria

- `--max-warnings` is a ratchet below the current count, lowered as work lands.
- `no-base-to-string` reaches zero.
- No warning is silenced by disabling a rule or adding a blanket
  `eslint-disable`.

## Dependencies

None. Deliberately `DEFER`: the gate is green and protected by a ceiling, so this
is real debt with no live consequence.

## Related Items

[[ITEM-0043]] · [[BUG-0047]]

## History

- 2026-08-17 — raised when `Lint services/api` was promoted to a required gate.
  The errors are gone; this records what is left, with a burn-down that needs no
  flag day.

- 2026-08-17 — reconciled to `FIX_NOW`: the ratchet and module-by-module order
  already make this executable; effort alone is not a durable defer reason.
