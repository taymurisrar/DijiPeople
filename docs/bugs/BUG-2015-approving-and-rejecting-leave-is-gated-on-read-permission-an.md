---
ID: BUG-2015
aliases: [BUG-2015]
Title: Approving and rejecting leave is gated on read permission and the dedicated approve keys are never required
Status: FIXED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/leave]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-303
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-2015 — Approving and rejecting leave is gated on read permission and the dedicated approve keys are never required

## Summary

`POST /leave-requests/:id/approve` and `POST /leave-requests/:id/reject` are both
decorated with the **read** permission, in both permission systems. Dedicated
`leave-requests.approve` and `leave-requests.reject` keys exist, are mapped in
the RBAC matrix and are granted to roles — but an exhaustive search of the API
finds them consulted only for deciding what the dashboard and inbox *display*,
and inside the override path. They are never required to perform the action. An
administrator who withholds `leave-requests.approve` from a role has not stopped
that role from approving leave; anyone holding `leave-requests.read` reaches the
endpoint, and the only remaining check is `canUserActOnStep` — the same function
whose elevated-role bypass ordering is already filed as BUG-1970.

## Expected Behavior

The endpoint that performs an approval requires the permission that names
approval. Concretely, `@Permissions('leave-requests.approve')` plus
`@RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, <the matching privilege>)` on the
approve handler and the reject equivalent on the reject handler — so that
revoking the granular permission an administrator was offered actually revokes
the capability, and the UI gating mirrors a server decision rather than being the
only decision.

The sibling `cancel` handler in the same controller already does this.

## Actual Behavior

`services/api/src/modules/leave/leave-requests.controller.ts:125-145`:

```ts
@Post(':id/approve')
@Permissions('leave-requests.read')                      // read
@RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'read')   // read

@Post(':id/reject')
@Permissions('leave-requests.read')                      // read
@RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'read')   // read
```

immediately above the handler that is correct:

```ts
@Post(':id/cancel')
@Permissions('leave-requests.cancel')
@RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'delete')
```

## Reproduction

Established by reading the deployed source at `eb457d9d`, not by a live probe.
The configuration is directly inspectable:

1. Open `services/api/src/modules/leave/leave-requests.controller.ts` and read
   lines 125-145. Both state-changing handlers declare the read permission in
   both systems; the `cancel` handler below them declares `leave-requests.cancel`
   and the `delete` privilege.
2. Grep `services/api/src` for `leave-requests.approve` and
   `leave-requests.reject`. Every hit is a display decision or the override path
   (enumerated under Evidence); none is a guard on the approve or reject
   endpoint.
3. Grant a role `leave-requests.read` and withhold `leave-requests.approve`. The
   role still satisfies `PermissionsGuard` on the approve endpoint.

**Scope limit, stated plainly: live privilege escalation was NOT demonstrated.**
Doing so requires a second activated user holding `leave-requests.read` without
`leave-requests.approve`, and this environment cannot activate a second user
because it has no deliverable mailbox — see BUG-1969 and ITEM-0106. What is
proven is the guard configuration and the total absence of an enforcement call
site for the dedicated keys. Exploitability should be settled by a test, not by
another manual attempt.

## Evidence

Code, at `eb457d9d`:

- The two mis-decorated handlers and the correct sibling:
  `services/api/src/modules/leave/leave-requests.controller.ts:125-145`, quoted
  above.
- The dedicated permissions exist and are assignable:
  `common/constants/permissions.ts:41-42` and `:928` / `:933` define
  `leave-requests.approve` and `leave-requests.reject`;
  `common/constants/rbac-matrix.ts:1267-1268` maps them;
  `permissions.ts:2232-2233` and `:2419-2420` grant them to roles.
- Exhaustive grep across `services/api/src` for where those two keys are
  consulted:
  - `modules/dashboard/dashboard.service.ts` — five call sites, all deciding what
    the dashboard **shows**.
  - `modules/inbox/inbox.service.ts:446-447` — deciding what the inbox **shows**.
  - `modules/leave/leave.service.ts:2168-2169` — inside
    `canOverrideLeaveDecision`, i.e. the **override** path, not the ordinary
    authorization path.

  There is no fourth category. The keys gate presentation and an override, never
  the action itself.

This is precisely the shape `AGENTS.md` legislates against in two places: both
decorators must be "present and consistent" (they are present and consistently
wrong), and "Permissions in the UI are cosmetic … every gated action must also be
enforced server-side" (here the UI gating is the *only* gating on the granular
key).

## Root Cause

**Established at the configuration level:** the approve and reject handlers were
decorated with the read permission and the dedicated keys were added later for
the dashboard and inbox to consume, without ever being wired into the guard.

Not established: whether that was an oversight or a deliberate decision that
"seeing the request implies being able to act on it, and `canUserActOnStep` is
the real control". The fix has to answer that, because if it *is* deliberate then
offering an assignable `leave-requests.approve` permission that does nothing is
the defect instead.

