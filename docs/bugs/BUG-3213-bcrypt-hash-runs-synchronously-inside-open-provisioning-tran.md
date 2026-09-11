---
ID: BUG-3213
aliases: [BUG-3213]
Title: bcrypt.hash runs synchronously inside open provisioning transactions, adding to the same 5-second budget as RES-09
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 4c86a29b
AffectedModules: [services/api/src/modules/tenants]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3213 — bcrypt.hash runs synchronously inside open provisioning transactions, adding to the same 5-second budget as RES-09

> **Architect triage, 2026-09-11 — `DEFER`.** Real and recorded, below the line for this cycle. Revisit at the next backlog review — the evidence is in the record, so nothing is lost by scheduling it later.

## Summary

bcrypt.hash runs synchronously inside open provisioning transactions, adding to the same 5-second budget as RES-09

Identified by the 2026-09-10 full technical audit as DBQ-05 (confidence: DBQ-05=CONFIRMED for the call sites; LIKELY for the exact millisecond
  cost of cost-factor-12 bcrypt on the production instance's CPU, which was not
  measured live).

## Expected Behavior

Compute the hash before opening the transaction (it
  depends on no data read inside the transaction in any of the three call
  sites — `placeholderPasswordHash` at `platform-onboarding.service.ts:241`
  uses only `tenant.id`, which the transaction has already created by that
  point, so this specific one needs a small reorder; the other two depend on
  nothing from inside the transaction at all and can move out unconditionally).

## Actual Behavior

bcrypt is deliberately slow (that is its security
  property); at cost factor 12 it is commonly 100–300 ms of pure synchronous
  CPU on Node's single thread. Run inside an open interactive transaction, that
  time (a) counts against the same 5-second default timeout as every other
  awaited step in the transaction (RES-09), and (b) — per RES-11's finding that
  synchronous CPU work blocks the whole event loop — freezes every other
  concurrent request on the single instance for that duration while a database
  connection sits idle-but-claimed.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**DBQ-05** (`services/api/src/modules/super-admin/platform-onboarding.service.ts`,
  `services/api/src/modules/tenant-control-plane/tenant-access.service.ts`,
  `services/api/src/modules/tenants/tenants.service.ts`):

`platform-onboarding.service.ts:201` opens the transaction RES-09 already
  names (`provisionTenantForCustomer`'s `$transaction`, no explicit timeout);
  inside it, `:241-243`:
  ```ts
  const placeholderPasswordHash = await bcrypt.hash(
    `onboarding-${tenant.id}-${Date.now()}`,
    12,
  );
  ```
  The same shape recurs at `tenant-access.service.ts:211`
  (`await bcrypt.hash(unguessableSecret(), 12)`, inside the `$transaction`
  traced at `tenant-access.service.ts:204-273`) and
  `tenants.service.ts:223` (`await bcrypt.hash(dto.password, 12)`, inside the
  `$transaction` at `tenants.service.ts:134-296`).

---


Full finding text: DBQ-05 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/DBQ.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

A few hundred milliseconds added to transactions already at risk of
  the 5-second cliff (RES-09) and to the API's single-threaded responsiveness
  for every other tenant's concurrent request (RES-11's freeze mechanism)
  during exactly the moment a new customer is signing up.

## Affected Areas

services/api/src/modules/tenants

## Proposed Resolution

Hoist `bcrypt.hash(...)` outside the `$transaction` callback
  wherever it does not read data the transaction itself produced;
  `tenant-access.service.ts:211` and `tenants.service.ts:223` can move
  unconditionally, `platform-onboarding.service.ts:241` needs the tenant id
  computed first (already available before the hash is needed) or the
  placeholder string reworked to not depend on it.

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/super-admin/platform-onboarding.service.ts`,
  `services/api/src/modules/tenant-control-plane/tenant-access.service.ts`,
  `services/api/src/modules/tenants/tenants.service.ts` (audit id DBQ-05).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: DBQ-05=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `DBQ-05` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/DBQ.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (DBQ-05) at `4c86a29b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-control-plane]]

<!-- GRAPH:END -->
