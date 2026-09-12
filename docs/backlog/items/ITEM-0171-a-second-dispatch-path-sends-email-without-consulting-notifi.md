---
ID: ITEM-0171
aliases: [ITEM-0171]
Title: A second dispatch path sends email without consulting NotificationRule
Type: ARCHITECTURE
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [notifications, payroll, payslips, auth, reporting]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
RelatedBug: BUG-3375
RelatedQA: QA-SETTINGS-018
RelatedADR: ADR-0011
RelatedImplementation: EXECPLAN-0042
TargetMilestone: 
BlockedBy: 
---

# ITEM-0171 — A second dispatch path sends email without consulting NotificationRule

## Summary

There are two ways to send a tenant notification in this codebase, and they
obey different rules. One goes through `NotificationsService.emit()`, which
consults `NotificationRule` and will produce nothing if no rule matches. The
other calls `NotificationOrchestratorService.dispatch()` or
`EmailService.sendTemplateEmail()` directly and sends regardless.

Leave, attendance, claims, loans and timesheets use the first. Payroll,
payslips, scheduled reports and both authentication emails use the second.

`AGENTS.md` states that the `notifications` module is the only route for tenant
notification and email, and both paths are inside that module, so neither
violates the letter of the rule. What is undocumented, and what matters, is that
only one of them can be switched off.

## Why It Matters

An administrator looking at notification configuration reasonably believes it
governs notifications. For roughly half the product it does not. Disabling an
event that travels the direct path changes nothing, and there is no indication
on any screen which path an event uses.

This also makes [[BUG-3375]] harder to fix correctly. Giving `NotificationRule`
a proper administration screen would be actively misleading while a second path
ignores it — the screen would promise control it does not have.

`AGENTS.md` principle 4 is the applicable rule: there should be one home for
the answer to "will this event notify anyone".

## Evidence

**Rule-gated path.** `NotificationsService.emit()`
(`services/api/src/modules/notifications/notifications.service.ts:612-658`)
reads rules through `notifications.repository.ts:868` (`listEnabledRules`) and
produces nothing when no rule matches. Used by leave, attendance, claims, loans
and timesheets.

**Ungated path.** Direct calls to `NotificationOrchestratorService.dispatch()`
and `EmailService.sendTemplateEmail()` from:

- `payroll-operations.service.ts` and `payroll-journal.service.ts`
- `payslips.service.ts:101`
- `report-scheduler.worker.ts:100`
- `user-invitations.service.ts:440`, `auth.service.ts:854` and `:1034`

None of these consults `NotificationRule`.

**No raw mailer bypass exists.** Searched the domain services for direct SMTP,
nodemailer and other transport usage outside the notifications module and found
none, so the `AGENTS.md` contract on routing is intact. The divergence is
entirely inside the module.

**Supporting observation.** `NotificationRule` has no API surface at all; it can
only be written by seed script. That is recorded as [[BUG-3375]] and is why the
inconsistency has gone unnoticed — nobody can exercise the gate.

## Proposed Approach

Needs an ExecPlan under `PLANS.md`, and it should be the same plan as
[[BUG-3375]]. The two records are the same decision seen from different ends:
one asks which model owns the gate, the other observes that half the code does
not ask.

Direction:

1. Decide whether every tenant notification must pass the rule gate. Some
   arguably must not — an account activation or password reset is
   transactional, and a tenant administrator switching it off would lock people
   out. If so, say so explicitly and give those events a category that is
   visibly not configurable, rather than leaving them silently ungated.
2. Route everything else through the gated path.
3. Make the distinction visible in the catalog, so an administrator can see
   which events they can actually control.
4. Document the two paths, or the single surviving one, in
   `services/api/AGENTS.md`, which currently describes only the general
   catalog-to-processor route and not this fork.

## Acceptance Criteria

- Every tenant notification either passes the `NotificationRule` gate or is
  categorised as transactional and not configurable, by explicit decision.
- No event is ungated by accident.
- The catalog shows which events an administrator can control.
- `services/api/AGENTS.md` describes the dispatch paths as they actually are.

## Dependencies

Plan jointly with [[BUG-3375]]. [[ITEM-0170]] should follow both, so new events
are added to a settled mechanism.

## Related Items

[[BUG-3375]] the rules screen and the model with no API. [[ITEM-0169]] catalog
hygiene. [[ITEM-0170]] modules that emit nothing. [[BUG-3200]] the synchronous
queue underneath both paths.

## History

- 2026-09-11 — created at `cbd9b812` while tracing notification coverage; the
  two dispatch paths were found by following trigger call sites, and the absence
  of any raw mailer bypass was confirmed at the same time.
- 2026-09-12 — resolved in SESSION-0103, jointly with BUG-3375, per ADR-0011.
  `EmailExecutionService.execute()` — the single choke point every email send
  passes through, gated path or not — now consults `NotificationRule`
  (matched by `eventKey === eventCode`) alongside the pre-existing
  `NotificationPreference` check, closing the fork without changing any of
  the six caller sites named in this record's Evidence. `AUTH_ACCOUNT_ACTIVATION`
  and `AUTH_PASSWORD_RESET` are explicitly excluded from both gates via a new
  `configurable: false` catalog field (TypeScript-only, no schema change) and
  reported as `ruleStatus: ALWAYS_ON` on the new `/notifications/rules`
  screen — satisfying this item's "say so explicitly and give those events a
  category that is visibly not configurable" direction. `services/api/AGENTS.md`
  now documents both dispatch paths and the merged gate.

  One thing this resolution does **not** do: `claims`, `loans` and
  `timesheets` call `NotificationsService.emit()` with `eventKey`s that have
  **no** seeded `NotificationRule` row at all (`DEFAULT_NOTIFICATION_RULES` in
  `seed-config.ts` covers only `leave`, `attendance` and `employee`), so
  `emit()` silently produces zero in-app notifications for those three
  modules today — a real gap, but a different, larger one (new resolver
  branches in `notifications.service.ts`, new seeded rules and templates)
  than this item's scope. It is now visible for the first time via
  `ruleStatus: NOT_CONFIGURED` on the new screen, which is this item's actual
  acceptance bar ("the catalog shows which events an administrator can
  control"), and is recorded in ADR-0011's Consequences rather than folded
  into this fix.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3375]]
- Modules — [[notifications]], [[payroll]], [[auth]], [[reporting]]

<!-- GRAPH:END -->
