---
ID: BUG-0163
aliases: [BUG-0163]
Title: package-lock.json cannot be regenerated - npm overrides are silently ignored
Status: PRODUCT_DECISION
Severity: HIGH
Priority: P1
Type: INFRA
Source: ARCHITECT
DetectedDate: 2026-08-21
DetectedInSha: 34b699b
AffectedModules: [package-lock.json, apps/admin]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport:
RegressionId: REG-173
RelatedBacklogItem: ITEM-0048
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-21
ResolvedAt:
LastReviewed: 2026-08-21
NextAction: Owner decision - the fix requires accepting a 338-package dependency refresh, which broke five CI jobs on first attempt
AcceptanceCriteria: npm install --package-lock-only succeeds from no lockfile, and an overrides entry in the root manifest appears in package-lock.json and changes the resolved version
---

# BUG-0163 — package-lock.json cannot be regenerated - npm overrides are silently ignored

## Summary

`package-lock.json` cannot be rebuilt from the manifests. Deleting it and running
`npm install --package-lock-only` fails with `ERESOLVE` on a `@tiptap` peer
conflict in `apps/admin`. The committed lockfile predates that conflict and
papers over it, so `npm ci` works and nothing has noticed.

The consequence that costs something: **`overrides` in the root manifest are
silently ignored.** npm reads the key — `npm pkg get overrides` returns it — and
then resolves as though it were absent. No warning, no error, and no `overrides`
key in the lockfile.

## Expected Behavior

Adding an `overrides` entry to the root manifest changes the resolved version of
that package, and `package-lock.json` records it under `packages[""].overrides`.

A lockfile that cannot be regenerated is a lockfile nobody can change on purpose.

## Actual Behavior

The resolved version does not move, and the lock's root entry carries only
`name, workspaces, dependencies, devDependencies, engines`.

Every route to a fresh resolution was tried:

| Attempt | Result |
|---|---|
| Nested override `{"active-win": {"@mapbox/node-pre-gyp": "^2.0.3"}}` | ignored — npm hoists the package, so the key never matches |
| Top-level override `{"@mapbox/node-pre-gyp": "^2.0.3"}` | ignored |
| `npm install --package-lock-only` | "up to date", lock unchanged |
| Full `npm install` | "up to date", lock unchanged |
| `rm node_modules/.package-lock.json`, re-resolve | ignored |
| `rm package-lock.json`, re-resolve with tree present | lock rebuilt from the installed tree; override still ignored |
| `rm -rf node_modules package-lock.json`, re-resolve | **ERESOLVE — resolution fails entirely** |

The last row is the defect. The rows above it are npm reusing a tree it considers
satisfying; that one is npm being unable to produce a tree at all.

## Reproduction

```bash
npm pkg set 'overrides.@mapbox/node-pre-gyp=^2.0.3'
npm install --package-lock-only
node -p "require('./package-lock.json').packages[''].overrides"   # undefined

rm -rf node_modules package-lock.json
npm install --package-lock-only                                   # ERESOLVE
```

## Evidence

From npm's own eresolve report at `34b699b`:

```
Could not resolve dependency:
peer @tiptap/extension-list@"3.29.2" from @tiptap/extension-task-item@3.29.2

Conflicting peer dependency: @tiptap/pm@3.29.2
  peer @tiptap/pm@"3.29.2"   from @tiptap/extension-list@3.29.2
  peer @tiptap/core@"3.30.2" from @tiptap/extension-floating-menu@3.30.2
    optional @tiptap/extension-floating-menu@"^3.29.2" from @tiptap/react@3.29.2
```

`apps/admin` pins the `@tiptap/*` family at `3.29.2`, but
`@tiptap/extension-floating-menu` resolves to `3.30.2` and demands
`@tiptap/core@3.30.2`. Both cannot hold.

The override mechanism itself was verified working: a scratch project with
`active-win@^8.2.1` and the identical top-level override resolves
`@mapbox/node-pre-gyp` to `2.0.3` and `tar` to `7.5.22` on the first attempt. The
mechanism is fine; this repository's graph is what refuses.

## Root Cause

Two causes, and the second hides the first:

1. `apps/admin` has an unsatisfiable `@tiptap` peer set. The floating-menu
   extension is an *optional* peer of `@tiptap/react`, so it floats to its own
   latest rather than following the pinned family version.
2. The committed lockfile predates the conflict, and `npm ci` installs from it
   without re-resolving. Every developer and every CI run therefore succeeds, and
   the graph has not actually been resolvable for some time.

## Impact

- **`overrides` do not work**, removing the standard tool for forcing a
  transitive dependency off a vulnerable version. This is what blocked the
  `@mapbox/node-pre-gyp` upgrade in ITEM-0048.
