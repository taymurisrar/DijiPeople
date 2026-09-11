---
ID: BUG-3316
aliases: [BUG-3316]
Title: Notification settings screens hydrate with UTC timestamps and crash the React tree
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: ab566d22
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-412
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
---

# BUG-3316 — Notification settings screens hydrate with UTC timestamps and crash the React tree

> **Architect triage, 2026-09-11 — `DONE`.** Reported by the owner from
> production with a full client error log, while checking a feature that shipped
> in the same release. The reported screen was the new one; the defect was the old
> one underneath it.

## Summary

`/settings/notifications/providers` and `/settings/notifications/templates` render
an **Updated** timestamp through `formatDateTime`, which reads its timezone and
locale from a module-level default in `apps/web/lib/formatting-context.ts`.

That default is installed by `setDefaultFormattingContext` inside a `useEffect` in
`ResolvedSettingsProvider`. Effects do not run during server rendering, so the
server formats in the fallback — UTC, `en-US` — while the client, on any
navigation after that effect has already run, formats in the tenant's timezone.

Two different strings for one text node is a hydration mismatch. React tears the
tree down and the global error dialog appears with `SYSTEM_UNEXPECTED_ERROR`.

## Expected Behavior

A timestamp renders identically on the server and on the client, in the tenant's
timezone, and hydration completes silently.

## Actual Behavior

```
Minified React error #418
CLIENT /settings/notifications/providers
Source application: web   Environment: production
```

React #418 is the text-content hydration mismatch. The screen renders, then the
error boundary replaces it.

## Reproduction

1. Sign in to a tenant whose timezone is not UTC.
2. Navigate **within the app** to Settings → Notifications → Email Providers, so
   the formatting effect has already run from a previous page.
3. The Updated column's server-rendered value is UTC; the client re-renders it in
   the tenant timezone.

A hard reload does not reproduce it, because effects run after hydration and both
renders then use the fallback. That is why it is intermittent and why it survived
this long.

## Evidence

- Client error log supplied by the owner, reference
  `client_1789128436221_hif8q6ab6j8`, `2026-09-11T12:07:17.474Z`, on production
  commit `ab566d22`.
- `apps/web/lib/formatting-context.ts` — `runtimeDefaultContext` is module-level
  mutable state, empty until set.
- `apps/web/app/(authenticated)/_components/resolved-settings-provider.tsx:173` —
  `setDefaultFormattingContext(value)` inside `useEffect`.
- `email-providers-manager.tsx` and `email-templates-table.tsx` both called
  `formatDateTime(value)` with no context.

## Root Cause

Formatting state held in a module variable rather than in React's tree. Anything
outside the tree is invisible to server rendering and therefore cannot be
consistent across hydration by construction.

`formatDateTime`'s context parameter was optional, so omitting it was silent and
looked correct.

## Impact

Cosmetic in outcome, disproportionate in effect: the error dialog covers the
screen and reads as a system failure, so an administrator reasonably stops. Any
authenticated screen rendering a date through the module default is exposed to the
same thing; these two are the confirmed instances.

**Not** caused by the release it was reported against. The Updated columns predate
it — `git show origin/main` has `formatDateTime` in this file twice. The new
effective-provider panel renders no date, no random value and no locale-dependent
string, and was checked before this record was written rather than assumed
innocent.

## Affected Areas

- `apps/web/app/(authenticated)/settings/notifications/_components/email-providers-manager.tsx`
- `apps/web/app/(authenticated)/settings/notifications/_components/email-templates-table.tsx`
- `apps/web/app/(authenticated)/settings/notifications/_components/notification-ui.tsx`

## Proposed Resolution

Pass the tenant context explicitly via `useFormattingContext()`, which reads a
React context and is therefore available to server rendering and hydration alike.

## Acceptance Criteria

- Both screens render the Updated column in the tenant's timezone.
- No hydration mismatch on client-side navigation to either screen.
- The reason the context parameter is effectively mandatory is written where the
  next caller will read it.

## Regression Coverage

REG-412 —
`apps/web/app/(authenticated)/settings/notifications/_components/notification-formatting.spec.ts`.

Eight cases in two halves. The behavioural half proves an explicit context wins
over the module default and stays stable when that default changes, which is the
difference between a server render and a client one. The wiring half reads both
screens and asserts no bare `formatDateTime(x)` call survives and that
`formatting` is in the columns memo dependencies.

The wiring half is a source assertion on purpose: the defect is a call site
omitting an argument, and no amount of rendering *with* the context passed can
observe a caller that does not pass it.

Mutation-tested rather than assumed. Removing the context argument and the memo
dependency fails two of the eight; a source-reading spec that cannot fail is the
trap this repository has hit before.

## Dependencies

Shares its cause with [[ITEM-0139]], which tracks tenant-aware formatting being
reimplemented locally across the app. This record fixes two screens; that item is
the general case.

## Related Items

- [[ITEM-0139]] — the general case
- [[BUG-2626]] — dashboard numbers in the visitor's locale, same root
- [[BUG-2464]] — earlier hydration crashes on other tenant screens

## Resolution

`formatDateTime` in `notification-ui.tsx` now takes an optional
`ResolvedFormattingContext`, and its doc comment explains that the parameter is
optional only in signature: omitting it selects the module default and reintroduces
this bug.

Both screens call `useFormattingContext()` and pass the result.

`email-templates-table.tsx` also needed `formatting` added to the `columns`
`useMemo` dependency array. Without it the memo keeps a renderer closed over the
first render's context, so the fix would have applied on the first paint and never
again — a correct change that does nothing, which is worse than no change because
it reads as done.

## QA Retest

Navigate within the app to both screens as a tenant in a non-UTC timezone and
confirm the Updated column shows tenant-local time with no error dialog. A hard
reload is not a valid retest — it cannot reproduce the original.

## History

- 2026-09-11 — reported by the owner from production with a full client error log,
  while verifying the email provider panel shipped in `ab566d22`.
- 2026-09-11 — traced to the module-level formatting default, confirmed
  pre-existing, fixed on both screens.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-412 (see the regression register)

<!-- GRAPH:END -->
