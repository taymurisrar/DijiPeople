---
ID: BUG-3175
aliases: [BUG-3175]
Title: Nine platform-admin runtime modules fetch entire tables into Node memory and paginate/sort/search with JavaScript instead of the database
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [apps/admin]
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

# BUG-3175 — Nine platform-admin runtime modules fetch entire tables into Node memory and paginate/sort/search with JavaScript instead of the database

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

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (FE-05) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]

<!-- GRAPH:END -->
