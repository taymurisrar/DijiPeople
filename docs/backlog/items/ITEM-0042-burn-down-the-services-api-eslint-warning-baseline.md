---
ID: ITEM-0042
aliases: [ITEM-0042]
Title: Burn down the services/api ESLint warning baseline
Type: TECH_DEBT
Status: DONE
Priority: P3
Severity: LOW
AffectedModules: [services/api]
Source: ARCHITECT
OwnerAgent: backend-api
ArchitectDisposition: DONE
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-22
RelatedBug: BUG-0668
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

## Resolution — 2026-08-22, SESSION-0040

Both named rules are at **zero**, the ratchet is down, and nothing was silenced.

| | Before | After |
|---|---|---|
| `no-base-to-string` | 41 | **0** |
| `no-unused-vars` | 17 | **0** |
| total warnings | 989 | **800** |
| errors | 0 | 0 |
| `--max-warnings` | 975 | **805** |

### Against the acceptance criteria

| Criterion | Status |
|---|---|
| `--max-warnings` is a ratchet below the current count | 805 against 800 measured, with the five-warning margin documented as drift allowance rather than headroom |
| `no-base-to-string` reaches zero | yes |
| No warning silenced by disabling a rule or a blanket `eslint-disable` | none added; the single site inside `toDisplayString` itself was fixed by casting to `{ toString(): string }`, which is what the runtime guard above it had already established |

### `no-base-to-string`, 41 → 0

37 sites were `String(x)` on a value whose type promises no useful `toString`,
replaced mechanically with `toDisplayString`. Four were done by hand: three
multi-line calls the column-based codemod would have had to guess at, and
`toDisplayString`'s own last resort.

The item said this rule was worth attention on its own, and it was right. Several
sites are in error paths, and an error message that reads `[object Object]` in a
production log is a lost incident.

### `no-unused-vars`, 17 → 0 — and why they were not swept

Prefixing seventeen names with `_` would have taken twenty seconds and buried
two defects. Each was decided on its own merits, and they fell into three groups:

**Genuinely dead, deleted** — a computed-and-discarded seat price, a name split
into first and last and used for neither, and four functions nothing calls.

**Kept for the side effect, binding dropped** — `getStateUsage` calls
`getState` purely because it throws `NotFoundException` for an unknown id, and
`documents.upload` runs two validators and reads one result. Deleting those
calls would have removed a 404 and a tenant-scope check. Both now carry a comment
saying so, because the next person to see an unused binding will reach for the
same delete.

**Real defects** — two:

- [[BUG-0668]] — `resolveExchangeRate` accepted an `effectiveDate` and never
  queried it, on a model that is effective-dated by design. A February conversion
  used August's rate, and `convertMoney` forwards its caller's date, so a caller
  who did everything right still got the wrong number.
- [[BUG-0669]] — `PATCH /settings/my-preferences` had a validation DTO with
  correct rules that nothing referenced; the handler took
  `Record<string, unknown>`, so the global pipe had no metadata and the endpoint
  accepted any body.

That is the answer to "why bother with 910 warnings nobody reads": one of them
was silently returning the wrong exchange rate and one was an unvalidated
endpoint, and both had been reported for as long as the baseline existed.

### The `no-unsafe-*` family — the method, proven

Not swept either, and the leave module is the worked example. `leave.service.ts`
(93) and `leave.repository.ts` (21) held eight `(this.prisma as any)` casts,
written when `LeavePolicyAssignment` was not yet in the schema and left behind
after it was.

Removing them took the module to **zero** — and the compiler immediately reported
**four real type errors** the casts had been hiding:

1. `createLeavePolicyAssignment(data: Record<string, unknown>)` — any shape at
   all could reach `prisma.create`;
2. and 3. `string | null` from a row against `string | undefined` from a DTO,
   in the two helpers that validate an assignment's scope;
4. `.filter(Boolean)`, which removes nulls at runtime and leaves them in the
   type, so every read in the comparator below it was on a possibly-null value.

None was found by reading. Each was found by deleting a cast. **Adding a cast to
silence one of these warnings destroys exactly this yield**, which is why the
successor item forbids it.

### What remains

[[ITEM-0080]] — the 800 remaining, all one family, with the composition and the
per-file concentration measured rather than estimated, and the method above
written down.

### Verification

```
npx eslint "{src,test}/**/*.ts" --max-warnings=805   → 0 errors, 800 warnings
npx tsc --noEmit -p tsconfig.build.json              → clean
npx jest                                             → 207 suites, 1648 tests
```

## History

- 2026-08-17 — raised when `Lint services/api` was promoted to a required gate.
  The errors are gone; this records what is left, with a burn-down that needs no
  flag day.

- 2026-08-17 — reconciled to `FIX_NOW`: the ratchet and module-by-module order
  already make this executable; effort alone is not a durable defer reason.

- 2026-08-22 — resolved in SESSION-0040. Both named rules reached zero, the ratchet went 975 → 805, and two of the seventeen unused variables turned out to be defects (BUG-0668, BUG-0669). The remaining family is ITEM-0080.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0668]]
- Referenced by — [[BUG-0669]]
- Modules — [[api-architecture]]

<!-- GRAPH:END -->
