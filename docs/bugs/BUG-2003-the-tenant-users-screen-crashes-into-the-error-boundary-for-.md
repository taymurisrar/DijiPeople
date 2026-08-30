---
ID: BUG-2003
aliases: [BUG-2003]
Title: The tenant Users screen requests an entity the data registry does not have, so it never renders
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web, services/api/src/modules/data]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-313
RelatedBacklogItem: ITEM-0107
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-2003 — The tenant Users screen requests an entity the data registry does not have, so it never renders

## Summary

`/users` in the tenant workspace fetches the generic entity-data endpoint for the
logical entity `users`. The API's entity registry contains exactly one entity —
`employees` — so `GET /data/users` returns 404 before a single row is read. The
404 is thrown, uncaught, inside an async Server Component, and the page is
replaced by the "UNEXPECTED ERROR" boundary. It is **not data-dependent**: it
fails for every tenant, with zero users or ten thousand, and has done since
`USE_ENTITY_DATA_API` was turned on. The dashboard links to this route three
times, so an administrator following the product's own prompts to manage users
lands on a dead page.

## Expected Behavior

`/users` lists the tenant's user accounts, as
`/settings/security-access/identities/users` already does from the same data.

## Actual Behavior

The route renders the `DashboardErrorBoundary` fallback:

```
UNEXPECTED ERROR
```

with, in the browser console:

```
Minified React error #441   (https://react.dev/errors/441)
```

and error reference / digest `2951983503`.

**React #441 is not a client crash, a hydration error or a React defect.** It is
the placeholder the RSC Flight *browser* client manufactures in
`resolveErrorProd()` when the Flight payload carries an error row whose message
was stripped for production. Verbatim, from the un-minified edge build of the
same function:

> "An error occurred in the Server Components render. The specific message is
> omitted in production builds to avoid leaking sensitive details. A digest
> property is included on this error instance which may provide additional
> details about the nature of the error."

It appears if and only if a Server Component threw on the server. React and
react-dom are pinned at 19.2.4; Next.js at 16.3.1.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29, signed in as the tenant
administrator.

1. Sign in to the tenant workspace.
2. Navigate to `/users` — directly, or by any of the three dashboard links:
   - Quick actions > **Manage users**
   - the **Active users** tile > **Open**
   - the data-quality row **Users not linked to employee records** > **Review**
3. The error boundary replaces the page. Console shows `Minified React error
   #441`, digest `2951983503`.
4. For contrast, open `/settings/security-access/identities/users`: it renders
   both users with Linked Employee, Business Unit, User Type, Status and Last
   Login populated, over the plain `GET /api/users` REST endpoint.

## Evidence

Code, at `eb457d9d`:

- `apps/web/app/(authenticated)/users/page.tsx:84` reads the switch, `:86-93`
  takes the entity-data branch, `:245` builds the URL and `:279` issues it:

```
 84:  const useEntityDataApi = process.env.USE_ENTITY_DATA_API === "true";
 86:  const [rawUsers, resolvedSettings, publishedViews] = await Promise.all([
 87:      useEntityDataApi
 88:          ? fetchUsersFromEntityData({ … })          // taken in production
 96:          : apiRequestJson<UserListResponse>(`/users?${query.toString()}`),
245:      const url = buildEntityDataUrl({ entityLogicalName: "users", … })
276:                     .replace(/^\/api/, "");        // -> "/data/users?$select=…"
279:      const response = await apiRequestJson<EntityDataResponse<UserEntityRecord>>(url);
```

- `services/api/src/modules/data/entity-registry.ts:4-114` registers exactly one
  entity, `employees`; `getEntityMetadata` returns `null` for anything else
  (`:118-120`).
- `services/api/src/modules/data/data.service.ts:35-40`:

```ts
const metadata = getEntityMetadata(entityLogicalName);
if (!metadata) {
  throw new NotFoundException(`Entity is not available: ${entityLogicalName}`);
}
```

- The 404 becomes an `ApiRequestError` at `apps/web/lib/server-api.ts:435-437`,
  thrown inside the `Promise.all` with no catch, in an async Server Component.

