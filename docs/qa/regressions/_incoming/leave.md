# Incoming regression entries — SESSION-0076, `agent/bugfix-leave`

Written here rather than appended to `docs/qa/regressions/index.md` because
concurrent bugfix streams would conflict on every line of one file. Merge into
the register centrally. Ids REG-329 to REG-333 were reserved for this stream and
cover BUG-1970, BUG-1969, BUG-2016, BUG-1965 and BUG-1962 respectively — five
entries for five records, because no two of them share a root cause.

### REG-329 — Self-approval reachable because the role bypass was asked first

| | |
|---|---|
| **Bug class** | `self-approval` |
| **Module** | `leave` |
| **Bug record** | BUG-1970 |
| **Root cause** | `LeaveService.canUserActOnStep` evaluated `hasElevatedTenantRole(currentUser)` **before** testing whether the current user is the requester, so a `global-admin` or `system-admin` who submitted a leave request was reported as the assigned approver of their own pending step. `processLeaveRequestDecision` treats a true answer from that helper as `isAssignedApprover` and consults `canOverrideLeaveDecision` only when it is false — and `canOverrideLeaveDecision` is the one that orders the two checks correctly. The override check was therefore not a second line of defence on that path; it was unreachable. An elevated tenant role could approve its own leave with no second party and no compensating control. |
| **Regression test** | `services/api/src/modules/leave/leave-self-approval.spec.ts` |
| **Scenario** | Both elevated roles refused on approve and on reject, with `$transaction`, `updateLeaveApprovalStep` and `updateLeaveRequest` asserted never called. The record payload no longer offers `canCurrentUserApprove` or `canCurrentUserReject` on the requester's own request. Two negative controls: an elevated role still acting on somebody else's request, and the assigned approver still acting with no elevated role at all. |
| **Proven to fail without the fix** | Mutation-tested. The original ordering was restored in `canUserActOnStep` — `hasElevatedTenantRole` first, the self-requester test second — by reverting `leave.service.ts` alone with the spec left in place, and the suite reported **5 failed, 2 passed**: the five positive cases fail and the two negative controls pass. Restored to the fix, **7 passed**. The bypass is demonstrated closed rather than merely asserted. |
| **Note** | The **negative** assertions are the load-bearing ones, as REG-303 and REG-304 both record for this class. Under the old ordering the refused calls did not throw at all — they fell through into the decision transaction — so a test asserting only the message could have passed against a version that merely reworded a later failure. That is why the refusal cases assert the write methods were never called, and why the mutation was run against the ordering rather than against the message. Two further points. The elevated-role bypass itself was not widened, narrowed or given a new member: `ELEVATED_TENANT_ROLE_KEYS` is untouched, and `AGENTS.md` requires an explicit decision before anything is added to that path. And the ordering is now stated twice on purpose — `canUserActOnStep` is the fix, while `processLeaveRequestDecision` refuses a self-decision explicitly at the entry point, so the outcome does not depend on two helpers continuing to agree. `attendance.service.ts` bars both parties to a correction before any role or permission path and was the reference for what leave should have looked like; it is unchanged. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-330 — A refusal that asserted the wrong predicate

| | |
|---|---|
| **Bug class** | `unactionable-refusal` |
| **Module** | `approvals` |
| **Bug record** | BUG-1969 |
| **Root cause** | `ApprovalMatricesService.validate` tested a candidate approver with `ApprovalMatrixRepository.findUserById`, whose `where` is `{ tenantId, id, status: 'ACTIVE' }` — one query answering two questions — and reported only the tenant half: "Selected approver user does not belong to this tenant." An `INVITED` user the tenant had just provisioned, and whom `GET /api/users` returns to the same caller, was therefore told a false fact about the caller's own data, sending an administrator to look for a cross-tenant mistake that never happened. |
| **Regression test** | `services/api/src/modules/approvals/approval-matrices.service.spec.ts` |
| **Scenario** | An invited approver refused with a message about account activation; a disabled one refused in its own words; a user genuinely outside the tenant still getting the exact original tenancy sentence; an active one created successfully. |
| **Proven to fail without the fix** | The invited case is the inversion. Against the previous code an invited approver produced `Selected approver user does not belong to this tenant.`, which that case now asserts the message does **not** contain — so it fails against the original implementation and passes only once the predicates are separated. |
| **Note** | The load-bearing assertions are again the negative ones — `not.toContain('does not belong to this tenant')` — plus `expect(repository.findUserById).not.toHaveBeenCalled()`, which is what shows the two paths were separated rather than merged. `findUserById` keeps its `ACTIVE` filter because `approval-matrix-resolver.service.ts` asks a different question at routing time: may this user be routed an approval **now**. The defect was configuration-time validation borrowing a resolution-time query. **Behaviour is unchanged and deliberately so:** whether an `INVITED` user may hold an approval step is a product decision shared with BUG-1968 and ITEM-0106, and the resolver does not check the status of a `USER` approver at all, so admitting one would route live requests to somebody who cannot sign in to act on them. Only the diagnosis changed. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-331 — A notification lifecycle with no resolution half

