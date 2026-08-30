# QA Run — Admin console end-to-end, browser-driven

## Metadata

| | |
|---|---|
| Date / time | 2026-08-28T00:00Z |
| Branch | `agent/admin-console-e2e-qa` |
| Commit SHA | `912f4e610759e3809ad1a77d3123df253f34a158` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-admin-qa` |
| Environment | **Production.** API `e0aeabcd` per `/api/health`. Working tree clean apart from records written by this run. No local database used. Stripe live. |
| QA agent | qa |
| Scope | Every one of the 19 sidebar screens in Platform Admin, driven in a real browser; CRUD on plans, leads, customers and partners; the subscriptions and promotions questions; monitoring and support UI; and the browser retests the 2026-08-28 handoff asked for. **Not covered:** the tenant workspace (`apps/web`), for want of a tenant login. |

## Requirement

Establish whether the Platform Admin console is fit for go-live: whether every
sidebar screen works, whether records can actually be created, edited and
deleted, whether the dashboard tells the truth, and which of the eight defects
shipped in `e0aeabcd` behave in a browser rather than only in their own tests.

This run was asked to work autonomously, record every finding durably, clean up
its own test data, and end with a go/no-go verdict and an ordered list of
blockers.

## Risk Areas

- **Production, with live billing.** Every write was against real data. Destructive
  testing was confined to records this run created, except where a module offers
  no delete at all (see Known Limitations).
- The `e0aeabcd` release fixed eight defects proven by unit and mutation tests
  and never seen in a browser — the exact "passes its own test, fails in the
  product" risk the handoff names.
- `doc-code-drift`: several findings here turn on the difference between what a
  record claims was fixed and what the code path actually does.
- Relevant known patterns: [[BUG-0220]] (runtime payload versus DTO contract),
  [[BUG-1420]] (free-text severity), [[BUG-1425]] (unvalidated currency codes).

## Scenarios

Expected behaviour written before execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Every sidebar screen loads | UI-state | 19/19 render their own content | **PASS** | all 19 loaded; 1 console error in the whole session, and it was a deliberate 400 |
| S2 | A lead can be created | happy | lead is created | **FAIL** | `partnerId must be a UUID` → [[BUG-1742]] |
| S3 | A customer can be created | happy | customer is created | **PASS** | created `36f984ab`, deleted afterwards |
| S4 | A customer can be edited | happy | change persists | **FAIL** | `property originChannel should not exist`; read-back unchanged → [[BUG-1743]] |
| S5 | A customer can be deleted | happy | record removed | **PASS** | bulk delete; read-back 404 |
| S6 | A partner can be created | happy | partner is created with a valid currency | **FAIL** | only possible by typing a number into Currency; stored `currencyCode: "5"` → [[BUG-1747]] |
| S7 | A partner can be edited | happy | change persists | **FAIL** | `property partnershipModel should not exist` → [[BUG-1743]] |
| S8 | A partner can be deleted | happy | record removed | **PASS** | bulk delete; list 2→1 |
| S9 | A plan can be created and deleted | happy | full lifecycle | **FAIL** | create yields a plan with 0 prices; no delete route exists → [[BUG-1749]] |
| S10 | List pages offer bulk delete where appropriate | UI-state | enabled where safe, refused where not | **PASS (with a caveat)** | enabled and working on partners/customers; correctly disabled with a reason on plans; the confirm names no count → [[BUG-1756]] |
| S11 | The dashboard reports real revenue | contract | collected revenue matches payments | **FAIL** | dashboard "PKR 0" against QAR 160 collected → [[BUG-1745]] |
| S12 | Subscriptions carry a valid billing period | contract | periodEnd is one cycle after periodStart | **FAIL** | both subscriptions have periodStart == periodEnd == renewalDate → [[BUG-1744]] |
| S13 | A subscription record identifies its tenant and plan | UI-state | tenant and plan shown | **FAIL** | both render "Not set" while the list shows them → [[BUG-1748]] |
| S14 | Promotions work | happy | a promotion can be created and deactivated | **PASS** | created, listed as v1/Active, deactivated |
| S15 | Creating a promotion is a deliberate act | boundary | not global-and-live by default | **FAIL** | defaults publish a 10% global discount in one click → [[BUG-1751]] |
| S16 | The monitoring critical tile agrees with its own link | contract | count equals what the link shows | **FAIL** | tile 11, link shows 0 of 0, queue shows 25 → [[BUG-1750]] |
| S17 | The incident queue contains actionable incidents | UI-state | triage queue holds real failures | **FAIL** | 1,588 untriaged, dominated by routine 401s and unrouted 404s → [[BUG-1754]] |
| S18 | The plans list shows which plans are sellable | UI-state | publication status and sales model populated | **FAIL** | both columns empty for all 5 plans → [[BUG-1755]] |
| S19 | Empty lists do not blame absent filters | UI-state | says the module is empty | **FAIL** | admin always names filters → [[BUG-1752]] |
| S20 | Required fields are discoverable | UI-state | the failing field can be found | **FAIL** | failures on unselected tabs are unmarked → [[BUG-1746]] |
| S21 | Lookup labels render correctly | UI-state | `IT / Software`, `11-50` | **FAIL** | render as `It / Software`, `11 50` → [[BUG-1753]] |
| S22 | Incident titles deep-link (BUG-1419) | regression | queue filtered by reference | **PASS** | "Showing 1 of 1" → [[BUG-1419]] **VERIFIED** |
| S23 | Runtime validation names its fields (BUG-1422) | regression | per-field messages | **PASS** | per-field "This field is required." → [[BUG-1422]] **VERIFIED** |
| S24 | Country stores a name, not a UUID (BUG-1578) | regression | `country == "Qatar"` | **PASS** | confirmed via API → [[BUG-1578]] **VERIFIED** |
| S25 | Customer + provisioning template is refused (BUG-1541) | regression | `CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE` | **PASS** | refused, contract count unchanged → [[BUG-1541]] **VERIFIED** |
| S26 | Proxy routes do not break pages (BUG-1649) | regression | no content-encoding failures | **PASS (admin only)** | ~20 screens clean; tenant surface untested → [[BUG-1649]] |
| S27 | Empty tenant lists say "No records yet" (BUG-1654) | regression | filter-aware message | **BLOCKED** | needs a tenant login → [[BUG-1654]] |
| S28 | Critical severity counts agree (BUG-1420) | regression | counts agree regardless of case | **FAIL** | view fixed, overview metric not → [[BUG-1750]] |
| S29 | A fresh paid signup yields one CustomerAccount (BUG-1516) | regression | exactly one account | **BLOCKED** | not attempted; see Known Limitations |
| S30 | Runtime controls have accessible names (BUG-1423) | regression | controls are labelled | **FAIL** | no `<label>` elements at all → [[BUG-1423]] re-confirmed |

## Automated Suites

None run. This was a browser-driven QA pass against a deployed environment, not
a change to the repository; no code was modified, so no suite was relevant. The
records written by this run are validated by `npm run backlog:check` and the
Framework validation job, reported below.

## Manual Validation

**Access.** Platform admin at `admin.dijipeople.com`. Sessions ended three times
in roughly forty minutes, each at almost exactly the 900-second access-token
lifetime. Refresh-on-401 *is* implemented (`apps/admin/lib/server-api.ts:53-63`)
and the endpoint it calls works — posting a platform refresh token to
`/api/auth/refresh` returns 201, and `/admin/auth/refresh` correctly does not
exist. So the obvious explanation is wrong. The remaining candidate is that
"Remember me" was unticked. **Not established**, and deliberately not filed as a
bug on a guess; it needs one deliberate idle test each way.

**The dashboard.** Reported "Collected revenue PKR 0", "Outstanding PKR 0" and a
flat six-month trend. Invoices and Payments both show two records at QAR 80.00.
`getDashboardSummary()` filters every money aggregate on
`currency: reportingCurrency`, and production's stored `platform-defaults` row
is a Pakistan/PKR profile. The code default is correctly `QAR`; the stored row
overrides it. The settings screen prints both facts side by side — its footer
reads `Fallback values: QA, QAR, QAR reporting, Asia/Qatar, en-US`.

This run **did not change that setting**. Which currency the business reports in
is a commercial decision for the owner, not a QA call. It is one screen and it
is reversible.

**A correction made during the pass.** The first snapshot of the Plans list
showed "0 records" and empty cells, and was very nearly filed as a defect. It
was a mid-load skeleton; a screenshot a moment later showed all five plans
rendering correctly. Every subsequent list finding in this run was confirmed by
screenshot rather than by the first snapshot returned.

Two other things checked and **not** filed, because they turned out to be
correct: invoice numbers like `ZBOJ8MVI-0001` are Stripe's own numbering
mirrored in, not a failure of the `INV-` generator; and a 90-second navigation
timeout was an unsaved-changes `beforeunload` guard doing its job, not a hang.

**Relationship to the 2026-08-26 run.** That run recorded S5/S6 "a customer can
be created, edited … and deleted — PASS" and "an edit answering 2xx actually
persists — PASS". Both were exercised through the API, which succeeds when
`originChannel` is omitted. This run drove the browser form, which always sends
it. The two results are consistent; they test different paths, and [[BUG-1743]]
is the path a human uses.

## Regression Checks

| Record | Claimed | This run |
|---|---|---|
| [[BUG-1419]] | FIXED | **VERIFIED** in browser |
| [[BUG-1422]] | FIXED | **VERIFIED** in browser (client-side path; server-error surface still weak) |
| [[BUG-1541]] | FIXED | **VERIFIED** in browser (refusal half; success half deferred) |
| [[BUG-1578]] | FIXED | **VERIFIED** via API read-back |
| [[BUG-1649]] | FIXED | admin surface clean; tenant surface untested |
| [[BUG-1654]] | FIXED | tenant retest blocked; same defect found unfixed in `apps/admin` → [[BUG-1752]] |
| [[BUG-1420]] | FIXED | view fixed, overview metric still defective → [[BUG-1750]] |
| [[BUG-1516]] | FIXED | not retested |
| [[BUG-0220]] | VERIFIED | **defect class still live** on customers and partners → [[BUG-1743]] |
| [[BUG-1423]] | OPEN | re-confirmed live |
| [[BUG-1425]] | DEFERRED | **DEFER premise falsified** — now reachable → [[BUG-1747]] |
| [[BUG-1555]] | OPEN | confirmed live: `Enterprise+` is public with zero prices |

## Bugs Found

Sixteen records, all `TRIAGE_REQUIRED`:

| Record | Severity | Summary |
|---|---|---|
| [[BUG-1742]] | CRITICAL | Lead creation impossible — `partnerId: ""` |
| [[BUG-1743]] | CRITICAL | Customers and partners cannot be edited — [[BUG-0220]] class, unfixed beyond plans |
| [[BUG-1744]] | CRITICAL | Every subscription has a zero-length billing period |
| [[BUG-1745]] | HIGH | Dashboard reports zero revenue (PKR vs QAR) |
| [[BUG-1747]] | HIGH | Partner Currency is a required numeric input; stores a corrupt code |
| [[BUG-1749]] | HIGH | Admin creates plans that cannot be sold and cannot be deleted |
| [[BUG-1750]] | HIGH | Monitoring critical tile miscounts and links to nothing |
| [[BUG-1751]] | HIGH | A promotion goes live globally on creation, unsynced to Stripe |
| [[BUG-1755]] | HIGH | Plans list cannot show publication status or sales model |
| [[BUG-1746]] | MEDIUM | Required fields on unselected tabs are undiscoverable |
| [[BUG-1748]] | MEDIUM | Subscription record cannot resolve its own tenant or plan |
| [[BUG-1754]] | MEDIUM | Incident queue counts routine 401s and 404s as triage work |
| [[BUG-1756]] | MEDIUM | Bulk delete confirms without naming count or records |
| [[BUG-1757]] | MEDIUM | Promotions cannot be deleted; `DELETE` deactivates |
| [[BUG-1752]] | LOW | Admin empty states blame filters that are not set |
| [[BUG-1753]] | LOW | Lookup labels mangle acronyms and numeric ranges |

## Known Limitations

**Not tested, and why.**

- **The tenant workspace.** No tenant login was available; the owner's password
  is deliberately in no file and the owner was unavailable. This blocks
  QA-TENANT-018 and QA-TENANT-019 retests ([[BUG-1649]], [[BUG-1654]]) on the
  surface those scenarios actually name.
- **[[BUG-1516]] — a fresh paid signup.** Not attempted. It would create a real
  Stripe charge, a real customer account and a real tenant on production, and
  the tenant-erasure path was not exercised in this run, so the run could not
  guarantee it could clean up after itself. Deferred rather than done badly.
- **[[BUG-1541]] success half.** Creating an agreement from a *tenant* source
  should succeed, but contracts have `delete: false`, so proving it would leave
  an undeletable contract in production.
- **Tenant erasure and partner erasure.** Not exercised, for the same reason: no
  disposable tenant existed and creating one meant a real paid signup.
- **The desktop agent.** No release has ever been published, so install and
  auto-update are unexercised.

**Test data created and disposed of.**

| Record | Disposal |
|---|---|
| customer `36f984ab-0461-48db-a604-b85cc86b47ea` | **deleted**, read-back 404 |
| partner `56eb244b-12cb-4e23-96d5-0ab738794289` | **deleted**, list 2→1 |
| lead | never created — creation is broken, [[BUG-1742]] |
| plan | deliberately not created — plans cannot be deleted, [[BUG-1749]] |
| promotion `177c2e07-67d0-4a2f-be69-3e357fb0cac1` | **DEACTIVATED, NOT REMOVED** |

The promotion is residue this run could not clear. `DELETE` on a promotion
deactivates rather than deletes ([[BUG-1757]]), so
"QA E2E Promo 20260828 DELETE ME" remains in production with `isActive: false`.
It is inert — deactivated, never redeemed, `redemptionCount: 0` — but it is
there, and removing it needs a database-level delete. Stated plainly rather than
quietly left behind.

This run also generated roughly ten error-log incidents by probing endpoints,
including one reading
`Cannot GET /apiC:/Program%20Files/Git/super-admin/payments` — a shell
path-expansion mistake of the tester's, faithfully recorded as a production
incident awaiting triage. They are noise, and they are an unusually direct
illustration of [[BUG-1754]].

**Pre-existing test data found in production** (not this run's, and not removed):
plan `QA00591`; partner "QA Automation Co - IGNORE"; leads "demo", "kamsf",
"tes"; customers "QA E2E Customer 20260826", "QA E2E Signup 20260826" (×2) and
"QA E2E Signup B 20260826" (×2). The duplicated pairs are the [[BUG-1516]]
shape, but they are dated 2026-08-26 — **before** the fix shipped in `e0aeabcd`
— so they are historical residue, not evidence the fix failed.

## Final QA Verdict

**FAIL — the Platform Admin console is not ready for go-live.**

Every sidebar screen loads, navigation is sound, the visual design is
consistent, and several things are genuinely well built: the disabled-with-a-
reason Delete on plans, the [[BUG-1541]] refusal dialog, the settings workspace,
and the monitoring overview's structure.

But three of the four record types an operator works with cannot complete a
basic lifecycle: leads cannot be created, customers cannot be edited, partners
cannot be edited and can only be created by corrupting a field. Separately, the
dashboard reports no revenue while revenue exists, and every subscription in
production carries a zero-length billing period. Those last two are not cosmetic
— they are the platform misreporting its own commercial state.

QA does not prioritise. The ordered blocker list for the owner is in the run
summary accompanying this record; every item in it is one of the records above.

## Follow-up

- Architect triage of all sixteen records; none may stay `TRIAGE_REQUIRED`.
- Re-triage [[BUG-1425]] — its DEFER premise no longer holds.
- Consider whether [[BUG-0220]] should be reopened or superseded by
  [[BUG-1743]], given its fix was per-module and its regression test cannot
  generalise.
- Obtain a tenant login so QA-TENANT-018 and QA-TENANT-019 can be closed.
- Decide whether a disposable tenant can be provisioned for destructive tests,
  so [[BUG-1516]] and the erasure paths stop being permanently untestable.
- Remove the promotion this run could not delete.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[BUG-0220]] · [[BUG-1419]] · [[BUG-1420]] · [[BUG-1422]] · [[BUG-1423]] · [[BUG-1425]] · [[BUG-1516]] · [[BUG-1541]] · [[BUG-1555]] · [[BUG-1578]] · [[BUG-1649]] · [[BUG-1654]] · [[BUG-1742]] · [[BUG-1743]] · [[BUG-1744]] · [[BUG-1745]] · [[BUG-1746]] · [[BUG-1747]] · [[BUG-1748]] · [[BUG-1749]] · [[BUG-1750]] · [[BUG-1751]] · [[BUG-1752]] · [[BUG-1753]] · [[BUG-1754]] · [[BUG-1755]] · [[BUG-1756]] · [[BUG-1757]] · [[QA-TENANT-018]] · [[QA-TENANT-019]]

<!-- GRAPH:END -->
