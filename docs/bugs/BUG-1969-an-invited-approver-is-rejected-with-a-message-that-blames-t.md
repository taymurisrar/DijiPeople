---
ID: BUG-1969
aliases: [BUG-1969]
Title: An invited approver is rejected with a message that blames tenancy instead of account status
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/approvals]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1969 — An invited approver is rejected with a message that blames tenancy instead of account status

## Summary

Creating an approval matrix step whose approver is a user who has not yet
activated their account fails with "Selected approver user does not belong to
this tenant." The user does belong to this tenant — the tenant's own provisioning
created them, and `GET /api/users` returns them. The real predicate is account
status, and the message names the wrong one.

## Expected Behavior

Either an `INVITED` user may be named as an approver — which is what an
administrator does while onboarding, before anyone has clicked an invitation
link — or the rejection says plainly that the user has not activated their
account yet and what to do about it. A message that asserts a false fact about
the caller's own data is not an acceptable third option.

## Actual Behavior

```
POST /api/approval-matrices
{"approverType":"USER","approverUserId":"<INVITED user>", …}
-> 400 "Selected approver user does not belong to this tenant."
```

The same call with an `ACTIVE` user id returns `201`.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Provision system access for an employee without sending an invitation:
   `POST /employees/:id/provision-access
   {"provisionSystemAccess":true,"sendInvitationNow":false}`. The created user has
   status `INVITED`. (Done for EMP-0002, `omar.haddad@demo.dijipeople.com`.)
2. Confirm the user is in this tenant: they are returned by `GET /api/users`.
3. `POST /api/approval-matrices` with `approverType: 'USER'` and that user's id ->
   `400 "Selected approver user does not belong to this tenant."`
4. Repeat with an `ACTIVE` user's id -> `201`.

## Evidence

The two calls and their responses above, on the production demo tenant, plus the
`GET /api/users` listing that includes the rejected user. The only difference
between the failing and succeeding call is the approver's account status.

No file:line evidence was collected for the validation in the `approvals` module;
it should be located before the fix so the predicate and its message can be
corrected together.

## Root Cause

**Established in code.** One query answered two questions, and the message
reported only one of them.

`ApprovalMatricesService.validate` called
`ApprovalMatrixRepository.findUserById`
(`services/api/src/modules/approvals/approval-matrix.repository.ts:134`), whose
`where` is `{ tenantId, id, status: 'ACTIVE' }`. A miss can mean either "not in
this tenant" or "not an active account", and the single message asserted the
first:

```ts
if (data.approverUserId && !(await this.repository.findUserById(tenantId, data.approverUserId)))
  throw new BadRequestException('Selected approver user does not belong to this tenant.');
```

`UserStatus` has three members — `ACTIVE`, `INVITED`, `DISABLED` — so an
`INVITED` user the tenant had just provisioned failed the query and was reported
as belonging to some other tenant, contradicting the `GET /api/users` listing
the same caller had just read.

`findUserById` is not itself wrong. `approval-matrix-resolver.service.ts` uses
it at routing time, where the question really is "may this user be routed an
approval right now" and the `ACTIVE` filter is the correct answer. The defect
was configuration-time validation borrowing a resolution-time query.

## Impact

Two problems, one record. The message is factually wrong and unactionable — an
administrator reading it will look for a cross-tenant mistake that does not
exist. And the behaviour blocks the ordinary onboarding sequence: you cannot
pre-configure an approval route for a manager who has not activated their
account, which is precisely the order in which onboarding happens.

Rated MEDIUM: it is a validation and messaging defect with an onboarding cost,
not a data or authorization failure, and there is a workaround once the manager
activates.

## Affected Areas

`services/api/src/modules/approvals` (approver validation on
`POST /api/approval-matrices`), and the Settings > Approvals & Workflows screens
that call it.

## Proposed Resolution

Separate the two predicates. Report a tenancy failure only when the user really is
outside the tenant, and report a status failure in its own words. Then decide,
deliberately, whether an `INVITED` user may hold an approval step — if not, the
message must say the account is not active yet and offer the resend-invitation
path; the decision belongs with BUG-1968 and ITEM-0106.

