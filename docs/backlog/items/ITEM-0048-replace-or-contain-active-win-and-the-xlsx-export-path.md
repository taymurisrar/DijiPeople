---
ID: ITEM-0048
aliases: [ITEM-0048]
Title: Replace or contain active-win and the xlsx export path
Type: SECURITY
Status: READY
Priority: P2
Severity: HIGH
AffectedModules: [apps/agent-desktop, services/api/src/common/excel, package-lock.json]
Source: QA_RUN
OwnerAgent: integration
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug: BUG-0052
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0048 — Replace or contain active-win and the xlsx export path

## Summary

BUG-0052 cleared 8 of 20 production advisories without a breaking change and
documented the remaining 12. Two of those groups cannot be closed by upgrading —
they need a dependency decision. This item carries them so they are not mistaken
for audit noise that someone will eventually re-run `npm audit fix` over.

## Why It Matters

These are the only two production advisories with no safe version to move to, and
one of them is the repository's single **critical**. They will sit at the top of
every future audit until they are decided, and the standing risk of leaving them
undecided is that the next person reads "npm says there is a fix" and applies a
major downgrade that breaks the desktop agent or the export path.

## Evidence

`npm audit --omit=dev` on `develop`, after the BUG-0052 fixes:
`{critical: 1, high: 9, moderate: 2, total: 12}`.

**Group 1 — `active-win` (1 critical + 5 high).** `tar`, `cacache`,
`make-fetch-happen`, `node-gyp` and `@mapbox/node-pre-gyp` all arrive beneath
`active-win@^8.2.1`. npm's proposed fix is `active-win@7.7.2`, a major downgrade.
Reached only from `apps/agent-desktop/src/main/activity-tracker.ts`, in the
Electron main process. The chain beneath it is install-time native-build tooling
and does not ship in the packaged app.

**Group 2 — `xlsx` (1 high).** No fixed version exists at any release. Reached
only from `services/api/src/common/excel/excel-export.service.ts`. That path
**writes** workbooks; the advisory class is parse-side, so the vulnerable code is
not on the path this repository uses.

## Proposed Approach

ExecPlan required — both are dependency replacements with real testing surface,
and each can be done independently.

1. **`active-win`** — establish whether the native-build chain is present in a
   packaged build at all (`npm run gateway:package` / the Electron packaging
   step), since an install-time-only chain changes the severity materially.
   Then choose: pin and document, replace with a maintained alternative, or
   move window-title capture behind a narrower native module.
2. **`xlsx`** — migrate `excel-export.service.ts` onto `exceljs`, which is
   already a dependency and already used elsewhere, then drop `xlsx` entirely.
   This closes the advisory rather than containing it. It also removes the
   argument for the `exceljs` downgrade npm proposes, since `exceljs` becomes the
   single spreadsheet library.
3. Re-run `npm audit --omit=dev` and record the delta on BUG-0052.

## Acceptance Criteria

- A packaged desktop build is inspected to confirm whether the `tar`/`node-gyp`
  chain ships, and the finding is recorded.
- `xlsx` is either removed from `services/api` or has a documented, accepted
  containment with a named revalidation trigger.
- `npm audit --omit=dev` critical count reaches 0, or the residue carries an
  explicit `ACCEPTED_RISK` disposition with evidence.
- Desktop build and API export tests pass on Node 22.

## Dependencies

Requires the `workspace` lease. Independent of the authorization packages.

## Investigation — 2026-08-18

The owner chose "replace `active-win` entirely". Four routes were evaluated
against the actual dependency graph and three are now closed, which narrows this
item considerably rather than leaving it open-ended.

**The chain is production-reachable, and more so than assumed.**
`npm ls tar --omit=dev` puts `tar@6.2.1` under `active-win@8.2.1` via
`@mapbox/node-pre-gyp` and `node-gyp`, both production dependencies.
electron-builder packs production `node_modules`, so it ships. And it is not
merely shipped: `active-win/lib/windows-binding.js` does
`require('@mapbox/node-pre-gyp')` at **runtime** to locate the native binary, so
node-pre-gyp loads on every Windows agent.

What is *not* reachable is the vulnerable code path. node-pre-gyp uses `tar` in
its install/download flow; the runtime call is `.find()`, which only resolves a
path. So the advisory's exploit shape — extracting a hostile archive — is not on
any path this product executes.

**Routes evaluated:**

| Route | Result |
|---|---|
| `active-win@9.0.0` | **Worse.** Moves node-pre-gyp/node-gyp to `optionalDependencies`, which npm installs by default, so the chain remains — and the audit went 12 → 13. `lib/windows.js` still imports node-pre-gyp at runtime. Reverted. |
| `get-windows@9.3.0` (the renamed successor) | Same `optionalDependencies` on `@mapbox/node-pre-gyp@^1.0.11`. No improvement. |
| npm `overrides` → `@mapbox/node-pre-gyp@^2.0.3` | **The most promising, and it does not take.** 2.0.3 depends on the fixed `tar@^7.4.0` and drops `node-gyp`/`cacache`/`make-fetch-happen` entirely. But the override is ignored even after deleting `package-lock.json` and re-resolving: npm still installs 1.0.11. Reverted rather than left as a no-op in the manifest. Worth one more attempt with nested-path override syntax before abandoning. |
| `active-win@7.7.2` (npm's own suggestion) | Genuinely avoids the chain — it predates node-pre-gyp and uses `ffi-napi`/`ref-napi`. But those are widely unmaintained and fragile on current Node/Electron, on the Windows-only native path that is the agent's core feature. Trades a non-executable advisory for a real functional risk. |

**What that leaves.** A maintained replacement for Windows active-window
capture, or a native addon loaded without node-pre-gyp — `node-addon-api` with a
prebuilt binary resolved by path would remove the whole chain. Either is a real
integration with its own testing surface, which is why this item exists.

## Related Items

[[BUG-0052]] · [[desktop-agent]] · [[TASK-0005]]
