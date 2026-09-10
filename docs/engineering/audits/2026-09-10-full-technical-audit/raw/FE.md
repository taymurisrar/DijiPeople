# FE — Frontend Architecture and Performance

> Scope: `apps/web` (259 pages), `apps/admin` (88 pages), `apps/landing` (14 pages).
> Cross-references ORCH-04 (~26 DB round trips per authenticated request server-side)
> and CACHE-11 (`/tenant-settings/resolved` duplicate fetch, AbortSignal defeats Next
> fetch dedup) rather than restating their evidence. Findings here extend both: FE-02
> and FE-03 show the duplicate-fetch and re-execution mechanisms CACHE-11 documented
> for one endpoint are systemic across roughly twenty page components and two other
> endpoints, and are the true multiplier on ORCH-04's per-request cost.

---

### FE-01 — No cross-tenant or cross-user caching exists at the Next.js layer (definitive check)

- **Category:** Performance / Tenant Isolation
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW (a clean-bill-of-health finding, recorded because the briefing required a definitive check)
- **Component:** `apps/web/lib/server-api.ts`, `apps/admin/lib/server-api.ts`, `apps/landing/lib/legal-server.ts`, `apps/landing/lib/commercial-config.ts`
- **Evidence:**
  `apps/web/lib/server-api.ts:139-140` — `signal: mergeAbortSignals(init.signal, controller.signal),` / `cache: init.cache ?? "no-store",` (verified directly, plus the retry path at `:156-157`).
  `apps/admin/lib/server-api.ts:50,68,298` — `cache: "no-store"` hardcoded (not overridable by caller `init`, more rigid than web).
  `apps/web/app/(authenticated)/layout.tsx` and `apps/web/app/layout.tsx` both call `await cookies()`/`await headers()` before any tenant-scoped fetch, which forces per-request dynamic rendering per Next.js's dynamic-API rule.
  Zero repo-wide hits for `unstable_cache`, bare `export const revalidate`, or `"force-cache"`/`'force-cache'` in `apps/web` or `apps/admin`.
  The only two `next: { revalidate: N }` fetches in `apps/web`/`apps/admin`/`apps/landing` combined are `apps/landing/lib/legal-server.ts:93,134` (published legal document text — no cookies, no tenant/session identifiers, ten known slugs pre-rendered via `generateStaticParams()` in `apps/landing/app/legal/[slug]/page.tsx:22-45`) and `apps/landing/lib/commercial-config.ts:118-131` (public market/pricing config, no auth/tenant/session data — keyed on CDN country headers, not identity).
- **Current behaviour:** Every authenticated fetch in `apps/web` and `apps/admin` is `cache: "no-store"` by construction, and every route that reads a cookie or the request's tenant hostname is forced into per-request dynamic rendering. There is no `generateStaticParams` anywhere under `apps/web` or `apps/admin`. The tenant-branded public login page (`apps/web/app/(public)/login/page.tsx`) resolves branding per-request via `headers()` and cannot be statically generated, so tenant A's branding cannot leak into a build-time page served to tenant B.
- **Expected behaviour:** No tenant- or user-specific response should ever be servable across tenants/users via the Next.js Data Cache or static generation. Confirmed as the actual behaviour.
- **Risk:** None identified. This is the healthy baseline the audit was asked to verify.
- **Remediation:** None required. Worth noting for future work: if a Next.js Data Cache is ever introduced for tenant-scoped data (e.g. to fix FE-02/FE-03 below), every cache key must include `tenantId`, matching CACHE-10's rule for the API-side cache. `apps/landing/lib/commercial-config.ts`'s 60s revalidate window keyed on forwarded country headers rather than URL was flagged by the caching specialist as an unverified, low-severity localization edge case (not tenant/identity data) — see CACHE.md.
- **Difficulty:** N/A
- **Regression risk:** N/A
- **Fix now:** NO

---

### FE-02 — The authenticated shell layout already fetches business-unit access and "current employee" context for every page, and ~20 individual pages redundantly re-fetch the identical data with no request deduplication