## Impact

An administrator configuring RBAC is shown a granular approve permission, can
grant and revoke it, sees the UI respond to it — and it does not control the
capability it names. Any role with read access to leave requests can call the
approve and reject endpoints directly.

What stands between such a caller and an actual approval is `canUserActOnStep`,
which is not nothing: ordinarily it restricts action to the resolved approver for
the pending step. But it is the same function carrying the elevated-role bypass
ordering problem in BUG-1970, so the last line of defence here is also the one
already under question — and neither of them is the permission the administrator
thinks they are relying on.

Rated HIGH: an object-level authorization gap inside a tenant, on a
state-changing endpoint that decides whether an employee's leave is granted. Not
CRITICAL: there is no cross-tenant exposure, no secret exposure and no
irreversible data loss, and a further check does still run.

## Affected Areas

`services/api/src/modules/leave/leave-requests.controller.ts` (the approve and
reject handlers); `common/constants/permissions.ts` and
`common/constants/rbac-matrix.ts` (the two keys and their matrix mapping);
`modules/leave/leave.service.ts` (`canUserActOnStep`,
`canOverrideLeaveDecision`); `modules/dashboard` and `modules/inbox`, which
consume the keys for display and would keep working unchanged.

## Proposed Resolution

Decide first whether the granular permissions are meant to be authoritative.

- **If yes** (the reading this record recommends, since they are assignable and
  documented): change both handlers to `@Permissions('leave-requests.approve')` /
  `@Permissions('leave-requests.reject')` with the matching matrix privilege, and
  audit the rest of the leave controller for the same pattern. Then confirm that
  the roles which are supposed to approve today actually hold the keys, so the
  change does not silently remove a working capability.
- **If no**, remove the two keys from the assignable set rather than leaving an
  administrator a control that does nothing — and say in the code why read
  implies act here.

In either case, sweep the other approval-bearing controllers for handlers
decorated with `read` on a state-changing route. This record establishes the
pattern in one module; it does not establish that the module is alone.

## Acceptance Criteria

- A role holding `leave-requests.read` but not `leave-requests.approve` receives
  a 403 from `POST /leave-requests/:id/approve`, and the same for reject.
- A role holding the approve permission and resolved as the pending step's
  approver still succeeds.
- No state-changing handler in the leave controller declares a `read` privilege.
- Whichever way the decision goes, the assignable permission set and the enforced
  permission set agree.

## Regression Coverage

REG-303 — `services/api/src/modules/leave/leave-approval-permissions.spec.ts`.

Read through the `Reflector` rather than by grepping the file, because that is
what a request actually meets: decorators are inherited and composed, and a scan
of the source cannot see what Nest assembles.

Its load-bearing assertions are the negative ones. `toContain('approve')` alone
would pass while `read` was *also* declared — and on the matrix side that would
defeat the gate entirely, because `PermissionsGuard` requires **at least one**
matrix privilege. So the spec asserts `read` is absent as well as approve being
present.

Mutation-tested: restoring the original decorators fails three of its six
assertions.


## Dependencies

BUG-1970 should be fixed in the same pass or immediately after: with the guard
corrected, `canUserActOnStep` becomes the second control rather than the only
one, and its bypass ordering is what determines whether that control holds.

## Related Items

BUG-1970 (the elevated-role bypass precedes the self-requester check) is the
other half of the same authorization surface. BUG-1969 and ITEM-0106 are why a
second activated user could not be produced to demonstrate escalation live.
BUG-1952 (plan entitlements gate nothing) is the same failure at the commercial
layer — a control the product offers, enforced only in the UI.

## Resolution

Two decorator pairs, on `leave-requests.controller.ts`:

```
approve   leave-requests.read  ->  leave-requests.approve  /  APPROVE
reject    leave-requests.read  ->  leave-requests.reject   /  REJECT
```

Nothing else was needed. Both keys already existed in
`common/constants/permissions.ts`, both privileges already existed in
`RBAC_PRIVILEGES`, and both were already granted to roles. **The keys were real;
no route required them.**

`cancel`, three routes below in the same file, has always used
`leave-requests.cancel` and `delete` — the contrast in one file is what makes
this a slip rather than a design, and the guard asserts `cancel` was left alone
so the fix did not tidy a route that needed nothing.

## QA Retest

Retested 2026-08-29 by the guard rather than in a browser: the six assertions
in `leave-approval-permissions.spec.ts` pass, and restoring the original
decorators fails three of them.

Not retested in production. What is established is that the routes now
declare their own permissions and refuse `read`; what is **not** established
is that a role holding `leave-requests.approve` can complete an approval end
to end — BUG-1967 and BUG-1968 mean no leave request can currently reach an
approval step on a fresh tenant at all.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; established by source inspection of the deployed commit and an exhaustive grep for the dedicated permission keys. Disposition FIX_NOW.


<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-303 (see the regression register)

<!-- GRAPH:END -->