## Acceptance Criteria

- Naming an `INVITED` user as approver either succeeds, or fails with a message
  about account status.
- The tenancy message appears only for a user genuinely outside the tenant.
- No message asserts something contradicted by `GET /api/users` for the same
  caller.

## Regression Coverage

None yet.

## Dependencies

The product decision about invited approvers is shared with BUG-1968 and
ITEM-0106.

## Related Items

BUG-1968 (approval routing ignores the matrix and demands an active reporting
manager) and ITEM-0106 (an employee is blocked until their manager activates).
BUG-1547 (onboarding prerequisite message states the inverse of the truth) is the
same class of misleading-message defect in the admin console.

## Resolution

**Fixed.** The two predicates are asked separately and each is reported in its
own words. The behaviour is unchanged; the diagnosis is what was wrong.

- `services/api/src/modules/approvals/approval-matrix.repository.ts:140-155` —
  new `findTenantUserById(tenantId, id)` selecting `{ id, status }`, with no
  status filter. `findUserById` keeps its `ACTIVE` filter untouched, because the
  route resolver depends on it.
- `services/api/src/modules/approvals/approval-matrices.service.ts:257-289` —
  `validate` looks the approver up with the new method. A miss is a genuine
  tenancy failure and keeps the original sentence. A hit whose status is not
  `ACTIVE` is refused by `approverStatusMessage`
  (`approval-matrices.service.ts:367-378`): an invited account is told
  `Selected approver user has not activated their account yet. They can be named
  as an approver once they accept their invitation — resend it from
  Settings > Users if needed.`, and a disabled one is told the account is
  disabled.

### The product question was deliberately not answered here

Whether an `INVITED` user may hold an approval step is the decision this record
shares with BUG-1968 and ITEM-0106, and a message fix is not entitled to make
it. There is also a concrete reason not to make it in passing: the route
resolver does not check the status of a `USER` approver at all
(`approval-matrix-resolver.service.ts:341-355` returns `matrix.approverUserId`
as the step's approver unconditionally), so admitting an invited approver would
route live requests to somebody who cannot sign in to act on them. Admitting one
needs that gap closed first, which is BUG-1968's territory.

Against the acceptance criteria:

- **1, naming an INVITED user either succeeds or fails with a message about
  account status** — met by the second branch. The criterion was written to
  allow either outcome.
- **2, the tenancy message appears only for a user genuinely outside the
  tenant** — met.
- **3, no message asserts something contradicted by `GET /api/users`** — met.

### Regression coverage

`services/api/src/modules/approvals/approval-matrices.service.spec.ts`, four
cases: an invited approver refused by status and *not* by tenancy, a disabled
one refused in its own words, a user outside the tenant still getting the exact
tenancy sentence, and an active one created — with `findUserById` asserted
**not** to have been called, which is what shows the resolution-time and
configuration-time paths were separated rather than merged.

## QA Retest

Not performed live. The reproduction needs a tenant carrying an `INVITED` user
and a release that contains the change; this task did not touch `main`, so
nothing here is verified in production.

The retest is the Reproduction section unchanged. Expect step 3 to answer 400
with the activation message instead of the tenancy one, and step 4 to keep
returning 201. A user id from another tenant must still produce
`Selected approver user does not belong to this tenant.` — that sentence has to
survive, because the fix narrows when it is said rather than removing it.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — wrong error message.
- 2026-08-29 — **fixed** in SESSION-0076 on `agent/bugfix-leave`: configuration-time approver validation stopped borrowing the resolution-time `ACTIVE` query, so a tenancy miss and a non-active account are now separate refusals with separate messages. Covered by `approval-matrices.service.spec.ts`. Status OPEN to FIXED. The product decision on whether an invited user may hold a step is deliberately left with BUG-1968 and ITEM-0106; behaviour is unchanged.


<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[approvals]]

<!-- GRAPH:END -->
