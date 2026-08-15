# Platform Admin

> Generated from repository evidence at `ad8f77f`.

## Purpose

`apps/admin` (port 3002) — DijiPeople's **own** SaaS operations across every
tenant: the commercial funnel, customers, partners, tenants, plans,
subscriptions, invoices and platform settings.

## Identity

Platform users are a **separate identity** from tenant users
(`authSubjectType: 'platform-user'`). A platform admin is not a tenant user with
extra permissions — see [[authentication]]. That separation is what keeps every
tenant endpoint from being a potential cross-tenant endpoint.

## Frontend architecture

App Router with an `(internal)` route group. **`ProDataTable`
(`app/_components/crm/data-table.tsx`) is the table for every production admin
screen**, alongside `RuntimeModulePage`, `RuntimeRecordPage`, `RuntimeForm`,
`RuntimeViewSelector` and `ModuleActionBar`. A hand-rolled table is a review
failure — see [[runtime-module-system]].

Route handlers under `app/api/` are **thin proxies**: no business logic, no
authorization or tenant decisions.

## Where it has actually broken

- [[BUG-0008-session-expired-sign-in-again-returned-405]] — VERIFIED, and
  reproduced in production. The session-expired modal linked to a route that
  exported only `POST`; the browser's own error page rendered outside the app,
  so there was no `error.tsx` and no route back to `/login`. **`apps/web`
  already handled it correctly and hid the gap** — the two apps diverge
  silently, which is the standing lesson here.
- [[BUG-0009-session-revocation-depended-on-the-refresh-cookie]] and
  [[BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500]] — found
  auditing the same path, fixed, and still `FIXED` rather than `VERIFIED`
  ([[ITEM-0002]]).
- [[BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable]] —
  OPEN, HIGH.
- [[BUG-0020-window-prompt-used-for-governed-reasons]] — OPEN.
- [[BUG-0022-provision-tenant-has-no-confirmation-step]] — OPEN.
- [[BUG-0018-bulk-lead-delete-is-unreachable-for-every-role]] — DEFERRED. The
  platform permission resolver has no `DELETE` mapping, so **every** platform
  `DELETE` route is dead. It fails closed.

## Testing constraint

`apps/admin` jest runs in a **node environment with no jsdom**, so no component
here has ever been rendered in a test. Every UI finding above was read from
code. [[ITEM-0001]].

## Related

[[authentication]] · [[rbac]] · [[runtime-module-system]] ·
[[tenant-control-plane]] · [[tenant-provisioning]] · [[partners]] ·
[[leads]] · [[customers]] · [[qa-and-ci-architecture]]
