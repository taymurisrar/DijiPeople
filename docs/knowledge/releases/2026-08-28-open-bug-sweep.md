---
title: 2026-08-28 — the open bug sweep
category: release
date: 2026-08-28
---

# Release — the open bug sweep

Two merges to `main`, both deployed and verified in production.

| | |
|---|---|
| **Previous production** | `e0aeabcd` |
| **Release** | `6e00395a` — PR #54, merged 17:02 UTC |
| **Correction** | `949f461c` — PR #55, merged ~20:47 UTC |
| **Contents** | 42 bug records closed, 1 filed and resolved, 1 advanced |
| **Migrations** | None. `prisma migrate deploy` was a no-op for both. |
| **Rollback class** | Code-only. Revert the merge commit and redeploy; no data to unwind. |

## What deployed

Code-only across `services/api`, `apps/admin`, `apps/web`, `apps/landing` and
`packages/config`. Render deployed the API automatically on each merge; all
three Vercel projects reported READY on `6e00395a` at 17:02:24.

The substantive change is one mechanism rather than many symptoms: the admin
runtime's generated manifest now derives what a form may write from the
module's create/update DTO instead of from the Prisma column. Form and API
could previously disagree for any module, and did — customers and partners were
unsavable in production.

## The correction, and why it was needed

`6e00395a` shipped BUG-0904's observability fix, and it did nothing.

`outboxWorker.enabled` was added to `AppService.getHealth()`. Its spec passed,
`app.controller.spec.ts` passed, CI passed, the release deployed — and
`GET /api/health` did not contain the field. `main.ts` registers express
handlers for `/`, `/api` and `/api/health` **before** Nest's router, so
`AppController` never answers those three paths in production. The health
payload has two producers and both specs asserted the one nothing reaches.

This is the failure mode worth carrying forward from this release: **a green
suite proves the code under test, not the code being served.** The fix was
correct in isolation, verified by two passing specs, and had no effect on the
running system. Caught only because the post-deploy verification asked
production what it reported rather than trusting the tests.

`949f461c` corrected it at the handler that answers, and
`health-payload-is-served.spec.ts` now asserts against `main.ts`.

## Verification

Against production at `949f461c`:

```
GET /api/health -> { "commitShort": "949f461", "status": "ok",
                     "outboxWorker": { "enabled": true } }
```

`npm run smoke:deployment` passes in full, including `ok - outbox worker is
draining events`. The public plans endpoint still serves 4 plans / 18 prices /
8 checkout-ready, unchanged across both deploys. `admin` and `app` redirect to
login as expected; `www` returns 200.

`outboxWorker.enabled: true` settles the question BUG-0904 carried from the day
it was filed: the variable is genuinely `"true"` rather than merely present.
That distinction could not be made from a key inventory, and it matters —
anything other than `"true"` leaves the dispatcher as idle as its absence did.

## Two changes support may hear about

Both intended.

- **Promotions are created inactive.** An operator used to the old screen adds
  one and finds it does nothing until they press Activate. That is BUG-1751,
  where one press with the form's own defaults published a live 10% discount
  against every eligible subscription.
- **Partners with an invalid `currencyCode` will not save until corrected.**
  Rows carrying `currencyCode: "5"` exist in production, because the old form
  rendered Currency as a numeric input. BUG-1425 and BUG-1747.

## Not verified

No browser pass and no database work. Several closed records name a browser
retest as the thing that would actually settle them and say so rather than
implying otherwise. The accessibility work in particular — 28 unlabelled
controls, the shell landmark defects — was closed against axe-core evidence and
has not been re-measured with axe-core.

## Related

- Task record — [`docs/engineering-history/tasks/2026-08-28-open-bug-sweep-cd4edb86.md`](../../engineering-history/tasks/2026-08-28-open-bug-sweep-cd4edb86.md)
- Regressions REG-272..REG-299 — [`docs/qa/regressions/index.md`](../../qa/regressions/index.md)
- Modules — [[platform-admin]], [[super-admin]], [[billing]], [[outbox]]
