# Growth demo — recruitment to HR, 30 minutes

Audience: a recruitment and talent company evaluating the Growth plan. Synthetic data only; no customer information.

Every segment below is backed by a browser test that performs the same actions and asserts the persisted result, so the script is a replay of something that already passed, not a hope.

## Fixtures (reusable, idempotent)

```
npm --workspace api run seed:config
npm --workspace api run seed:demo            # demo tenant, role users, sample people
npm --workspace api run seed:admin           # platform operator
E2E_DATABASE_URL=<disposable *_test db> node e2e/tools/prepare-growth-tenant.mjs   # Growth subscription, entitlements ENFORCE
```

Accounts (demo tenant `dijipeople-demo`, password `DEMO_USER_PASSWORD` from the API env): the system admin, recruiter, HR, manager and employee users created by seed-demo. The tool refuses any database that is not loopback and named `*_test` / `*_e2e`.

## Run of show

| Min | Segment | Who | What you do | Proven by |
|---|---|---|---|---|
| 0–3 | Buy Growth | prospect | Pricing, Start with Growth, wizard, email code, bank details, payment claim | Flow Q Q1 |
| 3–6 | Activation | platform admin, owner | Approve the claim (second operator), tenant appears, owner activates and signs in; Recruitment and Timesheets present, Payroll absent | Flow Q Q1, Q2, Q7 |
| 6–12 | Hire | recruiter | Create a job opening, register a candidate, apply, move through stages to Hired | Flow O GO-1..GO-4 |
| 12–16 | Onboard | HR / admin | Start onboarding, complete the 11 tasks, assign department, designation, manager | Flow O GO-5..GO-7 |
| 16–18 | Convert | HR / admin | Convert to employee; open the employee record | Flow O GO-8 |
| 18–22 | Time and leave | employee, manager | Request leave, approve it from the Approvals inbox, see the notification; fill and submit a timesheet, approve it; check in and out | Flow P GP-L1, GP-A1, GP-T1, GP-AT1 |
| 22–25 | Projects and documents | admin | Create customer and project, assign the new employee; upload a document and download it | Flow P GP-P1, GP-D1 |
| 25–28 | Settings | admin | Change Late grace minutes, reload, see it persist, restore | Flow P GP-S1 |
| 28–30 | Boundary | admin | Show that Payroll is not part of Growth (refused by entitlement, with a quotable reference) | Flow N GN-E1, Flow I |

## Things to avoid in the room

- HR uploading from the employee record's Documents tab is refused today (BUG-4456, product decision). Upload as the admin, as the script does.
- The lookup editor used for department and designation is not automated (BUG-4447). Do that step by hand.
- Do not show the Approvals inbox as a manager for a new leave request; the approval is assigned to the admin. Use the admin.
- First load of each page after a deploy is slow. Open every page once before the call.

## Evidence

Browser runs on 2026-11-19: Flow O 8/8, Flow P 9 passed + 1 `fixme`, Flow Q 7/7 (Flow P and Q twice consecutively, zero tagged residue). CI results are recorded in PLAN-057.
