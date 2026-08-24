---
ID: BUG-0163
aliases: [BUG-0163]
Title: package-lock.json cannot be regenerated - npm overrides are silently ignored
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INFRA
Source: ARCHITECT
DetectedDate: 2026-08-21
DetectedInSha: 34b699b
AffectedModules: [package-lock.json, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
RegressionId: REG-226
RelatedBacklogItem: ITEM-0048
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-24
ResolvedAt: 2026-08-22
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

Verified by [`2026-08-24-record-state-reconciliation-0a5586f.md`](../qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md) on 2026-08-24 at `0a5586f`.

REG-226 — the CI gate step "Lockfile regenerates from the manifests" is present at `.github/workflows/ci.yml:141`.

## Resolution — 2026-08-22, SESSION-0040

The user's instruction was "do what's best". The root cause turned out to be
narrower than this record's Proposed Resolution assumed, and the fix is two
lines.

### The actual conflict

`@tiptap/react@3.29.2` declares two **optional peers**, both with caret ranges:

```
optional @tiptap/extension-floating-menu@"^3.29.2"  from @tiptap/react@3.29.2
optional @tiptap/extension-bubble-menu@"^3.29.2"    from @tiptap/react@3.29.2
```

A caret resolves to the newest 3.x — `3.30.2` — and **3.30.2 of either declares a
hard peer on `@tiptap/pm@"3.30.2"`**, while every direct `@tiptap` dependency in
`apps/admin` is pinned at `3.29.2`. Two optional peers drifting forward past a
pinned family is the whole defect.

This record proposed either pinning `extension-floating-menu` or moving the
family to 3.30.x. Pinning was right; the record just did not know there were
**two** such peers. Pinning only the first surfaces the second, identically —
which is how it was found.

### The fix

Two entries in `apps/admin/package.json`:

```json
"@tiptap/extension-bubble-menu": "3.29.2",
"@tiptap/extension-floating-menu": "3.29.2",
```

Not `--legacy-peer-deps` and not `--force`, as this record insisted: both make
the command succeed while leaving the graph unresolvable, which is the state
that produced the record.

### Blast radius, measured

The regenerated lockfile, compared package-by-package against the committed one:

| | |
|---|---|
| packages before → after | 1812 → 1736 |
| **removed** | **76** |
| **added** | **0** |
| **version-changed** | **0** |

Every one of the 76 is an orphan of the `node-gyp@9` chain — `@gar/promisify`,
`@npmcli/fs@2`, `@tootallnate/once`, the `gauge` family, `chownr@2`. [[BUG-0052]]
upgraded away from them and could not prune them, because pruning requires the
regeneration *this* record was blocking. Nothing in use moved.

### Verified against an installed tree, not a diff

`npm ci` in an isolated copy of the manifests: **1622 packages installed, exit
0**, with `core`, `pm`, `react`, `starter-kit`, `extension-floating-menu` and
`extension-bubble-menu` all at 3.29.2. Audit of that tree: 0 critical, 8 high, 2
moderate — unchanged, and it cannot have risen, because 0 packages were added
and 0 versions changed.

### Against the acceptance criteria — one half, honestly

> `npm install --package-lock-only` succeeds from no lockfile **and** an
> overrides entry in the root manifest appears in `package-lock.json` and
> changes the resolved version

- **Resolves from nothing** — yes. Proven from the manifests alone with no
  lockfile and no `node_modules`.
- **Changes the resolved version** — yes. An `overrides` entry of
  `{"semver": "7.6.0"}` moved `semver` from 6.3.1 to 7.6.0. Before the fix,
  overrides were discarded entirely.
- **Appears in `packages[""].overrides`** — **no.** npm 11 applies the override
  and does not write the key into the lockfile root. That is npm's behaviour
  rather than anything this repository controls, so the criterion as written
  cannot be met; the half that matters — the override taking effect — is met.

Status is `FIXED` rather than `VERIFIED` for that reason: the last clause of the
acceptance criteria is not satisfiable as stated and should be rewritten before
this closes.

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
- Regression — REG-226 (see the regression register)

<!-- GRAPH:END -->

- 2026-08-22 — user said "do what's best". Root cause is two optional peers of @tiptap/react with caret ranges drifting past the pinned family; both pinned at 3.29.2. Lockfile regenerates, 76 orphans pruned, 0 added, 0 changed.