- **Category:** Performance
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/app/(authenticated)/layout.tsx`, `apps/web/app/(authenticated)/_lib/business-unit-access.ts`, `apps/web/app/(authenticated)/_lib/current-employee.ts`, and ~20 page components
- **Evidence:**
  `apps/web/app/(authenticated)/layout.tsx:122-158` — a single `Promise.all` that already fetches, for **every** authenticated page render: `/tenant-settings/features/availability`, `getCurrentEmployee()` (→ `/employees/me/context`), `getResolvedTenantSettings()` (→ `/tenant-settings/resolved`, wrapped in React `cache()`), `getBusinessUnitAccessSummary()` (→ `/organization-access/me`), `/timesheets/access-restriction`, and `/navigation/sidebar`.
  `apps/web/app/(authenticated)/_lib/business-unit-access.ts:21-25` — `export async function getBusinessUnitAccessSummary() { return apiRequestJson<BusinessUnitAccessSummary>("/organization-access/me")... }` — a plain function, **not** wrapped in React `cache()`.
  `apps/web/app/(authenticated)/_lib/current-employee.ts:9-11` — same: `getCurrentEmployee()` calls `apiRequestJson("/employees/me/context")` directly, also not `cache()`-wrapped.
  Because `apiRequestJson` merges an `AbortController` signal into every fetch (`apps/web/lib/server-api.ts:139`), Next's automatic per-render fetch-request memoization does not apply (this is the same mechanism CACHE-11 documented for `/tenant-settings/resolved`) — so every additional call site is a guaranteed second network round trip, not a deduped one.
  Page-level call sites of `getBusinessUnitAccessSummary()` found via `grep -rn "getBusinessUnitAccessSummary()" apps/web/app --include=*.tsx`: `attendance/page.tsx:44`, `attendance/team/page.tsx:40`, `customers/page.tsx:33`, `employees/new/page.tsx:26`, `employees/page.tsx:38`, `leaves/approvals/page.tsx:8`, `leaves/page.tsx:27`, `onboarding/page.tsx:21`, `projects/page.tsx:23`, `recruitment/applications/page.tsx:20`, `recruitment/candidates/new/page.tsx:24`, `recruitment/candidates/page.tsx:21`, `recruitment/jobs/new/page.tsx:24`, `recruitment/jobs/page.tsx:25`, `recruitment/page.tsx:57`, `recruitment/talent-pool/page.tsx:21`, `reports/page.tsx:37`, `timesheets/approvals/page.tsx:28`, `timesheets/page.tsx:37`, `users/page.tsx:34` — **20 page-level call sites**, all in addition to the layout's own call.
  Page-level call sites of `getCurrentEmployee()`: `attendance/page.tsx`, `employees/page.tsx`, `employees/[employeeId]/page.tsx`, `leaves/page.tsx`, `my-profile/page.tsx`, `timesheets/page.tsx` — **6 more call sites**, again on top of the layout's own call.
- **Current behaviour:** For any of these ~20+ pages, `/organization-access/me` and/or `/employees/me/context` are fetched **twice** in the same render — once in `(authenticated)/layout.tsx`'s `Promise.all`, once again in the page component — each a fresh HTTP round trip to the NestJS API that independently pays the full authentication/access-context chain ORCH-04 measured at ~26 DB round trips. `getResolvedTenantSettings` in the very same layout file (`layout.tsx:139`) already demonstrates the fix (`const getResolvedTenantSettings = cache(() => apiRequestJson(...))`, per CACHE-11) — the pattern exists in the codebase but was not applied to these two helpers.
- **Expected behaviour:** `getBusinessUnitAccessSummary` and `getCurrentEmployee` should be wrapped in React's `cache()` (as `getResolvedTenantSettings` already is), so the layout's call and any page's call collapse into a single request-scoped fetch.
- **Risk:** On the ~20 affected pages, every request pays roughly double the ORCH-04 auth tax just from this one duplication (on top of whatever else the page fetches) — a real, broad latency and database-load cost, worse in aggregate than the single-endpoint duplication CACHE-11 flagged because it recurs across two endpoints and twenty call sites rather than one.
- **Remediation:** Wrap `getBusinessUnitAccessSummary` (`apps/web/app/(authenticated)/_lib/business-unit-access.ts:21`) and `getCurrentEmployee` (`apps/web/app/(authenticated)/_lib/current-employee.ts:9`) in `cache()` from `react`, exactly as `getResolvedTenantSettings` already is at `apps/web/app/(authenticated)/layout.tsx:139`. No caller changes needed.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### FE-03 — Every pagination, sort, or filter click on a runtime-driven list page re-executes the page's entire server-side call fan-out, not just the list query

- **Category:** Performance
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/app/(authenticated)/employees/page.tsx`, `apps/web/app/components/data-table/data-table-pagination.tsx`, and any of the 61 runtime-driven pages using the same pagination pattern
- **Evidence:**
  `apps/web/app/components/data-table/data-table-pagination.tsx:90-127` — pagination controls render `<Link href={buildHref(...)}>`, and `apps/web/app/components/runtime/module-data-table.tsx` / `apps/web/app/components/data-table/data-table.tsx:299-364` drive sort and column-filter changes via `router.push`/`router.replace` with updated search params — genuine Next.js navigations, not client-side array operations.
  `apps/web/app/(authenticated)/employees/page.tsx:35-39,106-121` — on every render (i.e. every navigation triggered by the above), the page re-runs `Promise.all([getSessionUser(), getCurrentEmployee(), getBusinessUnitAccessSummary()])` and then a second `Promise.all([employees list, apiRequestJson("/tenant-settings/resolved"), getTableViews("employees")])` — six distinct backend calls, none cached (FE-02, CACHE-11), all re-issued for a page-2 click that only actually needed a new `/employees?page=2` response.
- **Current behaviour:** Because nothing in this render path is cached (FE-01/CACHE-11: `cache: "no-store"` throughout) and the pagination/sort/filter UI is implemented as full Next.js navigations to the same server component, changing the page number on the Employees list re-executes `getSessionUser`, `getCurrentEmployee`, `getBusinessUnitAccessSummary`, the tenant-settings fetch, and the table-views fetch — five calls that did not need to change — alongside the one that did.
- **Expected behaviour:** Data that does not vary with the pagination/sort/filter state (session, current-employee context, business-unit access, tenant settings, table views) should be memoized per request (FE-02) and, more importantly, should not need to be part of the RSC payload recomputed on every list interaction — e.g. by isolating the paginated table behind its own data fetch (client-side fetch to a route handler, or a nested Suspense boundary/parallel route) rather than making the whole page server component re-render on every URL change.
- **Risk:** Every click a user makes on a large employee/timesheet/attendance list multiplies backend load by the page's full fan-out (up to 6x on Employees) rather than the 1x the interaction actually requires — compounds directly with ORCH-04's per-request cost.
- **Remediation:** At minimum, apply FE-02's `cache()` fix so five of the six calls collapse to zero marginal cost on a same-render navigation. As a structural fix, consider moving the paginated table's data fetch to a client-side call against a dedicated route handler (or a streamed child Suspense boundary) so only the table itself re-fetches on page/sort/filter changes, leaving session/settings/access data untouched by the URL change.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM (changes the rendering strategy of the runtime list pattern used by 61 pages)
- **Fix now:** LATER — land FE-02 first (LOW risk, immediate partial relief), treat the structural fix as a follow-up plan.

---

### FE-04 — Independent backend calls are awaited sequentially instead of in parallel in at least two shared code paths