| | |
|---|---|
| **Bug class** | `half-built-model` |
| **Module** | `notifications`, `leave` |
| **Bug record** | BUG-2016 |
| **Root cause** | A notification's lifecycle ran only forwards from delivery, and every transition belonged to the recipient: `markInAppNotificationRead` and `archiveInAppNotification`, both keyed on a recipient row and both called from the user's own inbox actions. Nothing took a **record** and retired the outstanding requests for action pointing at it, so there was no call for a domain module to make. Cancelling a leave request left its approver holding an unread, priority-1 "Leave request needs approval" row against a `CANCELLED` record, counted by the dashboard badge; approve and reject left the same. The states were already modelled and never written — `NotificationStatus.ACTIONED` and `SUPERSEDED` exist, and `findActiveNotificationByDedupeKey` already treats both as inactive. |
| **Regression test** | `services/api/src/modules/notifications/notification-action-resolution.spec.ts` and `services/api/src/modules/leave/leave-notification-lifecycle.spec.ts` |
| **Scenario** | The mechanics: both tables written, tenant-scoped, `readAt` filled only where it was empty, `archivedAt` set, and nothing written at all when the record has no outstanding request for action. The call sites: cancel, approve and reject each resolve the notification keyed on that leave request, and on the decision path resolution runs **before** the employee's outcome notification is emitted. |
| **Proven to fail without the fix** | The call-site assertions have nothing to call against the previous code — `NotificationsService` had no resolution method at all — so the leave spec fails on `resolveActionRequired` being undefined. The mechanics spec covers new behaviour with no prior implementation to revert to, so its proof is the second case: a record with no outstanding request for action must write nothing, which is what stops the resolution being applied indiscriminately. |
| **Note** | **Two tables have to be written for a row to actually leave the queue**, which is the part a call site would most likely have got wrong on its own. `NotificationRecipient` is what the inbox listing and the unread badge read; `Notification.status` is what the dedupe lookup reads, so retiring only the recipient row would suppress the *next* legitimate notification for the same record. The capability was put in the notification layer keyed on the related record rather than at the leave call site, because timesheets, claims, loans and business trips raise the same kind of action-required row — **none of them calls it yet**, which is follow-up work rather than a claim made here. Scoped to `requiresAction` rows on purpose: an informational notification about a record is still true after it settles, and clearing it would be losing history rather than clearing a queue. It runs after the transaction, alongside the `emit` calls it mirrors, because a decision must not roll back because an inbox row could not be tidied. **Not retroactive:** rows stranded before the release stay where they are. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-332 — The record-status widget proposing an owner the API forbids