Every other throw site in the page was eliminated:

| Candidate | Verdict |
|---|---|
| `getBusinessUnitAccessSummary()` (`page.tsx:36`) | `.catch(() => null)` in `_lib/business-unit-access.ts:22-24`. Cannot throw. |
| `getSessionUser()` (`page.tsx:49`) | Also called by `/employees`, which renders. |
| `apiRequestJson("/tenant-settings/resolved")` (`page.tsx:97-99`) | `.catch(() => null)`. |
| `getTableViews("users")` (`page.tsx:100`) | `.catch(() => null)` in `lib/customization-views.ts:35-37`; all reads `??`-guarded. |
| `resolvedSettings?.system.dateFormat` / `?.organization.timezone` (`page.tsx:139-146`) | Byte-identical expression at `employees/page.tsx:132-137`, which renders. |
| RSC serialization of props | All props are strings, booleans and wire JSON. `ModuleViewSelector` is proven on the dashboard. |
| The plain `GET /api/users` REST endpoint | Proven working in production — it is what the settings screen uses. |

Corroboration from the one page that does work: `/employees` is the **only other**
file that reads `USE_ENTITY_DATA_API` (`employees/page.tsx:79`), and its `$select`
list is a field-for-field match of the `employees` registry entry including its
single registered expand (`entity-registry.ts:28-112`). `/users` asks for
`status`, `businessUnitId`, `isServiceAccount`, `lastLoginAt` and `createdAt` on
an entity that was never added: `fetchUsersFromEntityData` was written against a
surface that does not exist.

**One thing not verified directly.** The crash is gated on
`USE_ENTITY_DATA_API === "true"` in the *web runtime* environment, and the live
Vercel value was not read — the environment call was correctly blocked by the
sandbox. The evidence that it is `true` in production is:
`apps/web/.env.production.example:18`, `apps/web/.env.example:39`,
`apps/web/.env.local.example:18`, `docs/environment-variables.md:328` (inside the
"Web: Vercel" production block) and `turbo.json:139`; plus the logical argument
that with the flag off the page takes the REST branch, which is proven to work.
**Confirm before fixing** by reading the runtime log line for digest
`2951983503`, which will read `Entity is not available: users`, or by
`vercel env ls production` on the web project.

**Not data-dependent.** The 404 happens before any row is read, so the `INVITED`
user, the null `lastLogin` and the linked employee record are all irrelevant.
(`data.controller.ts:33-41` checks `customDataService.isCustomTable('users', …)`
first, so a tenant that had defined a custom table literally named `users` would
take another path. Not the case here.)

**Fixing only the server fetch is not enough.** `users-table.tsx:193` passes
`entityLogicalName={useEntityDataApi ? "users" : undefined}` with `mode="server"`,
so once the page renders, client-side sort and paginate hit `/api/data/users` and
404 the same way.

**Three secondary defects in the same page**, invisible until the crash is fixed
and recorded here rather than as their own records because ITEM-0107 may delete
this page outright:

- `mapUserSummary` returns `roles` and `linkedEmployee`;
  `users-table.tsx:104-146` reads `user.userRoles` and `user.employee`. On the
  REST fallback the Roles column always reads "No roles assigned" and Linked
  Employee always "Not linked".
- `GET /users` (`services/api/src/modules/users/users.controller.ts:39-43`) takes
  no query parameters and returns an unpaginated array. The page's
  `?page=&pageSize=&search=&status=` are discarded and
  `normalizeUserListResponse` (`page.tsx:~330`) fabricates the `meta` block the
  pager renders.
- `UsersFilterBar` is imported at `page.tsx:29` and never rendered.

**Not fixed in `develop`.** `git log --oneline 949f461c..origin/develop` over
`apps/web/app/(authenticated)/users`, `services/api/src/modules/data`,
`apps/web/next.config.ts` and the settings users trees returns nothing. The page
has only ever been touched by four commits (`80305fb9`, `a8c04f16`, `2ed5e53b`,
`719165ab`), the last of which only moved an import.

## Root Cause

