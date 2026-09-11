---
ID: BUG-3336
aliases: [BUG-3336]
Title: Subscription settings has no loading or error boundary and renders a failed load as access denied
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: UX
Source: REVIEWER
DetectedDate: 2026-09-11
DetectedInSha: caad4a56
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3336 — Subscription settings has no loading or error boundary and renders a failed load as access denied

## Summary

Three related gaps in how the subscription routes handle anything other than the
happy path.

**No boundaries.** Neither `settings/subscription/` nor `settings/billing/`
contains a `loading.tsx` or an `error.tsx`. `AGENTS.md` requires loading, error
and empty states for every data surface and names those conventions specifically.
The page awaits three API calls server-side before it renders anything, so
navigating to it shows the previous screen until the slowest of them returns.

**A failed load is dressed as a permissions problem.** When
`loadSubscriptionSettingsData` returns `ok: false` — a 500, a timeout, a
malformed payload — the page renders `AccessDeniedState`, the same component used
when the user genuinely lacks the role. The heading is supplied as "Unable to
load subscription", but the component is the access-denied one, its only action
is "Back to settings", and there is no retry.

**Two authorities disagree on who may see the screen.** The page gates on
`hasElevatedTenantRole(user?.roleKeys)`; the API gates on `billing.view` plus
`TENANT_ADMINISTRATION:read`. A user holding the permission but not an elevated
role is refused by the UI although the API would serve them. A user with an
elevated role but not the permission passes the UI gate and then sees the failed
load rendered as access denied. `AGENTS.md` singles out `hasElevatedTenantRole`
as a guard bypass; using it as the screen's own gate makes the two definitions
drift.

## Expected Behavior

A slow load shows a skeleton. A failed load says it failed, carries the trace id,
and offers a retry. A permissions refusal says that, and only that. The UI's
notion of who may open the screen matches the API's.

## Actual Behavior

As described above. The trace id is passed through to `AccessDeniedState`, which
is the one thing this path does well.

## Reproduction

1. `find "apps/web/app/(authenticated)/settings/subscription" "apps/web/app/(authenticated)/settings/billing" -name "loading.tsx" -o -name "error.tsx"` returns nothing.
2. Make `GET /billing/plans` fail (stop the API, or revoke `billing.view` from an
   elevated-role user). Open `/settings/subscription/plans`. The screen is the
   access-denied one.

## Evidence

`apps/web/app/(authenticated)/settings/subscription/_components/subscription-settings-page.tsx:55-68`:

```tsx
if (!subscriptionData.ok) {
  return (
    <SettingsShell title={copy.title} description={copy.description}>
      <AccessDeniedState
        title="Unable to load subscription"
        description={subscriptionData.message}
        traceId={subscriptionData.traceId}
        actionHref="/settings"
        actionLabel="Back to settings"
      />
    </SettingsShell>
  );
}
```

The UI gate, same file, line 37:

```tsx
const canViewSubscription = hasElevatedTenantRole(user?.roleKeys);
```

The API gate, `services/api/src/modules/billing/controllers/billing.controller.ts:22-27` —
`@Permissions(MISC_PERMISSION_KEYS.BILLING_VIEW)` plus
`@RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'read')`.

One further inefficiency on the same path: `loadSubscriptionSettingsData` fetches
`/billing/invoices` on every view, including Plans, which never reads them.

## Root Cause

`AccessDeniedState` was the nearest existing full-page failure component, and was
reused for a different kind of failure. The boundaries were never added because
the loader swallows its own errors and always returns a renderable result.

## Impact

Reachable in production. A transient API failure is reported to a paying customer
as a permissions problem, which sends them to an administrator instead of to a
retry. Low frequency, high confusion when it happens.

## Affected Areas

- `/settings/subscription/{overview,plans,billing-history}`
- `SubscriptionSettingsPage`, `loadSubscriptionSettingsData`

## Proposed Resolution

No ExecPlan needed.

1. Add `loading.tsx` and `error.tsx` under `settings/subscription/` following the
   conventions used elsewhere in `apps/web`.
2. Separate the two failure shapes: keep `AccessDeniedState` for the role
   refusal, and render a distinct load-failure state with the trace id and a
   retry action.
3. Align the UI gate with the API's permission keys rather than with
   `hasElevatedTenantRole`.
4. Fetch invoices only for the Billing History view.

## Acceptance Criteria

- Navigating to any subscription view shows a skeleton before data arrives.
- A failed load renders a retryable error state carrying the trace id, visually
  distinct from the access-denied state.
- The set of users the UI admits equals the set the API admits.

## Regression Coverage

Needs a REG entry: with the plans request failing, the rendered page is the error
state and not the access-denied state.

## Dependencies

None.

## Related Items

[[BUG-3330]], [[BUG-3331]], [[BUG-3332]], [[BUG-3333]], [[BUG-3334]], [[BUG-3335]]

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-09-11 — created from reviewer at `caad4a56`.
- 2026-09-11 — Architect triage: `FIX_NOW`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
