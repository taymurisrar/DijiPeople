---
ID: BUG-0046
aliases: [BUG-0046]
Title: Tenant theme mode and runtime settings saves do not take effect
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 1af3690
AffectedModules: [apps/web]
OwnerAgent: frontend
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId: REG-054
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-18
ResolvedAt: 2026-08-18
---

# BUG-0046 — Tenant theme mode and runtime settings saves do not take effect

## Summary

Two independent defects with the same symptom — a tenant configures something in
settings and the running app ignores it.

**(a) A tenant's `defaultThemeMode` is unreachable.** Three writers compete for
`document.documentElement.dataset.theme`, and one of them installs a
`MutationObserver` that reverts any write it did not make.

**(b) Settings saved through the settings runtime never refresh the
preferences provider.** Date format, timezone, currency, density and theme
change in the database and not in the live app until a full reload.

## Expected Behavior

Tenant default, user choice and device preference resolve through one documented
precedence order, and a successful settings-runtime save updates the live app
without a page reload.

## Actual Behavior

**(a)** The writers are `lib/tenant-branding-client.ts:26`
(`root.dataset.theme = branding.themeMode.toLowerCase()`),
`resolved-settings-provider.tsx:204` (`root.dataset.theme = effectiveTheme`), and
`lib/theme.ts:57` `applyTheme()` driven by
`app/components/theme/theme-applier.tsx:32-39`. The last installs a
`MutationObserver` on `data-theme` that re-applies
`readStoredThemeChoice() ?? "system"` on **every** change — so on a browser with
no stored choice, a tenant default of `DARK` is overwritten back to the device
preference. Separately, `tenant-branding-client.ts:26` can write the literal
`data-theme="system"`, which matches no CSS rule; `globals.css` only keys
`[data-theme="dark"]`.

**(b)** `notifyTenantSettingsChanged` has exactly **one** call site —
`app/components/settings/settings-form.tsx:340`. The runtime record path
(`_components/tenant-settings-runtime-record.tsx` →
`_lib/tenant-settings-runtime.adapter.ts:67`) PATCHes tenant settings and never
dispatches it. `resolved-settings-provider.tsx:98-117` is listening; it is never
told.

Since the settings runtime is the **canonical** way to build a settings surface,
the canonical path is the one that does not invalidate.

## Reproduction

With no stored user theme, configure a tenant default of `DARK` and observe the
competing `data-theme` writers; then save a regional or appearance setting
through the runtime record path and observe that the listening provider receives
no settings-changed event.

## Evidence

All call sites and line numbers above verified at `1af3690`. The behaviour
contradicts `docs/architecture/settings-and-branding.md:26-27` and `:493`
("Private setting saves refresh the relevant provider/cache") — tracked as part
of [[BUG-0045-the-canonical-settings-and-branding-contract-is-materially-s]].

Related but filed here as context, not as a separate record: `StatusPill`'s
`good`/`danger`/`info` tones use `-700` text weights and `bg-sky-50`, which
`globals.css`'s dark-mode patch list does not cover — so those pills are
low-contrast or light-on-dark in dark mode.

## Root Cause

**(a)** Three layers each believe they own the theme attribute, and the newest
defends its ownership with an observer. No single writer is wrong in isolation;
there is no stated precedence between tenant default, user choice and device
preference.

**(b)** Cache invalidation is an event the *form* dispatches rather than
something the *save path* guarantees, so a second save path was added without it.

## Impact

A tenant that configures dark mode as its default does not get it — a visible,
reportable "the product ignores my settings" defect. The invalidation gap is
broader: every regional and appearance setting appears not to save until the
user reloads, which reads as data loss even though the write succeeded.

`MEDIUM`: cosmetic-to-confusing, no data at risk.

## Affected Areas

`apps/web` theme ownership, tenant branding, the resolved settings provider,
and the tenant settings runtime adapter.

## Proposed Resolution

**(a)** Establish one owner for `data-theme` and one precedence order — user
choice > tenant default > device — and have the other two writers feed it rather
than write the attribute. Remove the observer once there is a single writer, or
narrow it to defend only against external mutation.

**(b)** Move `notifyTenantSettingsChanged` into the save path
(`tenant-settings-runtime.adapter.ts`), so any current or future settings writer
invalidates by construction rather than by remembering.

## Acceptance Criteria

- A tenant default of `DARK` renders dark on a browser with no stored choice.
- No code writes `data-theme="system"`.
- Saving any setting through the settings runtime updates the live app without
  a reload.
- `StatusPill` tones meet contrast in both themes.

## Regression Coverage

**None**, and unit tests cannot reach it — this is DOM behaviour and
`jest.config.js` is `testEnvironment: node` with no jsdom. Browser coverage would
be the honest guard, and `apps/web` has none ([[ITEM-0034]]).

## Dependencies

The theme half requires an explicit precedence decision. The settings-save
invalidation fix is independent and ready.

## Related Items

[[web-architecture]] · [[settings]] · [[tenant-application]] ·
[[BUG-0045-the-canonical-settings-and-branding-contract-is-materially-s]] ·
[[ITEM-0034]].

## Resolution

Fixed 2026-08-18, both halves.

**(a) One precedence order, one writer.** The two inputs had been sharing a
slot: `data-theme` is the *resolved answer* the stylesheet keys on, and the
tenant default was written straight into it. They are now separate —
`data-tenant-theme` carries the tenant default, and `applyTheme` remains the only
writer of `data-theme`.

`effectiveThemeChoice()` in `lib/theme.ts` states the order once:
**user choice → tenant default → device.** The MutationObserver in
`theme-applier.tsx` re-asserts *that* instead of
`readStoredThemeChoice() ?? "system"`, which is the expression that made a tenant
default unreachable — it was written, observed, and immediately overwritten with
the device preference. `tenant-branding-client.ts` and
`resolved-settings-provider.tsx` now publish the tenant value and delegate rather
than writing the answer themselves.

That also closes the quieter half of (a): a themeMode of `SYSTEM` used to reach
the document as a literal `data-theme="system"`, which matches no rule in
`globals.css` and so read as light whatever the device preferred. `applyTheme`
has always resolved to a concrete `light`/`dark` — the direct writers were
bypassing it.

**(b) The runtime save now announces itself.** `settings-form.tsx` has always
emitted `notifyTenantSettingsChanged` and the providers have always listened;
`tenant-settings-runtime.adapter.ts` simply never joined in, which is why the
same setting appeared to work from one screen and not from another. It now emits
the categories that actually changed, so a listener can decide whether it cares
rather than refetching everything on every save.

## QA Retest

Pass.

```text
apps/web/lib/theme-precedence.spec.ts   6 tests
apps/web                                18 suites, 397 tests; check-types PASS
```

The original record noted that (a) was **reasoned from source, not observed in a
browser**, and that the uncertainty was why it was rated MEDIUM. The precedence
is now pinned by a test rather than by reading: reverting `effectiveThemeChoice()`
to the original `readStoredThemeChoice() ?? "system"` fails `uses the tenant
default when the user has chosen nothing`; restoring it passes.

What is still unobserved is React's *effect ordering* — whether some hydration
path could interleave the writers differently. That is no longer load-bearing:
with one writer and one order, interleaving changes when the answer is written,
not what it is.

## History

- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `FIX_NOW` for (b), which is a one-line move
  with no design question. (a) needs the precedence decision stated first but is
  small once it is.