- **Category:** Performance
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/app/(authenticated)/attendance/page.tsx`, `apps/admin/app/_components/runtime/runtime-module-page.tsx`
- **Evidence:**
  `apps/web/app/(authenticated)/attendance/page.tsx:30-44`:
  ```
  const [sessionUser, resolvedSettings, attendanceContext] = await Promise.all([
    getSessionUser(),
    apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved").catch(() => null),
    apiRequestJson<AttendanceRuntimeContext>("/attendance/runtime-context").catch(() => null),
  ]);
  ...
  const businessUnitAccess = await getBusinessUnitAccessSummary();
  ```
  `businessUnitAccess` depends on none of the three values already resolved, yet is awaited only after they complete — a fully avoidable extra sequential hop.
  `apps/admin/app/_components/runtime/runtime-module-page.tsx:16-20`:
  ```
  const user = await requireSystemAdminUser(definition.routeBase);
  const preference = await apiRequestJson<PreferenceResponse>(
    `/platform-users/me/module-preferences?moduleKey=${encodeURIComponent(moduleKey)}`,
  ).catch(...);
  ```
  The preference fetch only needs `moduleKey` (a prop), not `user`; it is nonetheless awaited strictly after the auth call rather than run alongside it.
- **Current behaviour:** Both examples pay one full extra network round trip (each also paying the ~26-DB-round-trip auth tax per ORCH-04) that a `Promise.all` would eliminate.
- **Expected behaviour:** Independent requests should always be issued together via `Promise.all`, as is already done correctly elsewhere in the same files (e.g. `apps/web/app/(authenticated)/reports/page.tsx:35-37`, `apps/web/app/(authenticated)/employees/page.tsx:35-39`).
- **Risk:** Adds one avoidable round trip (and its ~26-round-trip auth cost) to every load of the Attendance list and every admin platform-runtime module page (Tenants, Customers, Subscriptions, etc. — all routed through `RuntimeModulePage`).
- **Remediation:** Move `getBusinessUnitAccessSummary()` into the existing `Promise.all` at `attendance/page.tsx:30`. Move the preference fetch into a `Promise.all` alongside `requireSystemAdminUser` in `runtime-module-page.tsx:17-20` (the preference fetch doesn't need `user`; only the render below it does).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### FE-05 — Nine platform-admin runtime modules fetch the entire table into Node memory and do search/sort/pagination with `JSON.stringify`/`Array.sort`/`Array.slice` on every request, rather than in the database

- **Category:** Performance / Schema
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/platform-runtime/platform-runtime.service.ts`, `services/api/src/modules/super-admin/super-admin.service.ts`, `services/api/src/modules/tenants/tenants.repository.ts` — driving `apps/admin/app/(internal)/tenants/page.tsx` and eight sibling admin list screens
- **Evidence:**
  `services/api/src/modules/platform-runtime/platform-runtime.service.ts:271-281` — `case 'tenants': return paginateRuntimeRecords(await this.superAdmin.listTenants(), page, pageSize, query.search, ...)`.
  `services/api/src/modules/tenants/tenants.repository.ts:136-138` — `db.tenant.findMany({ orderBy: { createdAt: 'desc' }, include: { customerAccount: true, tenantBranding: true, tenantDomains: true, ownerUser: {...} } })` — **no `skip`/`take`**, full table with nested relations fetched every call.
  `services/api/src/modules/platform-runtime/platform-runtime.service.ts:1483-1560` — `paginateRuntimeRecords` does `JSON.stringify(item).toLowerCase().includes(needle)` for search (line ~1504-1508), `[...filtered].sort(...)` (line ~1540-1550), and `filtered.slice((page-1)*pageSize, page*pageSize)` (line ~1553) — entirely in application memory, on the full result set, on every list/search/sort/page-change request.
  The same un-paginated-source-into-`paginateRuntimeRecords` pattern backs `subscriptions`, `plans`, `invoices`, `payments`, `partner-inquiries`, `partner-onboarding`, `commissions`, and `contract-templates` (call sites at `platform-runtime.service.ts:145,206,244,260,272,283,294,305,316`); confirmed at the service layer for `subscriptions` (`super-admin.service.ts:~3094-3103`, no `skip`/`take`) and `invoices` (`~3115-3130+`, no `skip`/`take`) in addition to `tenants`.
  By contrast, `case 'customers'` (`platform-runtime.service.ts:156-170` → `PlatformLifecycleService.listCustomers`, `super-admin/platform-lifecycle.service.ts:417-511`) does this correctly: a real Prisma `where` clause including a `search`-driven `OR` (lines 434-457) and genuine `skip`/`take`/`count` (lines 468,507-510).
