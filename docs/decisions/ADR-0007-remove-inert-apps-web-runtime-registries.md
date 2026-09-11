---
ID: ADR-0007
aliases: [ADR-0007]
Title: Remove the inert apps/web runtime registries rather than revive them
Status: ACCEPTED
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
---
# ADR-0007 — Remove the inert `apps/web` runtime registries rather than revive them

## Status

Accepted — 2026-09-11, resolving `ITEM-0036`.

## Context

Five modules in `apps/web/lib/runtime/` existed as registration scaffolding
with no live writer: `module-registry.ts`, `metadata-registry.ts`,
`command-registry.ts` (partially — see below), `module-runtime.resolver.ts`
and `metadata-layer-resolver.ts`. `apps/web/AGENTS.md` and
`.agent/context/runtime-module-system.md` described a runtime that registers
modules, entities, forms and commands at startup and resolves them through
these files; the actual codebase declares each module as a spec object
(`apps/web/lib/runtime/modules/standard-module-specs.ts`,
`employee-metadata.adapter.ts`, …) imported directly by the route files that
need it. `BUG-0044` already corrected the documentation to match the code;
this item owned the remaining question the bug record deliberately left open —
revive the registries, or delete them.

This was not cosmetic. `getEntityMetadata()` (`metadata-registry.ts`) had two
real call sites — `module-data-table.tsx:424` and
`standard-module-record-page.tsx:128` — reading a map `registerEntityMetadata`
never populated, so both always fell through to a hardcoded `"name"`. Tracing
where that fallback is actually reachable found a live instance of the defect
it predicted: `employee-metadata.adapter.ts`'s lookup fields set only
`lookupTargets: [{ entityLogicalName }]`, with no `primaryNameField`, so any
Employee lookup field pointing at another Employee (a manager, a delegate) hit
the dead registry and rendered whatever `record.name` was — `undefined` for an
`Employee`, whose display name field is `fullName`. Every other field builder
(`standard-module-runtime.ts`'s `lookupTargetsForField`) already resolves
`primaryNameField` correctly inline and never reached the dead registry at
all, which is why the item's own audit called this "benign" rather than
observed-broken: the exposure existed, on exactly the one path that used the
adapter that didn't set it.

## Decision

**Remove**, not revive — with the fix that removal exposed, folded in rather
than deferred.

- `module-registry.ts`, `module-runtime.resolver.ts` and
  `metadata-layer-resolver.ts` are deleted outright. Every exported function
  in all three (`registerModule`, `getModuleConfig`, `listModuleConfigs`,
  `resolveModuleRuntimeContext`, `resolveMetadataLayers`, and their `clear*`
  test helpers) had zero callers anywhere in `apps/web`, tests included.
- `metadata-registry.ts` is deleted. Its two real call sites now read
  `apps/web/lib/runtime/modules/entity-primary-name-field.ts`, a new,
  small, pure function extracted from the one place this answer was already
  computed correctly (`standard-module-runtime.ts`). `employee-metadata.adapter.ts`
  now calls the same function when building a lookup field's `primaryNameField`,
  so the fallback path these two call sites used to need is no longer reachable
  by an incomplete case — it stays only as an `?? "name"` safety net for a
  target this function does not recognize by name.
- `command-registry.ts` is **trimmed, not deleted**. It held two independent
  registries: a `CommandDefinition`-keyed one (`registerCommand`, `getCommand`,
  `listCommands`) with zero callers, removed; and a handler-*override*
  registry (`registerCommandHandler`, `registerCommandKeyHandler`,
  `getCommandHandler`, `getCommandKeyHandler`) that `command-execution.service.ts`
  reads on every command execution, ahead of the command spec's own
  `executionMode`. Nothing calls the register half of that pair today, so the
  read always falls through to `executionMode` — but the read site is live and
  exercised, which makes this an extension point with no current registrant,
  not orphaned scaffolding. Deleting it would have removed a working
  fallthrough, not dead code.

No new registration mechanism was built. Reviving the full pattern — moving
`standard-module-data.adapter.ts`'s nine hardcoded `moduleKey` branches behind
per-module registration — is real, separable work the item correctly priced as
"highest value, most work"; nothing here forecloses doing it later, and if it
happens, `entity-primary-name-field.ts`'s answer is what a revived
`EntityMetadata` registry should be seeded with.

## Consequences

- `apps/web/lib/runtime/index.ts` no longer exports `command-registry`'s
  deleted half or the three fully-removed modules.
- `apps/web/lib/runtime/modules/entity-primary-name-field.ts` is the one
  place `defaultPrimaryNameFieldForEntity` is defined; `standard-module-runtime.ts`
  and `employee-metadata.adapter.ts` both import it rather than each guessing.
- No exported registration function in `apps/web/lib/runtime/` has zero call
  sites (`ITEM-0036`'s acceptance criterion). `getEntityMetadata` is gone
  rather than fixed to return real metadata — the fix was cheaper and the
  actual defect (the wrong-column fallback) is closed by the extraction, not
  by a revived registry.
- `apps/web/AGENTS.md` and `.agent/context/runtime-module-system.md` already
  describe the spec-object pattern accurately (`BUG-0044`); nothing there needs
  to change to agree with this decision.

## Related

- [`ITEM-0036`](../backlog/items/ITEM-0036-decide-the-fate-of-the-inert-runtime-registries-in-apps-web.md)
  — the record this decision resolves.
- [`BUG-0044`](../bugs/BUG-0044-the-documented-new-module-workflow-for-apps-web-cannot-be-fo.md)
  — corrected the documentation; this corrects the code it described.
- `apps/web/lib/runtime/modules/entity-primary-name-field.ts`,
  `apps/web/lib/runtime/command-registry.ts`.
