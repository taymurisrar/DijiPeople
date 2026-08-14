# Bug Pattern — Duplicate Route Bypass

## Pattern
Two routes expose the same data through the same service call, but only one
declares a permission. The undeclared one is an open alias for the guarded one.

## Why it happens in DijiPeople
Convenience routes get added next to an existing one — an "availability" variant
for the app, a "summary" variant for a widget — by copying the handler and
trimming it. The decorators are the easiest thing to drop, and because
`PermissionsGuard` treats "nothing declared" as "nothing required", the copy
works immediately and looks correct.

## Example architecture area
`GET /tenant-settings/features/availability` declared no permission and called
the identical `service.getTenantFeatures(user.tenantId)` as the
`settings.read`-gated `GET /tenant-settings/features`. Same payload, one check.
It additionally returned `subscription.finalPrice` to every authenticated user.

## Detection checklist
- Grep the service method: how many controller routes call it?
- Do all of them declare comparable authorization?
- If the authorization deliberately differs, is the *payload* also narrowed to
  match the lighter permission?
- Are there `/summary`, `/availability`, `/lite`, `/public` style variants?

## Required regression test
Assert both routes' declared permissions explicitly, and assert they are
deliberately different where that is intended — so a future edit that collapses
them, or drops one, fails.

## Agent responsible
Backend/API.

## Reviewer check
For any new route, grep the service method it calls for other callers. Never
assume the new route is the only one.

## QA check
Attempt the sibling route with the weaker principal — the same data must not be
reachable by a route the requirement did not intend.

## Prevention rule
Two routes over one service method need one authorization story. If they
deliberately differ, the payload must differ too.