**Established.** `fetchUsersFromEntityData` requests logical entity `users` from
the generic entity-data API, which registers only `employees`; the resulting 404
is thrown uncaught inside an async Server Component, which puts an error row in
the RSC Flight stream and produces React #441 in the browser.

## Impact

A primary administrative journey is broken in production for every tenant. User
management is how an administrator invites staff, links accounts to employee
records and clears the "users not linked to employee records" warning the
dashboard itself raises. All three of the product's own routes into it end on a
crash page with no recovery and no explanation, and nothing in the product links
to the canonical screen that does work.

Rated HIGH: a primary journey blocked, reachable in production with no special
role and no crafted request. Not CRITICAL: nothing is exposed, changed or lost,
and an alternative screen exists — undiscoverable, but it exists.

## Affected Areas

`apps/web/app/(authenticated)/users/` (page, `users-table.tsx`,
`users-command-bar.tsx`, `[userId]/`); `services/api/src/modules/data`
(`entity-registry.ts`, `data.service.ts`); the four hard-coded `/users` links in
`services/api/src/modules/dashboard/dashboard.service.ts` (`:161`, `:512`,
`:623`, `:2056`); `apps/web/_components/dashboard-sidebar.tsx:386`.

## Proposed Resolution

Two options, and the cheap one is also the one that removes the most code.

**Cheap and recommended** — redirect `/users` to
`/settings/security-access/identities/users` in `apps/web/next.config.ts`, using
the same redirect mechanism already applied to the other two users trees, and
delete the bespoke `/users` tree with it. That is ITEM-0107's recommendation and
it closes this record, BUG-2014 and the three secondary defects above at once.

**Expensive** — register a `users` entity in `ENTITY_REGISTRY` and reconcile the
page's `$select` list, its `userRoles`/`employee` field mismatch and its
fictional pagination against it. Real work, and it buys nothing the canonical
screen does not already do.

Either way, confirm the live `USE_ENTITY_DATA_API` value first, so the fix is
made against the branch production actually takes.

## Acceptance Criteria

- Navigating to `/users` reaches a working users list for an administrator, with
  no error boundary, no `#441` and no console error.
- All four dashboard links (`dashboard.service.ts:161, 512, 623, 2056`) reach
  that same working screen.
- No client-side interaction on the users list issues a request to
  `/api/data/users`.
- A contract test asserts that every `buildEntityDataUrl({entityLogicalName})`
  call site names a key of `ENTITY_REGISTRY`.

## Regression Coverage

None yet, and nothing in CI covers this today. `apps/web/jest.config.js` is
`testEnvironment: "node"` with no jsdom — its own header says rendering tests are
not possible there — so no unit test can reach this screen. Browser coverage for
`apps/web` does now exist (`e2e/tests/flow-h`, `flow-i`, `flow-j`, added for
ITEM-0034 on 2026-08-29, with CI starting `dev:web` and polling 3001), but that
suite walks the entitled modules and settings and never opens `/users`, so it
does not catch this. The page compiles and type-checks perfectly;
`entityLogicalName: "users"` is just a `string`.

The cheapest guard, and the one to write first, is a ~20-line node-environment
contract test asserting every `buildEntityDataUrl({entityLogicalName})` call site
names a key of `ENTITY_REGISTRY`. It fits the existing jest setup, catches this
today and catches every future copy of the mistake. The layer that would have
caught this *and* BUG-2004 is a smoke check that GETs every sidebar route and
fails on any HTML containing `id="__next_error__"` or a Flight `E{"digest"` row —
which needs no browser.

## Dependencies

ITEM-0107 (four Users screens) should be triaged with this, because it decides
whether this route survives at all.

## Related Items

BUG-2004 is the other React #441 route and shares the mechanism (an uncaught
throw in a Server Component) but not the cause. BUG-2013 is why both of them
render the same useless "UNEXPECTED ERROR" screen. BUG-2014 covers `/users/new`
and `/users/import`, which are reachable today by URL. ITEM-0107 quantifies the
four Users screens. ITEM-0001 is the missing browser e2e tooling.

## Resolution

**Code fixed; the record stays open for want of the regression coverage this
repository requires before a bug may be marked `FIXED`.**

