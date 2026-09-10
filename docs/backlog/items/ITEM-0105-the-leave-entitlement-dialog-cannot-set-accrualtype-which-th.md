---
ID: ITEM-0105
aliases: [ITEM-0105]
Title: The leave entitlement dialog cannot set accrualType, which the API requires
Type: UX
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web, services/api/src/modules/leave]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: DONE
CreatedAt: 2026-08-29
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
RelatedBug: BUG-1967
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0105 — The leave entitlement dialog cannot set accrualType, which the API requires

## Summary

`POST /api/leave-policies/:id/rules` rejects a body without `accrualType`
("must be one of FIXED_ANNUAL, MONTHLY_ACCRUAL, PER_PAY_PERIOD, PER_WORKED_HOUR,
NONE"), yet the "New Entitlements" dialog exposes only `leaveTypeId`,
`entitlementDays`, `minimumServiceDays`, `prorateOnJoining`, `prorateOnExit`,
`negativeBalanceAllowed` and `maximumNegativeBalance`. The save from that dialog
still succeeds, so the form is sending a value for `accrualType` that the user
cannot see or choose.

Filed as an item rather than a bug because the open question is intent: if the
"Accrual Rules" tab is the intended place to set accrual, this is a
discoverability problem with a hidden default; if it is not, a required domain
field has no control at all. That was not established during the run.

## Why It Matters

The accrual type decides how entitlement is meant to become balance. A user
creating an entitlement of 20 days has no way to know from that dialog whether
they have configured an annual grant or a monthly accrual, and the record is
created either way. Whatever the answer, someone will later be surprised by a
value they never chose.

The cost of not doing it is a support conversation per tenant that configures
leave, and a configuration whose meaning cannot be read off the screen that
created it.

## Evidence

Observed 2026-08-29 on `https://dijipeople-demo.ws.dijipeople.com`, tenant
`DijiPeople Demo`, production API commit `949f461c`:

- The "New Entitlements" dialog on a leave policy record offers exactly the seven
  fields listed above.
- A direct `POST /api/leave-policies/:id/rules` without `accrualType` is rejected
  with the enum message quoted above.
- The dialog's own save returns 201, so a value is being supplied.

Not checked: what value the dialog sends, and whether the "Accrual Rules" tab on
the same record is the intended place to set it.

## Proposed Approach

Read the dialog's payload and the "Accrual Rules" tab, then decide. If accrual
belongs on the other tab, the entitlement dialog should say which accrual type
the rule will be created with, rather than leaving it invisible. If it does not,
the field belongs in the dialog.

No ExecPlan required.

## Acceptance Criteria

- The accrual type applied to a rule created from the entitlement dialog is
  visible to the user who creates it.
- Where accrual is configured is documented, on the screen or in the settings
  documentation.

## Dependencies

Related to, but not blocked by, BUG-1967 — accrual configuration is stored today
and never executed, so this control's value has no behavioural effect until that
record is resolved.

## Related Items

BUG-1967 (leave entitlement is never allocated to a balance) is the reason
`accrualType` currently changes nothing. BUG-1961, BUG-1962, BUG-1963 and BUG-1964
were found in the same set of dialogs.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`, as an open question about intent rather than a confirmed defect.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — fold into the BUG-1967 accrual work.
- 2026-09-11 — resolved. See Resolution below.

## Resolution

Premise confirmed at the current commit: the "Entitlements" tab's quick-create
dialog (`apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts`,
`leave-policies` adapter, `entitlements` related tab) declared seven fields and
omitted `accrualType`, which `CreateLeavePolicyRuleDto` requires
(`services/api/src/modules/leave/dto/create-leave-policy-rule.dto.ts:66-67`,
`@IsEnum` with no `@IsOptional`). The dialog's save still succeeded because
`withRelatedRecordDefaults("leave_policy_rules", …)` in
`apps/web/lib/runtime/modules/standard-module-data.adapter.ts:1221-1245` silently
substituted `"FIXED_ANNUAL"` for a submission that omitted the field — confirming
the record's "hidden default" reading over the "belongs on the other tab"
reading, since even the separate "Accrual Rules" tab's dialog does not force a
choice either (its `accrualType` quick-create field also carries no
`required: true`).

**Fix:** `accrualType` is now declared in the Entitlements tab's `columns` (so
the applied value is visible in the list after creation) and `quickCreateFields`
(so it is visible and selectable in the dialog that creates the record), using
the same field configuration already used on the Accrual Rules tab so the two
tabs cannot disagree about the option set. The silent default in
`withRelatedRecordDefaults` is left in place as a defensive fallback — the
comment at its call site now explains why — rather than removed, since the
Accrual Rules tab's own dialog can still submit the field blank.

**Where accrual is configured** is now self-documenting on screen: the field
reads "Accrual Type" in both dialogs that write the same underlying
`leave_policy_rules` record, with an inline code comment at the Entitlements
tab's declaration explaining the relationship for the next reader.

Not in scope: BUG-1967 (accrual configuration is stored but never executed) is
unaffected — this only makes the stored value visible and chosen, not
effective. Whether `accrualType` should be `required: true` in either dialog,
given the DTO treats it as mandatory, was left as-is (pre-existing on the
Accrual Rules tab) rather than introduced as a new requirement on this tab,
since AGENTS.md scopes tasks to the reported defect rather than opportunistic
tightening.

**Tests:** `apps/web/lib/runtime/leave-entitlement-accrual-type.spec.ts` (new)
asserts the Entitlements tab declares `accrualType`, that the quick-create form
built from that declaration exposes the same five options the API's enum
accepts, and that both tabs agree on the field's data type.
`npm --workspace web run test -- leave-entitlement-accrual-type` — 4 passed.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-1967]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
