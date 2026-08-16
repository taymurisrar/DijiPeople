---
ID: BUG-0039
aliases: [BUG-0039]
Title: Employee payslip and bank account proxies return the callers own data on 403
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 1af3690
AffectedModules: [apps/web, services/api/src/modules/payroll, services/api/src/modules/employees]
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId: REG-034
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
---

# BUG-0039 — Employee payslip and bank account proxies return the callers own data on 403

## Summary

Two Next route handlers ask the API for **another employee's** payslips or bank
accounts. When the API correctly answers `403`, the proxy **silently re-requests
the caller's own records** from `/me/*` and returns them as `200` under a URL
that names the other employee. The refusal is converted into a successful
response containing different data than the one requested.

## Expected Behavior

A `403` is forwarded. `apps/web/AGENTS.md` states the rule these handlers break
twice over: "No business logic. **No authorization decisions.** Never decide
'this user may do X' here… A proxy that filters or permits is a second source of
truth and a security hole."

A response for `/api/employees/{X}/payslips` contains employee X's payslips or
an error. It never contains somebody else's.

## Actual Behavior

The caller receives `200 OK` with their **own** payslips or bank accounts,
labelled as the response for employee X.

## Reproduction

1. Authenticate as a user who may read their own payslips but not employee X's.
2. `GET /api/employees/{X}/payslips`.
3. The API returns `403` for `/payslips?employeeId=X`.
4. The handler re-requests `/me/payslips` and returns `200` with the caller's
   own payslips.
5. Repeat for `GET /api/employees/{X}/bank-accounts` — same behaviour via
   `/me/bank-accounts`.

## Evidence

`apps/web/app/api/employees/[employeeId]/payslips/route.ts:20-25`:

```ts
let response = await apiRequest(`/payslips?employeeId=${encodeURIComponent(employeeId)}`);
if (response.status === 403) {
  response = await apiRequest("/me/payslips");
}
```

`apps/web/app/api/employees/[employeeId]/bank-accounts/route.ts:9-12` — the
identical pattern against `/me/bank-accounts`.

In both files the substituted response then flows through the normal success
path (`payslips:33-36`, `bank-accounts:19-21`), so the caller cannot distinguish
it from a genuine answer. Nothing logs the substitution.

Both were read in full at `1af3690`.

## Root Cause

Established from the code shape: a UI convenience. An employee viewing their own
profile hits the same `/employees/{id}/…` route as a manager viewing someone
else's, and rather than branching in the page, the fallback was pushed into the
proxy. The API's authorization answer is treated as a routing hint instead of a
decision.

The deeper cause is that these proxies are exempt from every guard the
repository has: no test covers any of the 416 handlers, and the mechanical
checks that do scan them (`check-no-hardcoded-urls`,
`check-proxy-forwards-client-ip`, `check-no-native-prompt`) look for other
things entirely.

## Impact

Reachable by any authenticated tenant user.

The severity is **not** primarily cross-tenant exposure — the substituted data
belongs to the caller, so no one sees another person's records. The damage is
**data integrity and trust in an authorization boundary**:

- A manager or HR user browsing an employee they may not access is shown
  **their own salary and bank details presented as that employee's**. Any
  decision, screenshot, export or support conversation based on that screen is
  about the wrong person.
- Bank account data is the highest-sensitivity field the product holds, and this
  makes a denied read look like a successful one.
- It **masks genuine authorization failures**, so a permissions
  misconfiguration that should be loud is silent — nobody discovers the `403`
  because nobody ever sees it.

Not `CRITICAL`: no data crosses an identity boundary outward, and no
authentication is bypassed.

## Affected Areas

`apps/web/app/api/employees/[employeeId]/payslips/route.ts` ·
`apps/web/app/api/employees/[employeeId]/bank-accounts/route.ts` · every
employee-profile surface that renders payslips or bank accounts.

## Proposed Resolution

Direction, not a patch: **delete both fallbacks and forward the `403`.** If a
page needs "the caller's own record when viewing themselves", it must ask for
`/me/*` explicitly because it knows it is rendering the caller — that decision
belongs in the page, where the identity is known, not in a proxy reacting to a
refusal.

Then decide whether the `403` should be surfaced as the existing access-denied
state (`module-access-denied-state.tsx` already exists) rather than an error.

## Acceptance Criteria

- `GET /api/employees/{X}/payslips` returns the API's `403` unchanged when the
  caller may not read X.
- No response body from an `/employees/{id}/…` route ever contains records
  belonging to a different id than the one in the path.
- A test asserts the `403` is forwarded rather than substituted.

## Regression Coverage

**None today**, and none is possible with the current test setup — no spec
covers any of the 416 route handlers, and `jest.config.js` is `testEnvironment:
node` with `testMatch: **/*.spec.ts`. The regression needs a handler-level test,
which is the gap recorded in [[ITEM-0034]].

## Dependencies

None.

## Related Items

[[web-architecture]] · [[tenant-application]] ·
[[BUG-0041-web-route-proxies-make-authorization-and-business-decisions]] ·
[[ITEM-0034]] · [[ITEM-0012]] · bug pattern [[fail-open-scope]] ·
bug pattern [[service-authorization-hidden]].

## Resolution

Fixed. Both fallbacks are removed and the refusal is forwarded.

**A third instance existed that this record did not name.**
`apps/web/app/api/employee-bank-accounts/[id]/route.ts` did the same thing:
fetched `/me/bank-accounts` on 403 and returned whichever row's id matched.
Because the substitute came from `/me/*` it did not leak another person's data,
which is why it read as harmless — but it still answered around an authorization
refusal the API had already made, converting a 403 into a 200 or a 404 on the
proxy's own judgement. It is fixed too.

It was found by `scripts/check-proxies-forward-refusals.mjs`, written for this
record, on its first run.

**The rule was already written down.** `apps/web/AGENTS.md` says "No
authorization decisions. Never decide 'this user may do X' here… A proxy that
filters or permits is a second source of truth and a security hole." It was
broken three times in the same shape, which is the same pattern as BUG-0013 /
BUG-0031 / BUG-0033: a stated convention with nothing enforcing it. So the fix
is not three edits, it is the check.

The check distinguishes the case that is legitimate: refreshing a token on 401
and retrying **the same** request is correct and is what the partner portal
proxy does. Substituting a **different** endpoint is the defect. The portal
handler is allowlisted with that reason rather than pattern-matched around.

## QA Retest

`npm run check:proxies-forward-refusals` — 492 route handlers scanned, 0
offenders, 1 allowlisted with a stated reason.

Verified to fail: restoring the `/me/payslips` fallback reports the file and
the branch, exit 1.

`apps/web` suite 391 tests passing; web typecheck clean.

## History

- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003)
  and verified by direct read.
- 2026-08-17 — Architect triage: `FIX_NOW`. The fix is a deletion, it needs no
  design decision, and the current behaviour makes a denied read indistinguishable
  from a granted one on the two most sensitive record types in the product.
</content>
- 2026-08-17 — fixed and verified during the final parent implementation phase.