Commit `d3ffb3aa` on `agent/starter-blocker-fixes` — on that branch only, not yet on `develop` or `main`,
took the second half of the "expensive" option's opposite: rather than
registering a `users` entity, it deleted the branch that asked for one.
`apps/web/app/(authenticated)/users/page.tsx` no longer reads
`USE_ENTITY_DATA_API`; it always uses the REST list endpoint it already had.
`fetchUsersFromEntityData`, `resolveEntityOrderBy`, the `UserEntityRecord` type
and their imports are gone — 129 lines removed, one comment added explaining
why the branch may not come back until `users` is a registered entity that
projects the relations the screen shows.

This is neither of the two options the record proposed. It is cheaper than
registering the entity and less final than deleting the page, and it deliberately
does not pre-empt ITEM-0107, which may still redirect `/users` to the canonical
settings screen. The page now renders; if ITEM-0107 later deletes it, nothing
here has to be undone.

Against the acceptance criteria:

- **1, reaches a working list** — met. The only throw site the Evidence section
  could not eliminate was the entity-data 404, and it is gone.
- **2, all four dashboard links** — met by the same change; they point at
  `/users`, which now renders.
- **3, no client-side request to `/api/data/users`** — met, though indirectly and
  worth recording. `users-table.tsx:193` still reads
  `entityLogicalName={useEntityDataApi ? "users" : undefined}`, but the page no
  longer passes `useEntityDataApi`, so the prop defaults to `false`, the table
  runs in `mode="client"` and `entityLogicalName` is `undefined`. The dead prop
  was left in place; it is inert, not correct.
- **4, a contract test over `buildEntityDataUrl` call sites** — **done**, in
  `apps/web/app/components/entity-data/entity-registry-contract.spec.ts`. It
  reads `ENTITY_REGISTRY` out of the API source, because `apps/web` must not
  import from `services/api`, and asserts every `buildEntityDataUrl` call site
  names an entity the registry holds. It also asserts that its own scan found
  entities *and* found call sites — without that, deleting the registry would
  turn it green.

  > This bullet read "**not done**" until 2026-08-30. It was written when only
  > the code half had landed and was not revised when the test followed in the
  > same session, so the record contradicted its own `Status: FIXED` and
  > `rebuild-backlog` rejected it. The dead-prop note above has also moved on:
  > `useEntityDataApi` was subsequently removed from `users-table.tsx`
  > altogether, so the table is no longer correct only by default, one prop away
  > from regressing.

### The three secondary defects are still there

The record noted them as invisible while the page crashed. The page no longer
crashes, so they are now reachable — which is the point of recording them here:

- `users-table.tsx:104-146` still reads `user.userRoles` and `user.employee`
  while the REST mapper supplies `roles` and `linkedEmployee`, so the Roles
  column reads "No roles assigned" and Linked Employee reads "Not linked" for
  everyone.
- `GET /users` still takes no query parameters and returns an unpaginated array;
  `normalizeUserListResponse` still fabricates the `meta` block, so search,
  status filter and paging do nothing.
- `UsersFilterBar` is still imported at `page.tsx:24` and never rendered.

None of these is a crash and none was in scope for this commit, but a reviewer
opening `/users` after the fix will see two empty columns and a pager that does
not page, and should not read that as a new regression.


### 2026-08-29 - the fourth criterion, and the prop that was inert rather than correct

**The earlier fix is no longer branch-local.** The Resolution above records
commit `d3ffb3aa` as living only on `agent/starter-blocker-fixes`. It reached
`origin/develop` as `3fff9cc9`, and is in this branch's base, so the page is
already on the REST list endpoint here. That paragraph was accurate when written
and is now stale; it is left standing rather than rewritten, because the history
of where a fix lived is worth keeping.

Two things remained, and both are done.

**Criterion 4, the contract test** - written, at
`apps/web/app/components/entity-data/entity-registry-contract.spec.ts`. It reads
`ENTITY_REGISTRY` out of the API source rather than importing it, because
`apps/web` does not depend on `services/api` and must not start it, then scans
every `.ts`/`.tsx` under `apps/web/app` and `apps/web/lib` for
`buildEntityDataUrl({ entityLogicalName: "..." })` and asserts each name is one
the registry holds.

