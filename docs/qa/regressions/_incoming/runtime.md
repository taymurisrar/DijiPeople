# Incoming regression entries — SESSION-0076, `agent/bugfix-runtime`

Staged here rather than appended to `../index.md` directly: ten agents were
burning down bugs concurrently, and ten appends to one file conflict on every
line. The Architect merges this into the register centrally. Ids come from the
reserved range REG-313 to REG-317; REG-317 was not needed and is unused.

Four entries cover five bug records. BUG-2004 and BUG-2014 share REG-314
because they are one root cause seen twice, in the way REG-305 already covers
two records.

---

### REG-313 — An entity-data call site naming an entity the registry never held

| | |
|---|---|
| **Bug class** | `unchecked-cross-workspace-contract` |
| **Module** | `apps/web`, `services/api` data |
| **Bug record** | BUG-2003 |
| **Root cause** | `/users` fetched the generic entity-data endpoint for the logical entity `users`. `ENTITY_REGISTRY` in `services/api/src/modules/data/entity-registry.ts` has only ever held one entity, `employees`, so `GET /data/users` returned 404 before a single row was read. The 404 became an `ApiRequestError` thrown uncaught inside an async Server Component, which puts an error row in the RSC Flight stream and renders the boundary. Not data-dependent: it failed for every tenant, with zero users or ten thousand. It type-checked perfectly, because `entityLogicalName` is a plain `string` on both sides of a contract that spans two workspaces and was enforced in neither. |
| **Regression test** | `apps/web/app/components/entity-data/entity-registry-contract.spec.ts` |
| **Scenario** | Every `buildEntityDataUrl({ entityLogicalName })` call site under `apps/web/app` and `apps/web/lib` names an entity `ENTITY_REGISTRY` declares. Two vacuity guards sit above it: the registry parse must have returned entities and must include `employees`, and the source scan must have found at least one call site. |
| **Proven to fail without the fix** | Mutation-tested: changing `employees/page.tsx:234` to `entityLogicalName: "users"` — which is precisely this defect — fails the suite with `"entity": "users"` in the diff. Restored afterwards. |
| **Note** | **The two vacuity guards are the load-bearing part.** This test is built on a regex over source text, and a regex that matches nothing is green: without them, deleting the registry or breaking the scan would report the class closed. The registry is read out of the API **source** rather than imported, because `apps/web` does not depend on `services/api` and must not start it — the cost is that the parse is textual, which is exactly why it must assert it parsed something. The fix taken was neither of the two the record proposed: rather than registering a `users` entity or deleting the page, the branch that asked for the entity was removed, which does not pre-empt ITEM-0107's decision about whether this screen survives at all. **Three secondary defects on that screen are unfixed and now reachable**, recorded in BUG-2003 rather than refiled: the `userRoles`/`employee` field mismatch, pagination the API never implemented, and `UsersFilterBar` imported and never rendered. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-runtime` |
| **Active** | yes |

### REG-314 — A product link resolving only through a sibling record route

| | |
|---|---|
| **Bug class** | `route-shadowing` |
| **Module** | `apps/web` runtime |
| **Bug record** | BUG-2004, BUG-2014 |
| **Root cause** | Three links pointed at paths with no page, so Next matched each against the sibling dynamic detail route with the literal path segment as the record id. `/approvals/new` was **generated**, not hand-written: `approvalRuntimeSpec` omitted `adapterCapabilities.disableCreate`, so the standard runtime emitted a `system.new` command and promoted it to a primary button; it resolved to `approvals/[approvalId]` with `approvalId === "new"`, fetched an approval that cannot exist, and threw uncaught into the error boundary. `/users/new` and `/users/import` came from the users command bar and the list empty state, resolved to `users/[userId]`, and rendered "ACCESS DENIED — You cannot view this user record" over a 404, telling an administrator they lacked a permission they held for a record that never existed. |
| **Regression test** | `apps/web/lib/routing/route-integrity.spec.ts`, over the route resolver in `apps/web/lib/routing/app-route-table.ts` |
| **Scenario** | Two blocks. For every `StandardModuleRuntimeSpec` in both spec files, either `adapterCapabilities.disableCreate` is declared or `<routeBase>/new` resolves to a real page **without** a dynamic folder consuming its last segment — 21 modules. And every literal internal link in `apps/web/app` — `href`-ish properties, `router.push`/`redirect` calls, and named route constants — resolves to a page under the same condition: 50 links. Both blocks assert they found something to check, because an `it.each` over an empty array is green. |
| **Proven to fail without the fix** | Mutation-tested once per record. Removing `adapterCapabilities.disableCreate` from `approvalRuntimeSpec` fails with `"routeBase": "/approvals"` and `finalSegmentDynamic: true`. Pointing `USER_CREATE_ROUTE` back at `/users/new` fails with `"reason": "matched by (authenticated)/users/[userId]"`. Both restored afterwards. |
| **Note** | **The scan only sees literal strings, and that is deliberate.** A path built from a template literal is not checked, because a path built around a record id is not the mistake this looks for — so this catches this defect and every copy of its shape, not every possible dead link. `/settings/**` is exempted with a comment: the settings runtime serves static-looking paths through `[category]/[settingGroup]/[item]`, where a path naming nothing in the registry is answered by `getSettingsRuntimeItem` returning `notFound()`, which is the opposite of this defect rather than an instance of it. BUG-2014's fix points **New** at `/settings/security-access/identities/users/new`, which resolves through that same dynamic pattern; the Architect confirmed both that `settings/[category]/[settingGroup]/[item]/new/page.tsx` exists and that `next.config.ts` already redirects the users *list* onto the same pattern, where `identities` likewise has no concrete directory — so the product already depends on this resolution and the retarget is not a novel bet. **What is not covered by a test:** the page-level not-found rendering that both fixes added — `approvals/[approvalId]` answering a 404 or 400 with a not-found state, and `users/[userId]` splitting 404 from 403 — is React server-component rendering, and `apps/web` has no jsdom, so nothing asserts it. No create page was built for either module: approvals must not have one, and building two bespoke pages under `/users` would be the wrong thing to leave behind if ITEM-0107 redirects that tree. `Data > Import` was removed outright with its `canImport` gate, there being no users import screen anywhere to point it at. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-runtime` |
| **Active** | yes |

