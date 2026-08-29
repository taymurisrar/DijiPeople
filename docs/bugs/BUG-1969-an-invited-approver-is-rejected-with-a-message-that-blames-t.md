---
ID: BUG-1969
aliases: [BUG-1969]
Title: An invited approver is rejected with a message that blames tenancy instead of account status
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/approvals]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
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

Not established in code. Observably the check filters candidate approvers by
tenant **and** status, and reports only the tenant half in its message.

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

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — wrong error message.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[approvals]]

<!-- GRAPH:END -->
