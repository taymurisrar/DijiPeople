---
ID: BUG-3169
aliases: [BUG-3169]
Title: Notification fan-out runs O(rules x recipients) sequential round trips inline on the triggering request
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/notifications]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3169 — Notification fan-out runs O(rules x recipients) sequential round trips inline on the triggering request

## Summary

Notification fan-out runs O(rules x recipients) sequential round trips inline on the triggering request

Identified by the 2026-09-10 full technical audit as DBQ-02 (confidence: DBQ-02=CONFIRMED).

## Expected Behavior

Batch the dedupe check with one `findMany({ where: {
  dedupeKey: { in: [...] } } })` per rule instead of one `findFirst` per
  recipient, and batch the inserts with `createMany`. Recipient resolution
  should be capped or paged for role-based resolvers, since an unbounded
  `HR_ROLE`/`MANAGER_ROLE` result set is itself the amplifier.

## Actual Behavior

`emit()` is the single entry point every
  state-changing module calls to notify (leave approval, payroll events,
  contract signatures, onboarding steps, etc. — `grep -rn "notificationsService.emit("`
  across `services/api/src/modules` returns call sites in a dozen modules). For
  R matching rules and N total resolved recipients, `emit()` issues
  `R × (1 template lookup) + R (resolveRecipients queries, 0-1 each) + ΣN (1
  dedupe check + up to 1 insert)` sequential round trips, synchronously, on the
  HTTP request that triggered the event. A tenant with 20 HR/manager-role users
  matched by 2 rules is 2 + 2 + 40 (dedupe) + up to 40 (insert) = roughly 84
  sequential DB round trips inside one `leave.approve` or `payrollRun.finalize`
  request, none of them batched.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**DBQ-02** (`services/api/src/modules/notifications/notifications.service.ts`):

`notifications.service.ts:645-751` — nested loop, rules outer, recipients
  inner:
  ```ts
  for (const rule of rules) {
    const recipientUserIds = await this.resolveRecipients({...});   // 1 query
    ...
    const template = await this.notificationsRepository.findNotificationTemplate({...});  // 1 query
    ...
    for (const recipientUserId of recipientUserIds) {
      const existing = await this.notificationsRepository.findActiveNotificationByDedupeKey({...});  // 1 query
      if (existing) continue;
      ...
      created.push(await this.notificationsRepository.createTrackedNotification({...}));  // 1 query
    }
  }
  ```
  The recipient set is not bounded — `resolveRoleRecipients`
  (`notifications.service.ts:1195-1220`) runs:
  ```ts
  const users = await this.prisma.user.findMany({
    where: { tenantId: input.tenantId, userRoles: { some: { role: { tenantId: input.tenantId, ...roleWhere } } } },
    select: { id: true },
  });
  ```
  with no `take`, and is reached whenever a rule's `recipientResolverType` is
  `HR_ROLE`, `MANAGER_ROLE` or `CUSTOM_ROLE` — i.e. exactly the rules that
  target "all HR admins" or "all managers of X", which is where recipient
  counts are largest.

---


Full finding text: DBQ-02 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/DBQ.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Every business event with a role-based notification rule pays a
  request-latency cost linear in tenant headcount for that role, and the
  connection stays checked out (RES-01's pool) for the whole sequence. This is
  the database-query half of RES-06 (the synchronous SMTP half); together they
  mean a single leave approval, on a tenant with a normal-sized HR team, can
  hold one of the API's 10 pooled connections for the sum of ~80+ round trips
  plus however many of those recipients also get a synchronous email (RES-06).

## Affected Areas

services/api/src/modules/notifications

## Proposed Resolution

In `notifications.service.ts:645-751`: (1) batch-check
  dedupe keys with one `findMany` per rule instead of N `findFirst` calls; (2)
  batch-insert with `createMany` (accepting that `createMany` cannot return the
  created rows, so callers needing them re-`findMany` once); (3) cap
  `resolveRoleRecipients` or paginate it for very large role assignments.

(Difficulty: MEDIUM; Regression risk: LOW — the dedupe semantics are unchanged, only batched.; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/notifications/notifications.service.ts` (audit id DBQ-02).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: DBQ-02=LOW — the dedupe semantics are unchanged, only batched.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `DBQ-02` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/DBQ.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (DBQ-02) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[notifications]]

<!-- GRAPH:END -->