| | |
|---|---|
| **Bug class** | `client-proposes-a-server-decision` |
| **Module** | `apps/web` runtime |
| **Bug record** | BUG-1965 |
| **Root cause** | `sanitizeStandardMutationValues` keeps every declared field that is not `isReadOnly` and is present in the submitted values, and the submitted values are the record page's draft — which the record-status header populates with an owner on every standard module. `SubmitLeaveRequestDto` whitelists neither `ownerId` nor `status`, and the global `ValidationPipe` runs with `forbidNonWhitelisted: true`, so either one in the body is a 400: no employee could submit a leave request through the UI. The widget is shared, so the question was never leave's alone. |
| **Regression test** | `apps/web/lib/runtime/modules/leave-create-payload.spec.ts` and `apps/web/lib/runtime/modules/record-status-create-payload.spec.ts` |
| **Scenario** | The leave spec asserts the request body carries neither `ownerId` nor `status` while still carrying the four fields the request is actually made of. The sweep drives the real adapter's `create()` for **every** exported `StandardModuleRuntimeSpec` with a draft carrying an owner under the spec's own owner field and under both spellings the widget has used, and asserts the body carries none of them. |
| **Proven to fail without the fix** | The sweep failed against the tree as it stood: eleven specs passed and `attendanceRuntimeSpec` failed, which is how the remaining instance was found. The leave spec was mutation-tested at the earlier half-fix — with `isReadOnly` removed from `status` it fails on `expect(captured.body).not.toHaveProperty("status")`, which is precisely the state that had shipped and read as fixed. |
| **Note** | The assertion is on the **request body**, not on the specs' field flags. Marking only `ownerId` read-only looked like a fix and was not; a test reading the flags would have passed against the shipped half-fix. `attendanceRuntimeSpec` declared `ownerId` writable and no attendance DTO whitelists it, so a runtime create there would have 400'd exactly as leave did — its `/attendance/new` page uses a bespoke form, which is why nobody had hit it, and the latent defect is closed anyway. `status` is deliberately **not** swept the same way: it reaches a create body only when a page seeds it into the draft, and `/leaves/new` is the only page that does, so asserting its absence everywhere would force read-only onto status fields that edit forms legitimately write. The sweep guards itself with a count assertion, because a halved spec list would make every case vacuous and still report green — the same failure mode REG-305 records for an `it.each` over an empty array. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-333 — A required field with a marker and no gate

| | |
|---|---|
| **Bug class** | `declared-but-unwired-control` |
| **Module** | `apps/web` runtime |
| **Bug record** | BUG-1962 |
| **Root cause** | The quick-create dialog behind every related list ran no client-side validation at all. Its Save and Save & Close buttons are `type="button"` with plain click handlers, so there is no form submit for the browser's native `required` to gate, and the panel passed the renderer neither `fieldErrors` nor `touchedFields`. `validateRuntimeForm` — which produces exactly the wanted sentence, "Assigned On is required." — was imported by `module-record-page.tsx` and by nothing else. Marking "Assigned On" `required: true` therefore produced the asterisk and stopped nothing: the value still reached the API, which answered `effectiveFrom must be a valid ISO 8601 date string` for a control labelled "Assigned On". |
| **Regression test** | `apps/web/lib/runtime/quick-create-validation.spec.ts` |
| **Scenario** | Driven through the real path — the subgrid metadata a settings tab declares, the quick-create entity and form built from it, and the gate the dialog now runs before `onSave`. An empty "Assigned On" is blocked with that error on `effectiveFrom` and nothing shown anywhere contains `effectiveFrom` or `ISO 8601`; supplying it validates; every other registry-declared required quick-create field is gated the same way; absent metadata does not block. |
| **Proven to fail without the fix** | Mutation-tested: with `resolveQuickCreateSubmission` forced to return `valid`, the suite reports **3 failed, 4 passed** — both leave-policy tab cases and the class sweep fail, and the controls pass. |
| **Note** | Third sibling of this class in the register after REG-303 and REG-308: a control that is declared and connected to nothing is worse than an absent one, because the person who reads it believes a boundary has been drawn. Here the marker *was* the control and the missing connection was the gate. The **negative** assertion is the load-bearing one — that nothing the user reads contains `effectiveFrom` or `ISO 8601` — because a test asserting only that validation ran would pass while the DTO property name was still on screen. `buildSubgridQuickCreate` moved from `module-related-subgrid.tsx` to `lib/runtime/quick-create-metadata.ts` **unchanged**, purely so the behaviour could be tested at all: `apps/web` runs its tests in a node environment with no jsdom, so a component that owns its own helpers cannot be exercised. The one thing no test here reaches is the two-line wiring inside the panel component; `tsc` covers its shape. Because the gate belongs to the dialog rather than to this field, it closes the same hole for every required quick-create field in settings. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |
