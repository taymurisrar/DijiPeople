---
ID: BUG-0163
aliases: [BUG-0163]
Title: package-lock.json cannot be regenerated - npm overrides are silently ignored
Status: OPEN
Severity: HIGH
Priority: P1
Type: INFRA
Source: ARCHITECT
DetectedDate: 2026-08-21
DetectedInSha: 34b699b
AffectedModules: [package-lock.json, apps/admin]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport:
RegressionId:
RelatedBacklogItem: ITEM-0048
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-21
ResolvedAt:
LastReviewed: 2026-08-21
NextAction: Align the @tiptap family in apps/admin so the peer set resolves, then confirm an overrides entry reaches the lockfile
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

Not yet fixed.

## QA Retest

Not yet run.

## History

- 2026-08-21 — found while attempting the `@mapbox/node-pre-gyp` override for
  ITEM-0048. The override was correct and provably works elsewhere; this
  repository could not apply it.