- Any dependency addition or upgrade needing re-resolution hits the same wall, at
  the moment somebody is trying to do something else.
- A fresh clone that runs `npm install` rather than `npm ci` fails outright.

Not a runtime exposure. It is a build-integrity defect: the lockfile is no longer
derivable from the manifests it claims to lock.

## Affected Areas

The root lockfile, and `apps/admin`'s editor dependencies.

## Proposed Resolution

Align the `@tiptap` family in `apps/admin` so the peer set is satisfiable —
either pin `@tiptap/extension-floating-menu` at the family version, or move the
whole family to `3.30.x` together. Then regenerate the lockfile and confirm a
fresh resolution succeeds.

**Not** `--legacy-peer-deps` or `--force`. Both make the command succeed while
leaving the graph unresolvable, which is exactly the state that produced this
record.

## Acceptance Criteria

- `rm -rf node_modules package-lock.json && npm install --package-lock-only`
  completes without `ERESOLVE`.
- An `overrides` entry in the root manifest appears under
  `packages[""].overrides` in the regenerated lockfile and changes the resolved
  version.
- `npm ci` still installs, and the affected workspaces still build.

## Regression Coverage

A CI check that regenerates the lockfile **in a scratch copy** and fails on
`ERESOLVE` would catch this class permanently. It must not run against the
working tree: regenerating the real lockfile in CI is how a lockfile silently
changes.

## Dependencies

None. It blocks ITEM-0048 rather than being blocked by anything.

## Related Items

- [[ITEM-0048]] — the `@mapbox/node-pre-gyp` upgrade this blocked. The upgrade is
  verified compatible; only the mechanism to apply it is broken.
- [[BUG-0052]] — the advisory record whose remaining critical that upgrade closes.

## Resolution

**Root cause identified and a fix proven. Not applied — it costs more than it
first appeared to, and that cost is an owner decision.**

The `@tiptap` half is genuinely solved. `apps/admin` pinned all thirteen
packages at exactly `3.29.2` while tiptap declares its own transitive
extensions with carets, and `starter-kit` nests caret-ranged copies of a dozen
more. Widening the thirteen specs to `^3.29.2` makes a fresh resolve succeed —
verified: `rm -rf node_modules package-lock.json && npm install
--package-lock-only` completes with no `ERESOLVE`, and both overrides then
apply, taking `tar` to 7.5.22 and clearing the critical.

Pinning the floaters instead was tried and rejected: `starter-kit`’s nested
copies would mean enumerating the whole `@tiptap` namespace, and npm overrides
cannot wildcard a scope.

### Why it was reverted

npm will not apply an override incrementally. It reports "up to date" against
the existing tree and changes nothing, so the only way to apply one is a full
re-resolution — and this lockfile is months stale relative to the registry, so
a full re-resolution refreshes the entire caret-ranged graph:

```text
338 packages changed version · 133 added · 182 removed
jest 30.3.0 -> 30.4.x · eslint · babel · @angular-devkit · react hoisting
```

CI on `ce7a841` failed five jobs from three distinct causes:

| job | cause |
|---|---|
| API tests | `SyntaxError: Cannot use import statement outside a module` — the jest bump broke the TypeScript transform |
| Lint | the eslint bump |
| Database migration gate, Database e2e, Browser e2e | all failed at `Prepare the database` |

`npm install --package-lock-only --before=2026-08-20` was tried to pin the
refresh to the lockfile’s era. It does not work: the committed versions were
resolved at many different dates, so 505 packages still moved.

The commit was reverted before integration. `develop` never carried it.

### What this actually costs

Clearing the repository’s only critical advisory requires accepting a broad
dependency refresh with its own regression surface, in the same window as the
first production release. That is a scope and risk judgement, not an
engineering one, so it is recorded here rather than absorbed.

## QA Retest

Not passed. The fix was proven to work and then reverted.

```text
fresh resolve after the @tiptap fix   no ERESOLVE
overrides applied                     node-pre-gyp 2.0.3, node-gyp 11.5.0
npm audit --omit=dev                  critical 1 -> 0, total 12 -> 6
admin check-types                     PASS
admin tests                           12 suites, 108 tests PASS
CI on ce7a841                         5 of 13 jobs FAILED
```

The first five lines are why the fix is known to be correct. The last line is
why it is not on `develop`.

## History

- 2026-08-21 — fixed the same day: `@tiptap` specs widened to carets, lockfile
  regenerated, both overrides applied, critical cleared.
- 2026-08-21 — found while attempting the `@mapbox/node-pre-gyp` override for
  ITEM-0048. The override was correct and provably works elsewhere; this
  repository could not apply it.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0048]]
- Modules — [[platform-admin]]
- Regression — REG-173 (see the regression register)

<!-- GRAPH:END -->
