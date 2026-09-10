---
ID: ITEM-0036
aliases: [ITEM-0036]
Title: Decide the fate of the inert runtime registries in apps/web
Type: ARCHITECTURE
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-17
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
RelatedBug: BUG-0044
RelatedQA: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RelatedADR: ADR-0007
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0036 — Decide the fate of the inert runtime registries in apps/web

## Summary

Five modules in `apps/web/lib/runtime/` are scaffolding with zero call sites:
`module-registry.ts`, `metadata-registry.ts`, `command-registry.ts`,
`module-runtime.resolver.ts`, `metadata-layer-resolver.ts`. Modules are declared
as spec objects imported directly by route files instead. Either revive them or
remove them — leaving them is what made
[[BUG-0044-the-documented-new-module-workflow-for-apps-web-cannot-be-fo]]
possible.

## Why It Matters

Dead code that *looks* like the architecture is worse than no code: the
scope-authoritative instruction file told agents to use it, and `getEntityMetadata`
is genuinely called twice (`module-data-table.tsx:424`,
`standard-module-record-page.tsx:128`) against a map that is never populated, so
both call sites silently take a `?? "name"` fallback. That is a live, if benign,
wrong-column risk on every runtime table.

There is also a real architectural question underneath. The **one live registry**
in the app — `settingsAdapterRegistry` in
`app/(authenticated)/settings/_lib/settings-adapter-registry.ts` — self-validates
at module load and throws on a duplicate or malformed key. It holds 82 of the
app's 105 module specs and is demonstrably the pattern that worked. Meanwhile
the "generic" data adapter has accreted **nine hardcoded module branches**
(`standard-module-data.adapter.ts:33,69,87,131,834,838,842,849,863`), keyed by
`moduleKey` string equality — per-module behaviour leaking into the shared file
precisely because there is no registration point.

So the choice is not cosmetic: revive registration and give those branches a
home, or delete the scaffolding and accept string-keyed branching as the design.

## Evidence

Verified at `1af3690` by counting occurrences across every `.ts`/`.tsx` in
`apps/web`, definitions included: `registerModule` 2 (its definition plus a
commented-out example), `registerCommand` 1, `registerEntityMetadata` 1,
`resolveModuleRuntimeContext` 1. Each module's own trailing comment concedes it
is unused.

`.agent/context/runtime-module-system.md:244-251` already documents this
accurately — it is the one context file that got it right.

## Proposed Approach

**Needs an ExecPlan.** Decide first, then act:

- **Revive** — populate `module-registry.ts` from the spec sources at startup,
  move the nine hardcoded adapter branches behind per-module registration, and
  make `getEntityMetadata` return real metadata. Highest value, most work.
- **Remove** — delete the five modules and the barrel exports, and fix the two
  `getEntityMetadata` call sites to read from the spec. Cheapest, and honest.

Do not do neither. Whichever is chosen, record it as an ADR — the runtime is the
repository's stated default way to build a screen, so how modules are declared is
an architectural decision.

## Acceptance Criteria

- No exported registration function has zero call sites.
- `getEntityMetadata` either returns real metadata or is gone.
- The decision is recorded in `docs/decisions/`.
- `apps/web/AGENTS.md` and `.agent/context/runtime-module-system.md` agree with
  the outcome.

## Dependencies

None. [[BUG-0044-the-documented-new-module-workflow-for-apps-web-cannot-be-fo]]
already corrected the documentation, so nothing is blocked on this — it is the
underlying design question that record deliberately did not answer.

## Related Items

[[BUG-0044-the-documented-new-module-workflow-for-apps-web-cannot-be-fo]] ·
[[runtime-module-system]] · [[web-architecture]] · [[tenant-application]] ·
bug pattern [[declared-but-unwired-step]].

## Resolution

Decided **Remove**, recorded in
[`ADR-0007`](../../decisions/ADR-0007-remove-inert-apps-web-runtime-registries.md).
Deleted `module-registry.ts`, `module-runtime.resolver.ts` and
`metadata-layer-resolver.ts` outright (zero callers anywhere, verified by
grepping every exported function individually). Deleted `metadata-registry.ts`
after fixing its two real call sites. Trimmed, rather than deleted,
`command-registry.ts`: its `CommandDefinition`-keyed half
(`registerCommand`/`getCommand`/`listCommands`) had zero callers and is gone,
but its handler-override half (`getCommandHandler`/`getCommandKeyHandler`) is
read on every command execution in `command-execution.service.ts` and stays.

Tracing the two `getEntityMetadata` call sites found the live defect the item
predicted rather than a merely theoretical one: `employee-metadata.adapter.ts`'s
lookup fields set only `entityLogicalName`, so an Employee-to-Employee lookup
(`reportingManagerEmployeeId`) fell through the dead registry to a hardcoded
`"name"` — wrong, since `Employee`'s display field is `fullName`. New
`apps/web/lib/runtime/modules/entity-primary-name-field.ts` extracts the
correct answer (already computed inline by `standard-module-runtime.ts` for
every other field builder) into one shared function; both call sites and the
employee adapter now use it, so the field carries the right
`primaryNameField` at construction instead of a caller guessing at read time.

Verified: `npm --workspace web run check-types` passes;
`npm --workspace web run test` — 72 suites, 1603 tests, all passing (was 71/1598
before this change); new `entity-primary-name-field.spec.ts` (5 tests) asserts
the mapping directly and that `reportingManagerEmployeeId` now resolves to
`fullName`. `npx eslint --fix` run on every changed file, no findings.

## History

- 2026-08-17 — raised by the `apps/web` deep documentation audit (TASK-0003),
  as the design half of BUG-0044. That record fixed the documentation; this one
  owns the code decision it deliberately left alone.

- 2026-09-11 — resolved: removed the four fully-dead registries, trimmed
  `command-registry.ts` to its live half, and fixed the wrong-column risk the
  dead `getEntityMetadata` fallback exposed on Employee-to-Employee lookups.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0044]]
- Modules — [[tenant-application]]
- QA run — [[2026-08-17-web-app-documentation-1af3690]]

<!-- GRAPH:END -->
