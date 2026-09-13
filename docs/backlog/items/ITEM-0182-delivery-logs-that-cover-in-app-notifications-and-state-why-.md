---
ID: ITEM-0182
aliases: [ITEM-0182]
Title: Delivery logs that cover in-app notifications and state why a message was not delivered
Type: UX
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web, notifications]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
RelatedBug: BUG-3379
RelatedQA: [QA-SETTINGS-032]
RelatedADR: 
RelatedImplementation: [docs/plans/EXECPLAN-0050-production-retires-sink-email-providers-and-honest-delivery-logs.md, services/api/src/modules/notifications/notifications.repository.ts, apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts, apps/web/app/(authenticated)/settings/_components/settings-runtime-pages.tsx, apps/web/app/components/runtime/standard-module-list-page.tsx]
TargetMilestone: 
BlockedBy: 
---

# ITEM-0182 — Delivery logs that cover in-app notifications and state why a message was not delivered

## Summary

The tenant delivery log screen covers only email:
- In-app notifications have no log at all.
- A row that was not delivered shows no column saying why.
- Every row has a selection checkbox, but no bulk action exists.
- One screen goes by three different names.

This item makes the log the one place an administrator can answer "did this
notification reach the person, and if not, why".

## Why It Matters

- **Silent failures stay silent.** When a notification does not arrive, the administrator's first stop is this screen. Today it cannot show in-app notifications and does not say why an email was not delivered.
- **The gap is already real.** The demo tenant's rows from 2026-09-09 read NOT_DELIVERED with providerType CONSOLE ([[BUG-3379]], [[BUG-3501]]).
- **Checkboxes mislead.** Selection with nothing to do suggests missing functionality.
- **Three names cost trust.** A screen called "Email Delivery Logs", "Email Logs" and "Delivery Logs" makes an administrator wonder whether these are different screens.

## Evidence

Browser QA on the live demo tenant (`https://dijipeople-demo.ws.dijipeople.com`,
signed in as the workspace owner) at `df0f84f1`. Code references are at the
worktree HEAD.

- **Email only.** The logs screen is the settings adapter `notification-email-logs` in `apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts:6627-6632`. It reads `serverApiPath: "/notifications/email-delivery-logs"`, an email-only source, and no in-app notification log view exists in settings.
- **No reason column.** Not-delivered rows carry no visible failure or non-delivery reason ([[BUG-3379]] covers the NOT_DELIVERED reason itself).
- **Checkboxes without an action.** Every row has a checkbox, and no bulk action is offered.
- **Three names:**
  - settings navigation label "Email Delivery Logs" (`apps/web/app/(authenticated)/settings/_lib/settings-navigation.ts:529`);
  - short label "Email Logs" (line 530);
  - page title "Delivery Logs" (`settings-adapter-registry.ts:6629`).
- **The same split elsewhere.** On the Notifications settings landing, the card reads "Notifications" while the page it opens is titled "Rules".
- **Near-duplicate rows.** The log shows 13 identical scheduled-report rows.

## Proposed Approach

No ExecPlan needed, unless an in-app delivery log requires new persistence. If
it does, that part needs a plan under `PLANS.md`.

- Give the screen one name, used identically by the settings card, navigation and page title. Apply the same rule to the Notifications card and its Rules page.
- Add a reason column showing why a row failed or was not delivered, fed by the reason [[BUG-3379]] establishes.
- Add an in-app notification log view alongside the email log, on the same screen, filterable by channel.
- Remove the row selection checkboxes unless a bulk action is delivered with them. A retry action is [[ITEM-0168]].

## Acceptance Criteria

- The delivery log screen has exactly one name across the settings card, settings navigation and page title.
- The Notifications card and the page it opens share one name.
- Every FAILED or NOT_DELIVERED row shows a non-empty reason in its own column.
- An administrator can see in-app notification deliveries for the tenant, not only email.
- Rows have no selection checkboxes, or selecting rows enables at least one working bulk action.

## Dependencies

- [[BUG-3379]] supplies the NOT_DELIVERED reason that the column displays.
- [[ITEM-0168]] is the retry action. It is the only candidate bulk action, and this item does not wait on it.

## Related Items

- [[BUG-3379]]: the not-delivered reason.
- [[ITEM-0168]]: retry from a delivery log.
- [[BUG-3501]]: the provider screen and CONSOLE sink.
- [[BUG-3500]]: placeholder templates.
- [[ITEM-0180]]: one plain notification events page.
- [[ITEM-0171]]: the second dispatch path.

## Resolution

Done in TASK-0031 WP-06 (commit 11e987a6 on `agent/walkthrough2-providers-logs`,
merged into `agent/walkthrough2-integration`; plan EXECPLAN-0050). Browser
verification pending in WP-07/WP-08 (QA-SETTINGS-032).

- **Reason column.** Added beside Status in the email log
  (`settings-adapter-registry.ts`); the NOT_DELIVERED reason now names the "Email
  Providers" screen.
- **In-app channel.** `GET /notifications/in-app-delivery-logs?search&page&pageSize`
  with the same two permission decorators as the email log, `where.tenantId`
  from the session, an explicit select (title, event code, recipient name and
  email, status, delivered, read and created times; no body, payload or
  metadata) and a DTO that accepts exactly what the settings list sends. The web
  adds a read-only `notification-in-app-logs` adapter with record navigation off,
  and a shared `SegmentedControl` Channel switch (Email / In-app) that sets
  `?channel=in-app` on the same URL and keeps it through paging.
- **Checkboxes.** Removed from both log channels through a new additive
  `enableSelection` prop on `StandardModuleListPage` (default `true`).
- **Names.** "Delivery Logs" in navigation, settings group, adapter and page
  title; the Notifications card reads "Notification Rules", matching its page.
- No schema change.

Residuals: the in-app list has no status filter in the UI, only paging (search is
available through the API); the 13 identical scheduled-report rows on the demo
tenant are real sends, not a display fault, and were not deduplicated.

Regression coverage: REG-519.

## QA Retest

**PASS.** Browser-verified in the local QA run
(`docs/qa/runs/2026-09-13-task-0031-demo-walkthrough-2-local-browser-qa-e253306.md`,
scenario S19) on a throwaway database. On production after release PR #80
(merge commit e253306a, deployed 2026-09-13): Delivery Logs renders with the
Email / In-app channel switch. CI runs 34732185363, 34732682935 and 34732697734
passed on f865ac5e (the merged tree).

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — done in TASK-0031 WP-06; unit-tested; browser verification pending.
- 2026-09-13 — QA retest: PASS — local browser QA run and production verification at e253306a.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3379]]
- Modules — [[tenant-application]], [[notifications]]
- Implementation — [[EXECPLAN-0050-production-retires-sink-email-providers-and-honest-delivery-logs]]

<!-- GRAPH:END -->
