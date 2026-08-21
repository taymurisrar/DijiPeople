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

## Shared console primitives

Reach for these before writing a fourth copy of one:

- `app/_components/notifications/notification-model.ts` — the severity map, the
  relative-time formatter, both notification endpoints and the
  `dijipeople:notifications-read` event name. The bell and the feed page both
  read it; the badge and the list deliberately read **one** endpoint so they
  cannot disagree about one number, and both listen for the read event so
  clearing the mark in one place updates the other.
- `lib/list-paging.ts` — `describePage(total, requestedPage, pageSize)`. The
  window is computed rather than stored, which is the point: a page number held
  in state survives the list being filtered under it. Pattern:
  [[unbounded-render]].
- `lib/documents/signature-block.ts` — the signature-box markup, kept out of the
  editor component so its constraints can be asserted without importing TipTap.
  It must produce a `table`; see [[contracts-and-agreements]] for why, and for
  why a party outside `platform`/`counterparty` gets ruled lines rather than a
  placeholder.

The contract template editor's fields panel is a **sticky rail**, not a
dropdown. It was a dropdown, and it closed on every insertion — building a
four-line signature block meant reopening and re-searching four times.

## Stacking order

`lib/z-layers.spec.ts` asserts it, and a popover in the topbar is the case that
looks wrong and is not: the notification panel is `z-20` (page-popover tier)
because the topbar is `relative z-30` and forms a stacking context, so the panel
clears all page content regardless. Claiming `z-30` there fails the spec, which
reserves the shell tier for three named shell files.

## Testing constraint

`apps/admin` jest runs in a **node environment with no jsdom**, so no component
here has ever been rendered in a test. Every UI finding above was read from
code. [[ITEM-0001]].

That constraint is why the primitives above are plain modules with their own
specs: logic extracted from a component is logic that can be asserted, and it is
the only coverage this app can have. It is not a substitute for looking — the
two regressions in [[BUG-0350]] and [[BUG-0351]] were both invisible to every
test that existed and obvious in a screenshot.

## Related

[[authentication]] · [[rbac]] · [[runtime-module-system]] ·
[[tenant-control-plane]] · [[tenant-provisioning]] · [[partners]] ·
[[leads]] · [[customers]] · [[qa-and-ci-architecture]]
