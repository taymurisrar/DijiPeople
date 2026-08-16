---
ID: BUG-0044
aliases: [BUG-0044]
Title: The documented new module workflow for apps/web cannot be followed
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: DOCUMENTATION
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 1af3690
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: docs/knowledge/implementations/2026-08-17-web-app-documentation.md
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
---

# BUG-0044 — The documented new module workflow for apps/web cannot be followed

## Summary

`apps/web/AGENTS.md` instructs an agent adding a module to "Register in
`module-registry.ts` and, if it needs commands, in `command-registry.ts`". **Both
registries are dead code with zero call sites.** An agent following the
documented workflow performs a step that has no effect, and may conclude the
runtime is broken when its own registration silently does nothing.

## Expected Behavior

The scope-authoritative instruction file describes the mechanism the code
actually uses.

## Actual Behavior

Verified by counting occurrences across every `.ts`/`.tsx` in `apps/web`
(definition included in the count):

| Function | Occurrences |
|---|---|
| `registerModule` | 2 — its definition and a commented-out example |
| `registerCommand` | 1 — its definition only |
| `registerEntityMetadata` | 1 — its definition only |
| `resolveModuleRuntimeContext` | 1 — its definition only |

So `module-registry.ts`, `metadata-registry.ts`, `command-registry.ts`,
`module-runtime.resolver.ts` and `metadata-layer-resolver.ts` are inert
scaffolding. Their own trailing comments admit it.

`getEntityMetadata` **is** called twice — `module-data-table.tsx:424` and
`standard-module-record-page.tsx:128` — but since the map is never populated it
always returns `null` and both fall through to a `?? "name"` default.

**How modules are actually declared:** a module is a `StandardModuleRuntimeSpec`
object imported directly by the route file and converted per render by
`buildStandardRouteRuntime`. There is no registration step. The one *live*
registry in the app is `settingsAdapterRegistry` in
`app/(authenticated)/settings/_lib/settings-adapter-registry.ts`, which
self-validates at module load — the pattern `module-registry.ts` was evidently
meant to become.

## Evidence

Counts above measured directly at `1af3690`.
`.agent/context/runtime-module-system.md` **already documents this correctly**;
`apps/web/AGENTS.md` contradicts it and is the stale one. A specialist reading
the scope-authoritative file first — which the framework tells them to do — gets
the wrong answer.

## Root Cause

`doc-code-drift`. The registries were built, the spec-object approach won, and
the instruction file was never updated. Nothing fails when a registry goes
unused, so there was no signal.

## Impact

Bounded but pointed: it misleads exactly the reader who is doing the right thing
— consulting the scope file before building. It also hides the real coupling,
which is that `moduleKey` string equality drives command handler selection and
API path derivation.

## Proposed Resolution

Correct `apps/web/AGENTS.md` to describe the spec-object workflow, name the
inert files as inert, and point at `settings-adapter-registry.ts` as the live
registry. Do **not** delete the scaffolding as part of a documentation task —
whether to revive or remove it is a design decision, recorded as [[ITEM-0036]].

## Acceptance Criteria

- `apps/web/AGENTS.md` describes the steps that actually work.
- The inert modules are identified as such.
- No instruction file tells an agent to call a function with no call sites.

## Regression Coverage

None mechanical. The generalisable guard — a check that a documented function
name has call sites — is close to [[ITEM-0011]]'s absence-claim guard and is
noted there rather than duplicated.

## Related Items

[[web-architecture]] · [[runtime-module-system]] · [[tenant-application]] ·
[[ITEM-0036]] · [[ITEM-0011]] · bug pattern [[doc-code-drift]] ·
bug pattern [[declared-but-unwired-step]].

## Resolution

Fixed on `agent/knowledge-web-app-documentation` (TASK-0003).
`apps/web/AGENTS.md` now documents the spec-object workflow, marks the five
inert modules, and names `settingsAdapterRegistry` as the only live registry.
The scaffolding itself is untouched — that decision is [[ITEM-0036]].

## QA Retest

Verified by re-reading the corrected section against the measured call-site
counts. No runtime behaviour is involved.

## History

- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `FIX_NOW`; in scope for a `KNOWLEDGE` task,
  which permits correcting verified documentation drift. Fixed the same day.
</content>