- **Current behaviour:** Every keystroke-debounced search, sort, or page change on the admin Tenants screen (and the eight sibling modules) triggers a full-table Prisma `findMany` with nested `include`s, followed by an O(n) `JSON.stringify` scan for search and an O(n log n) in-memory sort, discarding all but one page of results. This is invisible from the frontend (the client still receives a correctly-paginated page), which is why it wasn't caught by a client-side pagination review — it only surfaces by tracing the request to its backing service, which is what this task asked for.
- **Expected behaviour:** Match the `customers` implementation: push search/sort/filter into the Prisma query with `where`/`orderBy`/`skip`/`take`, and use `count()` for the total.
- **Risk:** At the tenant counts this platform is designed to support (this is DijiPeople's own operator console, but its intended ceiling is "many tenants"), every list interaction on nine admin screens does a full-table read with joins, then discards all but ≤100 rows — a direct, compounding load on the same production database ORCH-04 already shows is under per-request pressure. This is a genuine scaling cliff, not a cosmetic issue.
- **Remediation:** Rewrite `listTenants` (and the eight sibling list methods feeding `paginateRuntimeRecords`) to accept `search`/`sort`/`filter`/`page`/`pageSize` and build a Prisma `where`/`orderBy`/`skip`/`take` query plus a `count()`, following the `listCustomers` pattern already in the codebase at `platform-lifecycle.service.ts:417-511`.
- **Difficulty:** HIGH (nine call sites, each with module-specific filter/sort field mapping)
- **Regression risk:** MEDIUM
- **Fix now:** LATER — needs an ExecPlan; flag to the DB/backend specialist as this is API-layer code, found via this task's required screen trace (platform admin tenant list).

---

### FE-06 — The Employees list "search" box (and every other server-mode `DataTable` instance) never reaches the backend; it silently filters only the already-loaded page

- **Category:** Performance / Correctness
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/app/components/data-table/data-table.tsx`, `apps/web/app/(authenticated)/employees/page.tsx`
- **Evidence:**
  `apps/web/app/components/data-table/data-table.tsx:184` — `searchRows(rows, columns, search)` runs locally against whatever `rows` prop is already in memory, unconditionally on `mode`.
  `apps/web/app/components/data-table/data-table.tsx:461-471` — the search placeholder is literally `"Quick filter current page"` in server mode (`mode === "server" ? "Quick filter current page" : searchPlaceholder`), i.e. the UI's own copy admits the limitation, but the visible search box gives no indication this differs from a full search.
  `apps/web/app/(authenticated)/employees/page.tsx:83-84` builds and forwards a `search` query param to `/employees` and `EmployeeQueryDto.search` exists end-to-end on the backend — but no control in the rendered UI (`ModuleCommandBar`/list shell, grepped, no matches) ever writes to that URL param; only the per-column filter "Apply" button does.
- **Current behaviour:** With the default page size of 10 (`employees/page.tsx:77`, `getPositiveNumberParam(params.pageSize, 10)`) or any page size up to the server's `@Max(100)` ceiling, a user typing an employee's name into the visible search field only filters the ≤100 rows already on screen — not the tenant's full employee set. On a 10,000-employee tenant this returns confidently-wrong "no results" for any employee not on the current page, with no indication to the user that the search was incomplete.
- **Expected behaviour:** The visible search input should either be wired to the existing `search` URL param (real, already-supported backend capability) the way column filters are, or be relabeled/restyled clearly enough that "current page only" is obvious rather than discoverable only in a placeholder string.
- **Risk:** This reads as a performance non-issue (search is instant because it never leaves the browser) but is actually a data-integrity risk: an HR user searching for an employee who is not on the currently-loaded page will conclude the employee doesn't exist. This affects every screen using `DataTable` in server mode with a full dataset larger than one page — Employees is the most consequential instance given the explicit "10,000 employees" scenario this task was asked to trace.
- **Remediation:** In `apps/web/app/components/data-table/data-table.tsx`, when `mode === "server"`, debounce the search input and push it to the URL `search` param (the same `router.push` pattern already used for sort/column-filters at lines 299-364) instead of/in addition to the local quick-filter, so it reaches `employees/page.tsx`'s existing `search` handling.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** YES

---

### FE-07 — Admin's `RuntimeModuleList` re-fetches table/column preferences client-side even though the server component that renders it already loaded a preference for the same module

- **Category:** Performance / Rendering cost
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/admin/app/_components/runtime/runtime-module-page.tsx`, `apps/admin/app/_components/runtime/runtime-module-list.tsx`
- **Evidence:**
  `apps/admin/app/_components/runtime/runtime-module-page.tsx:18-20` — server component fetches `/platform-users/me/module-preferences?moduleKey=...` and passes `defaultViewKey` as a prop.
  `apps/admin/app/_components/runtime/runtime-module-list.tsx:178-231` — a `useEffect` with no gating on the server-supplied prop fires `fetch("/api/platform-runtime/preferences?moduleKey=...")` on every mount, populating `visibleColumns`/`columnOrder`/`columnWidths`/`savedFilters` only after this second round trip resolves; until then the table renders with default column state, then re-renders once the client fetch completes.
- **Current behaviour:** Not a strict duplicate (the client fetch retrieves a superset — full column/filter state — that the server-side call didn't request), but it means every admin runtime list screen (Tenants, Customers, and all others routed through `RuntimeModuleList`) shows a brief flash of default columns before the user's saved layout applies, and pays a second authenticated round trip (browser → `/api/platform-runtime/preferences` route handler → NestJS API) that could have been avoided had `RuntimeModulePage` fetched the full `tableStateJson` server-side and passed it down instead of just `defaultViewKey`.
- **Expected behaviour:** Fetch the full preference payload once, server-side, in `RuntimeModulePage`, and pass it as an initial prop to `RuntimeModuleList` rather than re-fetching client-side on mount.
- **Risk:** Minor — one extra round trip and a layout flash per page load on every admin runtime list screen. Not severe, but easy to fix and systemic (affects the whole admin runtime shell).
- **Remediation:** Extend the server-side preference fetch in `runtime-module-page.tsx:18` to request the full `tableStateJson`, pass it into `RuntimeModuleList` as an initial-state prop, and only fall back to the client `useEffect` fetch if that prop is absent.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

### FE-08 — TipTap (13 packages, the heaviest dependency in the repo) is statically imported into the shared `RuntimeRecordPage`/`RuntimeForm` shell, not lazy-loaded, so it ships to every admin record page regardless of whether a contract is being edited

- **Category:** Performance / Bundle
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/admin/app/_components/documents/contract-document-editor.tsx`, `apps/admin/app/_components/runtime/runtime-form.tsx`, `apps/admin/app/_components/runtime/runtime-record-page.tsx`
- **Evidence:**
  `apps/admin/package.json` declares 13 separate `@tiptap/*` packages all pinned `3.31.3` (`core`, `extension-bubble-menu`, `extension-color`, `extension-floating-menu`, `extension-highlight`, `extension-image`, `extension-link`, `extension-table`, `extension-task-item`, `extension-task-list`, `extension-text-align`, `extension-text-style`, `pm`, `react`, `starter-kit`) — the largest dependency footprint in the monorepo, used in exactly one file, `apps/admin/app/_components/documents/contract-document-editor.tsx`.
  `apps/admin/app/_components/runtime/runtime-form.tsx:10,232,657` — `import { ContractDocumentEditor } from "@/app/_components/documents/contract-document-editor";` — a static (not `next/dynamic`) import, used at two render sites.
  `runtime-form.tsx` is imported by exactly two files: `apps/admin/app/_components/runtime/record-status-group.tsx` and `apps/admin/app/_components/runtime/runtime-record-page.tsx` — the shared record-page shell that (per `AGENTS.md`) backs admin record screens generally, not only contract templates.
- **Current behaviour:** Because the import chain is static end-to-end (`RuntimeRecordPage` → `RuntimeForm` → `ContractDocumentEditor` → 13 `@tiptap/*` packages), TipTap's client bundle cost is paid by every admin record page that renders through `RuntimeRecordPage`, not only the contract-template editing screen that actually needs it.
- **Expected behaviour:** `ContractDocumentEditor` should be loaded via `next/dynamic` (with `ssr: false` if it depends on browser APIs) so TipTap's bundle is only fetched when a contract-editing form component actually renders.
- **Risk:** Unnecessary JS payload and parse/hydration cost on every admin record page, not just contract-related ones — a bundle-size regression risk that will only grow if more editor-heavy modules are added to the shared shell (the audit found no bundle analyzer configured anywhere to catch this — see FE-16).
- **Remediation:** Wrap the `ContractDocumentEditor` import in `runtime-form.tsx:10` with `next/dynamic(() => import(...), { ssr: false, loading: ... })`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

### FE-09 — `packages/ui` is unused scaffolding; `apps/web` and `apps/admin` each maintain their own separate, inconsistent component kits (and admin carries a third, legacy one)

- **Category:** Architecture / Maintainability
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `packages/ui/src/`, `apps/web/app/components/ui/`, `apps/admin/app/_components/ui/`, `apps/admin/app/_components/admin-ui.tsx`
- **Evidence:**
  `packages/ui/src/` contains only `button.tsx` (the create-turbo demo component — `onClick={() => alert(...)}`), `card.tsx`, `code.tsx`; imported from exactly one place in the entire repo, `apps/docs/app/page.tsx:2` (an unused starter app), with **zero** references in `apps/web`, `apps/admin`, or `apps/landing`.
  `apps/web/app/components/ui/` (8 files: `button.tsx`, `dialog.tsx`, `empty-state.tsx`, `form-control.tsx`, `section-card.tsx`, `status-pill.tsx`, +2 spec files) vs. `apps/admin/app/_components/ui/` (10 files covering overlapping concerns: `empty-state.tsx`, `form-control.tsx`, `section-card.tsx`, plus admin-only ones) — a grep for web's import alias `@/app/components` inside `apps/admin` returns zero matches, confirming no sharing.
  `SectionCard` exists twice with different props and different hardcoded styling: web's takes `{title, description, children}` and renders `rounded-[24px] border-border bg-surface` (theme tokens) at `apps/web/app/components/ui/section-card.tsx:3-13`; admin's takes `{title, description, actions, children, className}` and renders `rounded-2xl border-slate-200 bg-white` (hardcoded Tailwind slate, not theme tokens) at `apps/admin/app/_components/ui/section-card.tsx:9-19`.
  Admin additionally carries a third, apparently legacy kit at `apps/admin/app/_components/admin-ui.tsx` (`AdminWorkspace`, `AdminCommandBar`, `AdminCommandButton`, `AdminPageHeader`, `AdminSectionCard`, `AdminKeyValueGrid`) coexisting with `_components/ui/`.
  Admin has no `Button` component at all; per `.agent/context/ui-design-system.md:323-324`, `apps/admin/app/globals.css:61-71` compensates with three `!important` class-rewrite hacks.
- **Current behaviour:** Three independently-maintained component surfaces (web's kit, admin's current kit, admin's legacy `admin-ui.tsx`) plus one dead scaffold package that nobody imports.
- **Expected behaviour:** Per `AGENTS.md` §"No duplicate sources of truth" and the packages layout rule (`packages/` holds exactly `config`, `ui`, `eslint-config`, `typescript-config`), `packages/ui` should be the shared home for cross-app primitives, or its "not the design system" status should be reflected by removing it rather than leaving dead code that looks authoritative.
- **Risk:** Visual/behavioural drift between apps (admin's hardcoded slate colors bypass the tenant theme-token system the rest of the codebase relies on), duplicated maintenance burden, and a misleading `packages/ui` that a future contributor may reasonably assume is shared and load-bearing when it is neither.
- **Remediation:** Either consolidate the overlapping primitives (`SectionCard`, `EmptyState`, `FormControl`) into `packages/ui` and migrate both apps to it, or explicitly document (as `AGENTS.md` for `apps/admin` already partially does) that each app owns its own kit and delete `packages/ui`'s unused scaffold plus `admin-ui.tsx`'s dead surface area.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM (touches shared UI across many screens if consolidated)
- **Fix now:** NO

---

### FE-10 — `apps/admin` has zero `loading.tsx`/`error.tsx` files (0/88 pages); `apps/web`'s effective 91.5% coverage is driven by one route-group file, leaving 22 pages — including the login screen — genuinely uncovered

- **Category:** UX / Reliability
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/admin/app/`, `apps/web/app/`
- **Evidence:**
  `apps/admin/app/`: 88 `page.tsx`, **0** `loading.tsx`, **0** `error.tsx` anywhere in the tree (confirmed via `find apps/admin/app -iname loading.tsx` / `-iname error.tsx`, zero hits) — including `apps/admin/app/(internal)/tenants/page.tsx` and the customers screen, the two screens this task specifically traced.
  `apps/web/app/`: 259 `page.tsx`, only 4 `loading.tsx`/`error.tsx` pairs exist (`apps/web/app/(authenticated)/loading.tsx` + `error.tsx` covering the whole route group, plus 3 more specific overrides for `employees/`, `leaves/`, `reports/`). Because Next's file convention applies a group-level `loading.tsx`/`error.tsx` to every nested segment that doesn't define its own, 237/259 pages are effectively covered by the one group-level pair.
  The remaining **22 pages have no `loading.tsx`/`error.tsx` at their own path or any ancestor**: the entire partner portal (8 pages: `apps/web/app/partner/page.tsx` and 7 siblings), all public auth pages (`apps/web/app/(public)/login/page.tsx`, `partner-login/page.tsx`, `activate/page.tsx`, `reset-password/page.tsx`), all workspace-state pages (6, under `apps/web/app/workspace/`), and `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/[...path]/page.tsx`, `apps/web/app/activate-account/page.tsx`, `apps/web/app/t/[tenantSlug]/login/page.tsx`.
- **Current behaviour:** Admin relies entirely on Next.js's default (unstyled, generic) loading/error UI on every screen. Web's login page — the first screen every user and every tenant-branded workspace visitor sees — has no custom loading or error handling despite making a server-side branding fetch that can fail (`apps/web/app/(public)/login/page.tsx:85-88` already handles a resolve failure gracefully in the page body, which somewhat mitigates the missing `error.tsx`, but there is still no `loading.tsx` for the branding fetch's latency).
- **Expected behaviour:** Per `AGENTS.md`, "Loading / error / empty states are mandatory for every data surface."
- **Risk:** Admin operators see Next's default error screen (no DijiPeople chrome, no actionable message) on any of the 88 pages if a request fails. On web, the partner portal (external partner users, not internal tenant staff) has no loading/error handling at all — the audience least likely to tolerate a raw Next.js error page.
- **Remediation:** Add a route-group-level `loading.tsx`/`error.tsx` pair to `apps/admin/app/(internal)/` mirroring `apps/web/app/(authenticated)/`'s pattern (one file covers most of the 88 pages, same low-cost/high-coverage approach already proven in web). Add equivalents under `apps/web/app/partner/`, `apps/web/app/(public)/`, and `apps/web/app/workspace/`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

### FE-11 — Two of `apps/web`'s four `error.tsx` boundaries render the raw `Error.message` directly with no classification, unlike the safer group-level default

- **Category:** Security / Info Disclosure
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/app/(authenticated)/employees/error.tsx`, `apps/web/app/(authenticated)/leaves/error.tsx`
- **Evidence:**
  `apps/web/app/(authenticated)/employees/error.tsx:15` — `<p className="mt-3 text-sm">{error.message}</p>`.
  `apps/web/app/(authenticated)/leaves/error.tsx:16` — `<p className="mt-3 max-w-2xl text-muted">{error.message}</p>`.
  By contrast, the group-level `apps/web/app/(authenticated)/error.tsx` (covering the other 234 pages) does **not** render `error.message` in the UI — it only logs it to console and persists it via `persistClientError` (`error.tsx:69-88`), showing the user a classified title/description and an opaque `errorReference` digest instead.
  `apps/web/app/(authenticated)/reports/error.tsx:37` also renders `{error.message}` but has an explicit comment (`:9-19`) documenting that the reporting engine's thrown messages are curated and user-safe by design — a deliberate, defensible exception, not the same defect.
- **Current behaviour:** If any code path under `/employees` or `/leaves` ever throws with an internal or stack-bearing message (a Prisma error message, an unhandled exception from a dependency, etc.), it is shown verbatim to the end user, rather than going through the classification the group-level boundary already implements.
- **Expected behaviour:** All `error.tsx` boundaries should follow the group-level pattern: classify/log the real error, show only a safe, curated message to the user.
- **Risk:** Low-likelihood but real information-disclosure surface — depends on what the underlying code throws, which this audit did not exhaustively trace for these two modules. Routed to the API/error-handling specialist to check whether any employees/leaves code path can throw with a message containing internal detail.
- **Remediation:** Delete the two bespoke `error.tsx` files (or update them to match the group-level pattern) so `employees/` and `leaves/` inherit the safer group-level boundary, unless there's a specific UX reason they need their own (in which case classify the message the way `reports/error.tsx` does).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

### FE-12 — The 25 primary runtime-driven list pages in `apps/web` (including Employees) never use the shared `EmptyState`/`ModuleEmptyState` components; they fall through to a generic one-line text fallback

- **Category:** UX
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/app/components/data-table/data-table.tsx`, `apps/web/app/components/runtime/module-data-table.tsx`, `apps/web/app/components/runtime/module-empty-state.tsx`
- **Evidence:**
  `apps/web/app/components/runtime/module-empty-state.tsx` (`ModuleEmptyState`) is imported in exactly one place besides its own definition: `apps/web/app/components/runtime/module-related-subgrid.tsx` (record-detail sub-grids), never on a primary list screen.
  `apps/web/app/components/runtime/module-data-table.tsx` contains no `EmptyState`/`emptyState` reference at all.
  The 25 primary runtime list pages (`approvals`, `attendance`, `benefits/assignments`, `customers`, `employee-bank-accounts`, `employees`, `leaves`, `loans`, `onboarding`, `payroll/{calendars,cycles,delivery-center,employee-compensation,exceptions,payslips,periods,runs}`, `projects`, `recruitment/{candidates,jobs,talent-pool}`, `settings/payroll/banking/{banks,employer-bank-accounts}`, `timesheets`) fall through to `apps/web/app/components/data-table/data-table.tsx:702`'s `{emptyStateMessage(hasActiveSearchOrFilters)}`, which resolves to a single plain sentence (`apps/web/app/components/data-table/utils.ts:274-278`) with no icon, illustration, or call-to-action.
  Contrast: admin's `ProDataTable` empty state is module-metadata-driven (`emptyTitle`/`emptyDescription` per module, `apps/admin/app/_components/runtime/runtime-module-list.tsx:905-916`), so admin's Tenants/Customers screens are better-designed here than web's equivalent primary lists.
- **Current behaviour:** As described above.
- **Expected behaviour:** Per `AGENTS.md`, "Loading / error / empty states are mandatory for every data surface... Use... the shared EmptyState / ModuleEmptyState components." The primary runtime list pages — the majority of web's data surfaces — do not.
- **Risk:** Cosmetic/UX only; no data or security impact.
- **Remediation:** Thread an `emptyState` prop through `ModuleDataTable`/`DataTable` (mirroring admin's per-module `emptyTitle`/`emptyDescription`) sourced from each module's `StandardModuleRuntimeSpec`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

### FE-13 — Five external-facing partner-portal pages and eleven settings-landing pages are needlessly full client components, fetching or filtering only after a client round trip when the same data/logic is already available server-side

- **Category:** Performance / Rendering cost
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/app/partner/*`, `apps/web/app/(authenticated)/settings/*`
- **Evidence:**
  `apps/web/app/partner/page.tsx` → `PartnerOverview` (`apps/web/app/partner/partner-overview.tsx:1,40,239`) is `"use client"` with a `useEffect` → `fetch("/api/partner/portal/...")` fetch-on-mount for a read-only dashboard.
  Four siblings follow the identical pattern: `apps/web/app/partner/leads/page.tsx` → `partner-leads.tsx:1,21-22` (`fetch("/api/partner/portal/leads")`); `apps/web/app/partner/contracts/page.tsx` → `partner-contracts.tsx:1,18-19`; `apps/web/app/partner/profile/page.tsx` → `partner-profile.tsx:1,22-23`; `apps/web/app/partner/referral-links/page.tsx` → `partner-referral-links.tsx:1,26-27` — five routes total, all read-only tables/dashboards that could be server-fetched via `apiRequestJson` the way every other page in `apps/web` is.
  `apps/web/app/(authenticated)/settings/page.tsx:1` (line 1 `"use client"`) and ten sibling category pages (`settings/notifications`, `settings/security-access`, `settings/customization`, `settings/[category]`, etc.) delegate to `SettingsCategoryLanding` (`apps/web/app/(authenticated)/settings/_components/settings-runtime-landing.tsx:1,74`), whose only client-side work is `useCurrentUserAccess()` filtering a static `categoryDefinitions` array (`settings-runtime.ts:54-101`, 11 entries) by role — a role already known server-side via `requireSessionUser` and used as a server-side check elsewhere in the same codebase.
  `apps/admin/app/(internal)/settings/page.tsx:1,58-60` is the same pattern in admin: a `"use client"` page whose only logic is a `useState`/`useMemo` text filter over a hardcoded `groups` array.
- **Current behaviour:** These 17 routes (5 partner + 11 web settings-landing + 1 admin settings-landing) ship JS, hydrate, and only then fetch or compute what a server component could have resolved and streamed directly — a strictly worse loading experience (blank/skeleton state until hydration + fetch) with no interactivity gained in return, since none of the current behaviour needs client-only APIs beyond `useContext`/`useEffect`.
- **Expected behaviour:** Server-fetch the partner portal data via `apiRequestJson` the way every other authenticated page does; resolve the settings-category role filter server-side (the role is already available wherever `requireSessionUser`/`getSessionUser` runs) and pass a pre-filtered list into a small client leaf only if any interactivity remains.
- **Risk:** Slower first paint for external partner users specifically (the audience least tolerant of a blank-then-populate experience), and 11+ settings pages paying client-bundle and hydration cost for what is a static, role-filtered nav list.
- **Remediation:** Convert `apps/web/app/partner/{page,leads/page,contracts/page,profile/page,referral-links/page}.tsx` to server components using `apiRequestJson` against the same data the `/api/partner/portal/*` route handlers already proxy. For the settings-landing pattern, resolve the role check in the server `page.tsx` (all of which already have access to `requireSessionUser`/`getSessionUser` per the codebase's own convention) and pass the filtered category list as a prop.
- **Difficulty:** MEDIUM (5 partner pages + 11-12 settings pages, low risk each but many files)
- **Regression risk:** LOW
- **Fix now:** NO

---

### FE-14 — Individual runtime widgets fetch their own data client-side on mount, adding N extra browser→route-handler→API round trips after the record page has already painted

- **Category:** Performance
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/app/components/runtime/module-widget-renderer.tsx`
- **Evidence:**
  `apps/web/app/components/runtime/module-widget-renderer.tsx:1858-1873` — a document-list widget fires `Promise.all([fetch("/api/documents/entity/...") , fetch("/api/lookups/document-types"), fetch("/api/lookups/document-categories")])` inside a `useEffect` on mount (properly parallelized internally, but still a client-triggered fetch the record page's server render could have supplied).
  `:2212-2236` — an organization-hierarchy widget fires `fetch("/api/organization-hierarchy/tree", { cache: "no-store" })` in its own `useEffect` on mount.
  11 `useEffect` blocks exist in this 3,006-line file in total; 3 confirmed direct `fetch("/api/...")` call sites (others may delegate to hooks not traced here).
- **Current behaviour:** A record page composed of multiple such widgets shows its primary content first, then each widget independently triggers its own authenticated round trip (browser → Next.js route handler → NestJS API) once mounted, rather than the record page's server component batching all widget data into the initial render.
- **Expected behaviour:** Where practical, widget data used on initial render should be fetched server-side alongside the record's main data and passed as props, reserving client-side fetch for genuinely deferred/on-demand content.
- **Risk:** Minor, additive latency and extra authenticated round trips (each paying ORCH-04's auth tax) per widget per record-page view; not severe on its own, but the pattern is repeated per widget type and record pages can host several widgets.
- **Remediation:** For widgets whose data is needed on first paint (not lazily/on-demand), move the fetch into the record page's server-side data load and pass it as a prop, following the pattern the rest of the runtime module system uses.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** NO

---

### FE-15 — Branding, profile, and DLP-capture images use raw `<img>` with no `next/image` optimization anywhere in the product, and no app configures `images.remotePatterns`

- **Category:** Performance
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/app/components/branding/tenant-logo.tsx`, `apps/web/app/(authenticated)/dlp-review/page.tsx`, `apps/web/app/(authenticated)/employees/_components/employee-dlp-captures.tsx`, `apps/web/app/(authenticated)/settings/branding/_components/branding-settings-form.tsx`, `apps/web/app/components/location/geofence-map.tsx`, `apps/web/app/components/runtime/runtime-profile-image-card.tsx`, `apps/web/app/components/settings/branding-logo-upload-field.tsx`
- **Evidence:**
  `apps/web/app/components/branding/tenant-logo.tsx:59,74` — two raw `<img>` tags rendering the tenant's branding logo, used on the login page (rendered on every unauthenticated login view, across every tenant).
  7 files repo-wide use raw `<img>`; 8 files use `next/image` (`grep -rl "from \"next/image\"" apps/web apps/admin apps/landing` → 8 hits vs. `grep -rln "<img\b"` → 7 hits).
  None of `apps/web/next.config.ts`, `apps/admin/next.config.ts`, `apps/landing/next.config.ts` define an `images` block (no `domains`/`remotePatterns`), confirmed by full-file reads.
- **Current behaviour:** Tenant logos, employee profile images, and DLP capture screenshots are never resized, format-converted (WebP/AVIF), or lazy-loaded by Next's image pipeline. Because no `images.remotePatterns` is configured anywhere, `next/image` likely could not even serve these tenant-uploaded/external-URL images today without a config change — so the raw `<img>` usage may be a pragmatic workaround rather than an oversight, but the net effect is the same: no image optimization on any user-facing branding/profile image, including the tenant logo shown on every login page load.
- **Expected behaviour:** Configure `images.remotePatterns` for whatever origin serves tenant-uploaded assets (branding logos, profile images, document storage), then migrate these components to `next/image`.
- **Risk:** LCP/bandwidth cost on high-traffic surfaces (login page logo, employee profile cards) — low severity given the images involved (logos, avatars) are typically small, but compounds on slow connections and on record pages with many profile images in a list.
- **Remediation:** Add `images.remotePatterns` to `apps/web/next.config.ts` matching the tenant asset storage origin(s), then convert `tenant-logo.tsx` and the profile-image components to `next/image`.
- **Difficulty:** LOW-MEDIUM (depends on how many distinct asset origins exist)
- **Regression risk:** LOW
- **Fix now:** NO

---

### FE-16 — No bundle analyzer or `experimental.optimizePackageImports` is configured in any app; the dependency surface is lean today but there is no mechanism to catch a future regression

- **Category:** Performance / Tooling
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/next.config.ts`, `apps/admin/next.config.ts`, `apps/landing/next.config.ts`
- **Evidence:**
  Full reads of all three `next.config.ts` files confirm each configures only `headers()` (via shared `securityHeadersForApp`), `poweredByHeader: false`, and conditional `output: "standalone"`; `apps/web/next.config.ts` additionally has a settings-redirect block. None contains `experimental.optimizePackageImports`, an `images` block, `transpilePackages`, or bundle-analyzer wiring (`@next/bundle-analyzer`/`withBundleAnalyzer` absent from every `package.json` and every `next.config.ts`, confirmed by grep).
  Dependency audit (see FE-08/FE-09 context): no date library, charting library, lodash, PDF library, or state-management library is declared anywhere in the four `package.json` files checked — a genuinely lean dependency surface for a system this size, with TipTap (admin-only) and `lucide-react` (all three apps, correctly tree-shaken via named imports) the only "heavy" entries.
- **Current behaviour:** As above. Given how few heavy dependencies exist today, this is not an urgent gap, but nothing would catch a regression (e.g. a moment.js or full-antd addition) before it ships.
- **Expected behaviour:** A bundle-analyzer script and CI budget would give visibility that currently doesn't exist.
- **Risk:** Low today; grows as a silent risk over time.
- **Remediation:** Add `@next/bundle-analyzer` behind an `ANALYZE=true` env flag in each `next.config.ts`, and consider a CI budget check once a baseline is captured.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

### FE-17 (routed to API/security specialist) — Contract/legal-document HTML rendered via `dangerouslySetInnerHTML` is sanitized at write time; placeholder substitution after sanitization is unverified

- **Category:** Security (client-side hygiene, per task item 9 — reported here, ownership is the API/backend)
- **Severity:** LOW
- **Confidence:** LIKELY (the sanitization-at-write-time link is CONFIRMED; whether placeholder-value substitution re-introduces unescaped content is unverified — that link is backend logic outside this task's scope)
- **Known:** NEW
- **Component:** `apps/admin/app/_components/runtime/runtime-record-page.tsx:1095`, `apps/landing/app/sign/[token]/signing-experience.tsx:160`, `services/api/src/modules/contracts/contracts.service.ts`
- **Evidence:**
  `apps/admin/app/_components/runtime/runtime-record-page.tsx:1095` — `dangerouslySetInnerHTML={{ __html: resolvedHtml }}`, where `resolvedHtml` comes from `GET /api/contracts/:id/document-fields` (client-fetched, `runtime-record-page.tsx:900-920`).
  `apps/landing/app/sign/[token]/signing-experience.tsx:40-45,160` — `signingDocumentHtml` derived from `session.document.contentHtml` (fetched from `/api/signatures/:token`), rendered unsanitized to an **unauthenticated external signer** reachable only by token — the one place in this pattern where the viewer is outside the tenant's own authenticated users.
  `services/api/src/modules/contracts/contracts.service.ts:21,1272` — `import sanitizeHtml from 'sanitize-html'` and `const contentHtml = cleanContractHtml(rawHtml);` applied at document creation/update time, before `contentHtml` is persisted (also at lines 2254, 2345, 2394 for other write paths).
  `services/api/src/modules/contracts/contracts.service.ts:2161-2172` — `resolvedHtml`/`signingDocumentHtml`'s source is produced by `renderContractPlaceholders(version.contentHtml, resolved)` — substituting placeholder tokens into the already-sanitized template **after** `cleanContractHtml` has run. Whether `resolved`/placeholder values (which can include form-field input) are themselves escaped before insertion was not verified in this pass — that is backend template-rendering logic, outside this task's frontend scope.
- **Current behaviour:** The contract template HTML itself is sanitized before storage (healthy). The frontend's use of `dangerouslySetInnerHTML` on `resolvedHtml`/`signingDocumentHtml` is therefore rendering server-sanitized content in the common case, not raw user input.
- **Expected behaviour:** N/A pending backend verification.
- **Risk:** If `renderContractPlaceholders` does not HTML-escape substituted values, a value originating from a form field (filled in by a tenant admin) could reintroduce markup into `contentHtml` after sanitization, which would then render unsanitized in the public, unauthenticated `/sign/[token]` signing flow — crossing a trust boundary (external signer) even though the write-side actor is an authenticated tenant admin. This is speculative (LIKELY, one link unverified) and is routed to the API specialist to check `renderContractPlaceholders` in `services/api/src/modules/contracts/contracts.service.ts`.
- **Remediation:** API specialist to verify `renderContractPlaceholders` escapes/sanitizes substituted values, not just the template shell.
- **Difficulty:** N/A (routing note)
- **Regression risk:** N/A
- **Fix now:** NO — routed

---

## Healthy — verified good

- **No cross-tenant or cross-user Next.js caching exists anywhere** (FE-01) — every authenticated fetch in `apps/web`/`apps/admin` is `cache: "no-store"`, cookie-gated dynamic rendering is used consistently, and the only `revalidate`-cached endpoints in the whole frontend estate are genuinely public, non-identity marketing/legal content in `apps/landing`.
- **Server-side page-size ceilings are consistently enforced** regardless of client request, across essentially every paginated DTO checked (`employees`, `platform-runtime` modules, `attendance`, `documents`, `leads`, `contracts` — all `@Max(100)`), so no endpoint lets a client request an unbounded page. The one deliberate exception (`employees.service.ts` CSV export, hard-coded `pageSize: 10000`) is an internal literal, not client-controlled.
- **`apps/admin`'s `customers` list is correctly implemented**: real Prisma `where`/`orderBy`/`skip`/`take`/`count`, unlike its `tenants` sibling (FE-05) — proof the pattern exists in the codebase and the fix is a known-good template to copy.
- **`ProDataTable` (admin) is a pure presentational component** with server-driven sort/pagination delegated entirely to callers, and `RuntimeModuleList`'s search is properly debounced (350ms) before triggering navigation — not fetched per keystroke.
- **`ModuleRuntimeProvider`** (`apps/web/app/components/runtime/module-runtime-provider.tsx:42-57`) correctly memoizes its context value with `useMemo`, avoiding needless re-renders of the runtime record-page subtree.
- **No secrets in `NEXT_PUBLIC_*` variables** — grepped all three apps' env usage for secret/key/token/password/credential-named `NEXT_PUBLIC_` variables; none found.
- **No auth tokens in `localStorage`/`sessionStorage`** — every `localStorage`/`sessionStorage` use found (`apps/web/app/components/data-table/data-table.tsx`, `module-record-page.tsx`, `apps/admin/app/_components/notifications/app-notification.tsx`) stores UI state (sticky-column state, a "dismissed" flag, a sessionStorage draft key), never a credential. Auth uses HttpOnly cookies exclusively per `server-api.ts`.
- **Contract-template HTML is sanitized server-side at write time** via `sanitize-html`/`cleanContractHtml` before storage (see FE-17) — the frontend's `dangerouslySetInnerHTML` usage for contract content is not rendering raw, unsanitized input in the common case.
- **Root layouts in all three apps use the children-slot pattern correctly** — even where 4-5 client context providers wrap the authenticated/internal subtree (`apps/web/app/(authenticated)/layout.tsx`, `apps/admin/app/(internal)/layout.tsx`), `{children}` is passed as a prop, so this does *not* force `page.tsx` files themselves to become client components; the vast majority of pages in both apps remain server components (98.8% of web pages, 98.9% of admin pages have no `"use client"` at the page level).
- **`apps/landing`'s root layout and `apps/admin`'s root layout carry no context providers at all** — the cleanest of the layouts examined; `apps/admin/app/layout.tsx` in particular has zero providers, only a theme-bootstrap script.
- **`next/font/google` is used correctly in all three apps** (no manual `<link>` font loading, no render-blocking external font requests) — `apps/web/app/layout.tsx:4` (`Instrument_Sans`, `Literata`), `apps/admin/app/layout.tsx` (`Geist`, `Geist_Mono`), `apps/landing/app/layout.tsx` (`Fraunces`, `Manrope`).
- **No committed vendor assets, icon fonts, or oversized images ship in `apps/web`, `apps/admin`, or `apps/landing`'s `public/` directories** — largest asset found across all three (`apps/landing/public/images/hero.png`) is ~190KB, under any reasonable threshold.
- **`lucide-react` icon imports are correctly tree-shaken** (named/per-icon imports throughout, no whole-barrel `react-icons`-style import found anywhere in the repo).

## Not examined / limits

- **No runtime/browser measurement was performed** — per the briefing, `next build` and any dev-server start were out of scope. All bundle-size, LCP, and hydration-cost claims (FE-08, FE-13, FE-15, FE-16) are inferred from static import-graph analysis, not measured; a bundle analyzer run would give exact numbers.
- **`apps/admin`'s non-`page.tsx` client-component mass (181/376 files, 48.1%) was censused but not drilled into per-component** — the agent gathering this data flagged `_components/` (where the mass actually lives — `ProDataTable`, `AdminShell`, tenant-panel components) as the next place to look if this audit continues; this report did not individually assess whether each of those 181 files needs to be client.
- **`services/api/src/modules/platform-runtime/platform-runtime.service.ts`'s other seven affected modules** (subscriptions, plans, payments, partner-inquiries, partner-onboarding, commissions, contract-templates, beyond the two — tenants and invoices — whose backing service method was read directly) were confirmed only via the shared `paginateRuntimeRecords` call site, not by reading each individual un-paginated source method; FE-05's severity assessment assumes they follow the same pattern as `tenants`/`invoices`/`subscriptions`, which is a LIKELY-strength inference for those seven, not independently CONFIRMED per-module.
- **`renderContractPlaceholders`'s escaping behavior was not read** — FE-17 is routed to the API specialist rather than resolved here, since verifying it is backend template-rendering logic outside this task's frontend-architecture scope.
- **`apps/agent-desktop`** (the Electron attendance agent) was explicitly out of this task's scope (`apps/web`, `apps/admin`, `apps/landing` only) and was not examined.
- **Accessibility was not assessed** — out of this task's nine numbered items; a prior record (`BUG-0043`, cited in `docs/knowledge/architecture/web-architecture.md`) already covers missing focus traps and unlabelled controls in `apps/web`, not re-verified here.
- **Mobile/tablet responsiveness was not re-tested** — `BUG-1668` (tenant workspace horizontal scroll at mobile width) is a known record; not independently re-verified in this pass.
- **The nine specific traced screens (login, dashboard, employee list, employee record, attendance, timesheet, payroll, reports, platform admin tenant list) were traced for server-side request fan-out and backend query shape, not for actual measured network waterfall/timing** — no browser or network tooling was used (out of scope), so round-trip counts in FE-02/FE-03/FE-05 are derived from reading the call graph, not from a captured HAR file.