### REG-315 — A server failure classified by a message React had already deleted

| | |
|---|---|
| **Bug class** | `unclassifiable-error-surface` |
| **Module** | `apps/web` |
| **Bug record** | BUG-2013 |
| **Root cause** | `classifyDashboardError` decided what to show by string-matching `error.message` against session-expired, access-denied, not-found and api-error patterns. For anything thrown in a Server Component the message it receives is always React's production placeholder — "Minified React error #441…" — which contains none of those substrings, by design, so server detail does not leak. Every server-side 401, 403, 404 and 500 on every route under `(authenticated)` therefore fell through all four branches and rendered one identical "UNEXPECTED ERROR" screen. Separately, the status tests sat **inside** each branch, below the message heuristics of the branch above, so a 404 whose message happened to contain the word "permission" was answered with ACCESS DENIED. |
| **Regression test** | `apps/web/app/(authenticated)/_lib/classify-dashboard-error.spec.ts` |
| **Scenario** | Both the minified and un-minified #441 placeholders, quoted verbatim, resolve to a deliberate `server-error` variant and explicitly **not** to the `unexpected` fall-through. An explicit HTTP status outranks every message heuristic, including a 404 whose message says "permission". The four message branches stay reachable for client-originated failures, and the fall-through stays reachable. |
| **Proven to fail without the fix** | Mutation-tested: restoring the original classifier verbatim — one branch per variant, each testing status, code and message together in the old order — fails four of thirteen assertions: both placeholder cases, the 404-under-ACCESS-DENIED case, and the greedy `api` substring case. A first, less faithful reconstruction that hoisted all the status tests above all the message tests failed only two, and accidentally fixed the 404 case; the mutation was redone rather than accepted, because an unfaithful mutation understates what the guard is holding. Restored afterwards. |
| **Note** | **This is why the other two records here cost hours to tell apart.** BUG-2003 (an entity-registry mismatch on the API side) and BUG-2004 (a missing frontend route flag) are unrelated in every respect and presented as the same screen with the same error number. The classifier moved out of `error.tsx` into `_lib/` for a mechanical reason worth generalising: it could not be tested where it was, because `apps/web` jest is node-environment with no jsdom, so logic living inside a component is logic nothing can check. The message branches now carry a comment saying they are reachable only for client failures — the failure mode to guard against is someone adding a server-side condition to them, which would be dead code that looks alive. One narrowing beyond the record: `message.includes("api")` was dropped from the api-error branch, where it matched "rapid", "capital" and any message quoting an `/api/` URL, leaving the fall-through nearly unreachable. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-runtime` |
| **Active** | yes |

### REG-316 — A child record pre-filled with its parent's values

| | |
|---|---|
| **Bug class** | `undeclared-inheritance` |
| **Module** | `apps/web` runtime |
| **Bug record** | BUG-2012 |
| **Root cause** | `module-related-subgrid.tsx` handed the quick-create dialog the parent record **whole** as `contextValues`, and `module-quick-create-panel.tsx` spread it into the child form's initial value map. Any field name shared between parent and child therefore opened pre-filled with the parent's value and was posted with it unless the user noticed and overwrote it. Confirmed for Organization > Business Units and Business Unit > Departments (`name`, `description`), Department > Teams (`name`) and State > Cities (`name`, `isActive`, `sortOrder`). Nothing narrowed the set and nothing declared an intent to inherit anything: the inheritance was a consequence of two objects sharing a key. |
| **Regression test** | `apps/web/lib/runtime/related-record-create-values.spec.ts` |
| **Scenario** | The four confirmed collisions encoded as data, each asserting the posted body contains **only** the parent foreign key. A declared inheritance is carried through and nothing else travels with it. A draft value cannot overwrite the parent foreign key. A user's own edit beats an inherited value. Null and empty parent values are skipped rather than seeding a blank. |
| **Proven to fail without the fix** | Mutation-tested: making `resolveInheritedParentValues` return the parent record whole — the previous behaviour exactly — fails five of fifteen assertions, the four collisions plus the narrowing itself. Restored afterwards. |
| **Note** | **REG-305 is in this same code path and must not be undone by this fix.** The parent foreign key still reaches the server by both routes it did before: `buildQuickCreateValues` sets it last, so a draft value cannot displace it, and the data adapters still inject it when the configured create path did not consume it. REG-305's 39 assertions were re-run after this change and pass unchanged, and this suite carries two assertions of its own guarding the key. The mechanism chosen was a declaration — `RelatedSubgridMetadata.inheritParentFields` — rather than deleting the seeding, because some dialog will eventually want to inherit on purpose; the one deliberate inheritance that exists today, a project's `currencyCode` onto a `projectAssignment`, is on the assignment panel's path and was left alone as the precedent. **No subgrid declares the new field**, which is the correct starting state. **Two limits recorded rather than assumed:** the acceptance criterion that a second team can now be created from the same department without a 409 on a derived key is met at the cause — the name is no longer inherited, so nothing derives a colliding key from it — but was **not observed against a running API**; and nothing here identifies or repairs records already created with an inherited value, such as a business unit named after its organization, which is indistinguishable from a deliberate choice without knowing when it was written. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-runtime` |
| **Active** | yes |
