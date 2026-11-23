---
ID: BUG-3175
aliases: [BUG-3175]
Title: Nine platform-admin runtime modules fetch entire tables into Node memory and paginate/sort/search with JavaScript instead of the database
Status: FIXED
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-729
RelatedBacklogItem: ITEM-0243
RelatedDecision:
RelatedImplementation: 2088ec4f
CreatedAt: 2026-09-10
UpdatedAt: 2026-11-24
ResolvedAt: 2026-11-24
---

# BUG-3175 — Nine platform-admin runtime modules fetch entire tables into Node memory and paginate/sort/search with JavaScript instead of the database

> **Architect triage, 2026-09-11 — `FIX_NOW`.** Nine admin modules pulling entire tables into Node memory is a missing server-side page, module by module, with no shared design needed.

## Summary

Nine platform-admin runtime modules fetch entire tables into Node memory and paginate/sort/search with JavaScript instead of the database

Identified by the 2026-09-10 full technical audit as FE-05 (confidence: FE-05=CONFIRMED).

## Expected Behavior

Match the `customers` implementation: push search/sort/filter into the Prisma query with `where`/`orderBy`/`skip`/`take`, and use `count()` for the total.

## Actual Behavior

Every keystroke-debounced search, sort, or page change on the admin Tenants screen (and the eight sibling modules) triggers a full-table Prisma `findMany` with nested `include`s, followed by an O(n) `JSON.stringify` scan for search and an O(n log n) in-memory sort, discarding all but one page of results. This is invisible from the frontend (the client still receives a correctly-paginated page), which is why it wasn't caught by a client-side pagination review — it only surfaces by tracing the request to its backing service, which is what this task asked for.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**FE-05** (`services/api/src/modules/platform-runtime/platform-runtime.service.ts`, `services/api/src/modules/super-admin/super-admin.service.ts`, `services/api/src/modules/tenants/tenants.repository.ts` — driving `apps/admin/app/(internal)/tenants/page.tsx` and eight sibling admin list screens):

`services/api/src/modules/platform-runtime/platform-runtime.service.ts:271-281` — `case 'tenants': return paginateRuntimeRecords(await this.superAdmin.listTenants(), page, pageSize, query.search, ...)`.
  `services/api/src/modules/tenants/tenants.repository.ts:136-138` — `db.tenant.findMany({ orderBy: { createdAt: 'desc' }, include: { customerAccount: true, tenantBranding: true, tenantDomains: true, ownerUser: {...} } })` — **no `skip`/`take`**, full table with nested relations fetched every call.
  `services/api/src/modules/platform-runtime/platform-runtime.service.ts:1483-1560` — `paginateRuntimeRecords` does `JSON.stringify(item).toLowerCase().includes(needle)` for search (line ~1504-1508), `[...filtered].sort(...)` (line ~1540-1550), and `filtered.slice((page-1)*pageSize, page*pageSize)` (line ~1553) — entirely in application memory, on the full result set, on every list/search/sort/page-change request.
  The same un-paginated-source-into-`paginateRuntimeRecords` pattern backs `subscriptions`, `plans`, `invoices`, `payments`, `partner-inquiries`, `partner-onboarding`, `commissions`, and `contract-templates` (call sites at `platform-runtime.service.ts:145,206,244,260,272,283,294,305,316`); confirmed at the service layer for `subscriptions` (`super-admin.service.ts:~3094-3103`, no `skip`/`take`) and `invoices` (`~3115-3130+`, no `skip`/`take`) in addition to `tenants`.
  By contrast, `case 'customers'` (`platform-runtime.service.ts:156-170` → `PlatformLifecycleService.listCustomers`, `super-admin/platform-lifecycle.service.ts:417-511`) does this correctly: a real Prisma `where` clause including a `search`-driven `OR` (lines 434-457) and genuine `skip`/`take`/`count` (lines 468,507-510).

---


Full finding text: FE-05 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

At the tenant counts this platform is designed to support (this is DijiPeople's own operator console, but its intended ceiling is "many tenants"), every list interaction on nine admin screens does a full-table read with joins, then discards all but ≤100 rows — a direct, compounding load on the same production database ORCH-04 already shows is under per-request pressure. This is a genuine scaling cliff, not a cosmetic issue.

## Affected Areas

apps/admin

## Proposed Resolution

Rewrite `listTenants` (and the eight sibling list methods feeding `paginateRuntimeRecords`) to accept `search`/`sort`/`filter`/`page`/`pageSize` and build a Prisma `where`/`orderBy`/`skip`/`take` query plus a `count()`, following the `listCustomers` pattern already in the codebase at `platform-lifecycle.service.ts:417-511`.

(Difficulty: HIGH (nine call sites, each with module-specific filter/sort field mapping); Regression risk: MEDIUM; Fix now: LATER — needs an ExecPlan; flag to the DB/backend specialist as this is API-layer code, found via this task's required screen trace (platform admin tenant list).)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/platform-runtime/platform-runtime.service.ts`, `services/api/src/modules/super-admin/super-admin.service.ts`, `services/api/src/modules/tenants/tenants.repository.ts` — driving `apps/admin/app/(internal)/tenants/page.tsx` and eight sibling admin list screens (audit id FE-05).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: FE-05=MEDIUM. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `FE-05` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md`

## Resolution

Commit 2088ec4f. `services/api/src/modules/platform-runtime/runtime-db-query.ts` turns a list request (search text, view tab, filters, sort, page) into a Prisma `where`, `orderBy`, `skip` and `take`, with `count()` for the total, following `PlatformLifecycleService.listCustomers`. The nine platform-admin lists use it instead of fetching the whole table and slicing in Node. `runtime-db-query.spec.ts` asserts the generated arguments.

Residuals, stated honestly:

- The specs are mocked: they prove Prisma arguments, not SQL results, and there is no DB-backed e2e.
- ILIKE over the listed columns is not index-assisted.
- Search now covers only the documented columns per module; it used to scan the whole record as JSON.
- An unsupported filter (numeric, date equality, invalid enum value) falls back to the old whole-table path for that request.
- The `my-records` view now filters on `createdById`.

The DB-backed e2e and removal of the fallback are tracked as ITEM-0243.

## QA Retest

Not yet retested.

## History

- 2026-11-24 - fixed at 2088ec4f (REG-729, QA-PLATFORM-072); follow-up ITEM-0243.
- 2026-09-10 — created from the 2026-09-10 full technical audit (FE-05) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0243]]
- Modules — [[platform-admin]]
- Regression — REG-729 (see the regression register)

<!-- GRAPH:END -->
