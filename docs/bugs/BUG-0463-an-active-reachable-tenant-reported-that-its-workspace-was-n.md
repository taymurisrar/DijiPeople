---
ID: BUG-0463
aliases: [BUG-0463]
Title: An active reachable tenant reported that its workspace was not provisioned
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: STATE_MACHINE
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: 3883798
AffectedModules: [services/api/src/modules/tenant-control-plane, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-194
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/tenant-repair-and-console-ux
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0463 — An active reachable tenant reported that its workspace was not provisioned

## Summary

A tenant that is ACTIVE, reachable and signed into reported "Workspace: Not
provisioned", "Primary tenant owner: Unassigned", a status reason of
"Provisioning" beside an "Active" badge, and no recorded provisioning run. Four
true statements that together answered nothing, and the one available action —
Retry provisioning — refused, accurately, because the tenant was not being
provisioned.

## Expected Behavior

The record says what is actually missing from the workspace and offers a way to
fix what can be fixed from the console.

## Actual Behavior

Every panel described *provisioning runs*. This tenant has none — it predates
run recording, or its rows were never written — so each panel correctly reported
nothing, and the reader was left to infer the state of the workspace from four
unrelated fields on the header.

Reported as: "Doesn't show anything. Fix this record. I can even access this
tenant then why it shows that it is not provisioned?"

## Reproduction

1. Open a tenant that is ACTIVE with no `TenantDomain` row and no
   `TenantProvisioningRun` rows.
2. Operations shows "No provisioning run has been recorded", Retry disabled.
3. The header shows Active, "Provisioning", and Workspace not provisioned.

## Evidence

- `apps/admin/app/_components/tenants/tenant-operations-panel.tsx` — every
  section keyed on `provisioningRuns`.
- `services/api/src/modules/tenant-control-plane/tenant-operations.service.ts` —
  `retryBlockedReason` refuses unless the tenant status is in
  `TENANT_RETRYABLE_STATUSES`, which excludes ACTIVE.
- `apps/admin/app/_components/tenants/tenant-domains-panel.tsx` — told the
  operator to "Retry provisioning from Operations", which cannot work for an
  active tenant.
- [[BUG-0312]] — why the hostname is missing in the first place: provisioning
  issues none when no tenant base domain is configured, silently.

## Root Cause

**Health was read off the record of the attempt rather than off the thing
itself.** A provisioning run is evidence that a build happened; a workspace can
be entirely usable with no run rows, and can be missing a hostname with a
perfectly successful run behind it. Deriving one from the other means every
tenant outside the happy path becomes unexplainable.

The retry gate then made it unrecoverable rather than merely unclear: the one
control that could issue a hostname is bound to a lifecycle state that a working
tenant has already left.

Third, `subStatus` is a sentence a human reads under the lifecycle badge and
nothing clears it when the lifecycle moves on — so the record contradicted
itself indefinitely.

## Impact

Any tenant provisioned before run recording, or whose hostname issuance failed
silently. The workspace is unreachable by name and no console action fixes it.

## Affected Areas

`services/api/src/modules/tenant-control-plane`, and the Operations and Domains
panels in `apps/admin`.

## Proposed Resolution

`deriveWorkspaceHealth` — a pure derivation over five facts about the tenant
(slug, status, sub-status, owner, hostname, business units, users) producing one
finding per deficiency, each carrying whether **this console** can repair it.

`POST :tenantId/operations/repair-workspace` — narrow and idempotent: it issues
a missing hostname and clears a sub-status that contradicts the lifecycle. It
does **not** create business units, owners, subscriptions or invoices. Those are
provisioning's to own, and quietly duplicating them here is how a repair becomes
an incident. Deliberately not folded into retry, so it is not gated on a
lifecycle state that a working tenant has left.

## Acceptance Criteria

- The record lists every deficiency at once, not the first one.
- Each says whether it is repairable here, and what to do when it is not.
- A missing hostname with a slug is repairable; without a slug it is not, and
  says to set the slug.
- A stale provisioning sub-status on an ACTIVE tenant is flagged and cleared.
- A missing business unit is reported as BUG-0015 and never claimed repairable.
- One failed repair does not abandon the others.

## Regression Coverage

REG-194 — `services/api/src/modules/tenant-control-plane/workspace-health.spec.ts`.

## Dependencies

[[BUG-0015]] stays open and is named on the finding: the step that creates a
business unit is not replayed, so a tenant that failed at or before it is
reported here and is not repairable here.

## Related Items

[[BUG-0312]], [[BUG-0422]] — the missing hostname, and the previous round's
recovery work on runs rather than on workspaces.

## Resolution

Fixed on `agent/tenant-repair-and-console-ux`.

## QA Retest

Unit-verified over the derivation. The repair itself was not run against a live
tenant.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-194 names `services/api/src/modules/tenant-control-plane/workspace-health.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, services/api   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-22 — reported with a screenshot of tenant TEN-000004, Xoul Ltd.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-control-plane]], [[platform-admin]]
- Regression — REG-194 (see the regression register)

<!-- GRAPH:END -->
