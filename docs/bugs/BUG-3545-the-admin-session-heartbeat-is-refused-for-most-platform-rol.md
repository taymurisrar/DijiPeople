---
ID: BUG-3545
aliases: [BUG-3545]
Title: The admin session heartbeat is refused for most platform roles and raises a blocking permission dialog
Status: OPEN
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [services/api/src/modules/auth, apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt:
---

# BUG-3545 — The admin session heartbeat is refused for most platform roles and raises a blocking permission dialog

## Summary

`apps/admin`'s shell silently pings `POST /auth/activity` on click/keydown/
focus to keep the session alive. That endpoint requires the tenant permission
`user-preferences.write`, which most platform roles do not hold, so the ping
403s — and because the admin shell also globally intercepts every non-2xx
`/api/` response and raises a full-screen error modal, a routine background
heartbeat failure surfaces to the operator as a blocking "Access Denied"
dialog that intercepts clicks over whatever screen they were using.

## Expected Behavior

Recording one's own session activity is a self-scoped action (it only ever
acts on the caller's own session, via `@CurrentUser()`) and should need no
business permission at all — a platform user with, say, only
`contracts.read` should be able to keep their own session alive without being
told they lack `user-preferences.write`. Separately, a background
heartbeat/telemetry call failing should never raise a blocking, click-
intercepting modal — at most a silent retry or a non-blocking toast.

## Actual Behavior

`POST /auth/activity` is guarded by `@Permissions('user-preferences.write')` +
`@RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'write')` — a tenant
permission key most platform roles never hold. When the admin shell's
activity ping receives that 403, the app's global fetch interceptor
(`ErrorProvider`) treats it exactly like a user-initiated action failing and
opens a full-screen, `z-[150]`, backdrop-blurred modal reading "Error
ACCESS_DENIED — You do not have permission to perform this action.", which
sits over the current screen (e.g. a tenant record) and must be dismissed
before the operator can click anything else on the page.

## Reproduction

1. Sign in to `apps/admin` as a platform user whose role does not carry
   `user-preferences.write` (e.g. `PLATFORM_ADMIN`, `CONTRACT_MANAGER`, most
   of the 16 `PlatformUserRole` values).
2. Use the app normally — click, type or refocus the window. After 60 seconds
   of activity-throttling, the shell fires `POST /api/auth/activity`.
3. **Live reproduction, 2026-09-25**: `POST /api/auth/activity` returned
   `403`; the admin app showed a modal "ERROR ACCESS_DENIED — You do not have
   permission to perform this action." over the tenant record, intercepting
   clicks until dismissed.

## Evidence

- `services/api/src/modules/auth/auth.controller.ts:159-164`:
  ```ts
  @Post('activity')
  @Permissions('user-preferences.write')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'write')
  activity(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.recordActivity(user);
  }
  ```
  The permission is a tenant one (`user-preferences.write`); most platform
  roles' `ROLE_PERMISSIONS` entries (`platform-permissions.ts`) do not grant
  it, and the platform permission model has no equivalent self-scoped key for
  this action at all.
- `apps/admin/app/_components/admin-shell.tsx:71-80` (`syncActivity`) —
  fires `window.fetch("/api/auth/activity", { method: "POST" }).catch(() =>
  undefined)` on `click`/`keydown`/`focus`, throttled to once per 60s. The
  `.catch` only swallows a network-level failure; a resolved `403` response is
  not an exception and is not caught here.
- `apps/admin/app/api/auth/activity/route.ts` — thin proxy, no additional
  gating, forwards straight to `/auth/activity`.
- `apps/admin/components/errors/error-provider.tsx:81-108` — a *second*,
  independent `window.fetch` patch that inspects **every** response to a URL
  containing `/api/`: `if (response.ok || !url.includes("/api/") ||
  url.includes("/api/error-logs/client") || url.includes("/api/error-logs/"))
  return response;` — everything else, including the activity ping, falls
  through to `window.dispatchEvent(new CustomEvent(apiErrorEventName(), {
  detail: { error: normalizeApiError(data, response.status) } }))`.
- `apps/admin/components/errors/error-provider.tsx:122-125` — `{error ?
  <ErrorModal error={error} user={user} onClose={clearError} /> : null}`, and
  `ErrorModal` (line 135) renders `<div className="fixed inset-0 z-[150] ...
  backdrop-blur-sm">` — a full-viewport, click-intercepting overlay for any
  error the provider is shown, with no distinction between a user-initiated
  action failing and a background ping failing.

## Root Cause

Two independent defects compound: (1) `POST /auth/activity` is gated by a
tenant business permission (`user-preferences.write`) instead of being
self-scoped and permission-free like every other `me`-only action in this
codebase (e.g. `platform-users.controller.ts`'s `me/*` routes), so most
platform roles cannot legitimately call it; and (2) the admin shell's global
error-surfacing mechanism (`ErrorProvider`'s `window.fetch` patch) treats
every non-2xx `/api/` response identically, with no allowance for a
fire-and-forget background call, so a heartbeat failure gets the same
blocking, full-screen treatment as a failed user-initiated save.

## Impact

Every platform user whose role lacks `user-preferences.write` (the large
majority of the 16 `PlatformUserRole` values, per D1's role inventory) sees an
unprompted, click-blocking "Access Denied" dialog appear over whatever they
are doing, roughly once a minute of active use. This degrades every platform
admin session, not a rare edge case, and is reachable in production today.

## Affected Areas

- `services/api/src/modules/auth/auth.controller.ts` (`activity` handler)
- `apps/admin/app/_components/admin-shell.tsx` (activity ping)
- `apps/admin/components/errors/error-provider.tsx` (global error interception and modal)

## Proposed Resolution

1. Make `POST /auth/activity` self-scoped and permission-free (or gated by a
   trivial "authenticated" check only), matching the `me`-only pattern used
   elsewhere (`platform-users.controller.ts`'s `me/*` routes) — the handler
   already only ever acts on `@CurrentUser()`, so no business permission is
   protecting anything real here.
2. Separately, harden `ErrorProvider`'s fetch interceptor so a background/
   fire-and-forget call (activity ping, and any future telemetry-style call)
   can opt out of the global blocking-modal treatment — e.g. an explicit
   header or a URL allowlist alongside the existing `/api/error-logs/*`
   exclusion — so a heartbeat failure degrades silently instead of
   interrupting the operator.
Both are small, scoped fixes; no ExecPlan needed.

## Acceptance Criteria

- A platform user without `user-preferences.write` can trigger the activity
  ping and receive `200`, not `403`.
- A failing background activity ping never opens the blocking error modal.
- A genuine user-initiated action failure (e.g. a rejected tenant save) still
  raises the modal as today.

## Regression Coverage

A unit test on `AuthController.activity`'s guard configuration (no permission
required, or a self-scope-only check), and a frontend test asserting the
activity ping's failure does not dispatch `apiErrorEventName()`. No `REG-nnn`
entry yet.

## Dependencies

None.

## Related Items

- [[BUG-3544]] — the same discovery pass's other platform-authorization
  finding in the tenant-edit path.
- TASK-0032 — the program that found and will fix this.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; live reproduction on a
  throwaway stack.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032).

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]], [[platform-admin]]

<!-- GRAPH:END -->