It is guarded against passing for the wrong reason, which is the failure mode
that matters for a test built on a regex: `:82-90` asserts the registry parse
returned entities at all and that `employees` is among them, and `:92-94`
asserts at least one call site was found. Without those two, deleting the
registry or breaking the scan would turn the suite green.

Mutation-tested rather than assumed: changing `employees/page.tsx:234` to
`entityLogicalName: "users"` - which is precisely this bug - fails the suite
with `"entity": "users"` in the diff. Restored afterwards.

**Criterion 3, no client request to `/api/data/users`** - now met at the source
rather than by a default. The Resolution above recorded the prop as "inert, not
correct". `users-table.tsx:190-194` no longer takes `useEntityDataApi` at all:
the table is `mode="client"` outright, and `entityLogicalName="users"` is gone
with it, so there is nothing left to re-enable by accident.

All four acceptance criteria are now met.

**The three secondary defects are still there**, exactly as the Resolution above
records - the `userRoles`/`employee` field mismatch, the fabricated pagination,
and `UsersFilterBar` imported and never rendered. They are unchanged and remain
out of scope here; ITEM-0107 may delete the screen that carries them. One of the
two links the record listed under those defects has changed, but for BUG-2014's
reasons rather than these: the empty state now uses the shared `EmptyState` and
points at the settings user-create route.

## QA Retest

Not yet performed, and it cannot be performed today: the fix is not on `develop` and
production runs `main` at `949f461c`, which does not contain it. This task did
not touch `main`, so **nothing here is verified in production** and `/users`
still renders the error boundary on the demo tenant.

Live verification is pending a release: open `/users` as a tenant administrator
and confirm a rendered list with no `#441` and no console error; follow all four
dashboard links; sort and page the table with the network panel open and confirm
no request to `/api/data/users`. Expect the three secondary defects above to be
visible, and do not file them again.


**Updated 2026-08-29.** The unit-level half of the retest now exists and passes:
the contract test above fails against the defect and passes against the fix. The
live half is unchanged - production still runs `main` at `949f461c`, this work
is on a task branch, and `/users` has not been opened by a browser since. The
walkthrough described above is still the thing to do on the next release.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — root cause established by static analysis plus read-only HTTP probes; title, Summary, Evidence, Root Cause and Proposed Resolution rewritten from "not established" to the entity-registry mismatch. Disposition set to FIX_NOW by the SESSION-0070 Architect triage.
- 2026-08-29 — Regression Coverage updated: browser E2E coverage for `apps/web` landed on `origin/develop` (ITEM-0034, 2026-08-29). The claim that no Playwright suite exists was stale; the accurate statement is that the new suite does not open this screen.
- 2026-08-29 — code fixed in SESSION-0072 at `d3ffb3aa`, on `agent/starter-blocker-fixes`: the `USE_ENTITY_DATA_API` branch and its dead helpers were removed and the page always uses the REST list endpoint. Status OPEN to IN_PROGRESS, **not** FIXED: three of the four acceptance criteria are met, but the fourth — a contract test over `buildEntityDataUrl` call sites — is not, and `backlog:check` requires an active regression entry before a bug may claim `FIXED`. Also recorded that the three secondary defects are now reachable rather than resolved. **Not deployed** — production runs `main` at `949f461c`.
- 2026-08-29 - closed in SESSION-0076 on `agent/bugfix-runtime`. The `d3ffb3aa` fix was confirmed present in this branch's base (it reached `origin/develop` as `3fff9cc9`), the contract test over `buildEntityDataUrl` call sites was written and mutation-tested, and the dead `useEntityDataApi` prop was removed from `users-table.tsx` so criterion 3 holds at the source rather than by default. All four acceptance criteria met. Status IN_PROGRESS to FIXED, disposition DONE. **Not deployed.**

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0107]]
- Modules — [[tenant-application]]
- Regression — REG-313 (see the regression register)

<!-- GRAPH:END -->
