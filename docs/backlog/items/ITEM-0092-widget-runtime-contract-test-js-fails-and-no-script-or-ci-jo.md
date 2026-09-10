---
ID: ITEM-0092
aliases: [ITEM-0092]
Title: widget-runtime-contract.test.js fails and no script or CI job runs it
Type: TEST_GAP
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [pkg:config, apps/web]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-24
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0092 — widget-runtime-contract.test.js fails and no script or CI job runs it

## Summary

`packages/config/widget-runtime-contract.test.js` fails on `origin/develop` at
`004ee666`, and nothing runs it. It has no entry in the root `package.json`
scripts — every sibling config test has one (`test:runtime-schema`,
`test:platform-domains`, `test:security-headers`, `test:app-urls`,
`test:database-urls`, `test:env-examples`) — and no CI job references it. It
only fails if somebody runs `node --test packages/config/` by hand, which is how
it was found.

## Why It Matters

Two separate problems wearing one coat.

**The test is failing.** It asserts a runtime contract across
`apps/web/lib/runtime/modules/` and the standard module pages, and at least one
assertion no longer matches the code: it expects
`buildPublishedStandardRouteRuntime` in the monthly timesheet detail page, which
now calls `apiRequestJson` directly. Either the contract moved and the test is
stale, or the page drifted off the contract. **Which of those is true is exactly
what nobody has had to decide**, because nothing has run the test.

**The test is unreachable.** An assertion that no pipeline evaluates is not a
guard, and this repository has a documented history with that shape — the
`forwarded-headers.invariant.spec.ts` header records a comment claiming a
build-failing guarantee that no file implemented. A test that exists, fails, and
is never run is the same failure with more mass: it looks like coverage in a
directory listing.

## Evidence

- `node --test packages/config/widget-runtime-contract.test.js` → `fail 1` at
  `004ee666`, with no local modifications to any file it reads.
- The expected token is `buildPublishedStandardRouteRuntime`; the actual source
  it reads begins `import { apiRequestJson } from "@/lib/server-api";`.
- `grep -n "widget-runtime-contract" package.json .github/workflows/ci.yml` →
  no match.

## Proposed Approach

Decide the direction before touching either side, because the fix differs
entirely:

1. Establish whether the standard-route runtime contract still applies to the
   monthly timesheet detail page. The runtime module registry and
   `standard-module-specs.ts` are the authority, not the test.
2. If the contract holds, the page is the defect — raise a bug and fix the page.
3. If the contract moved, the test is stale — update it to the current contract
   rather than deleting the case.
4. Either way, wire it into `package.json` and the CI runtime-schema job so it
   can never fail unobserved again.

## Acceptance Criteria

- `node --test packages/config/widget-runtime-contract.test.js` passes.
- An npm script runs it and a CI job depends on that script.
- Whichever side was wrong is recorded — a bug record if the page drifted, a
  note in the test if the contract did.

## Dependencies

None.

## Related Items

[[tenant-application]] · [[settings]]

## Resolution

Decided (1): the contract moved, the test was stale. `git log -p --follow` on
`apps/web/app/(authenticated)/timesheets/[timesheetId]/page.tsx` shows commit
`a8c04f16` ("major release", 2026-07-29) deliberately replaced
`StandardModuleRecordPage` + `buildPublishedStandardRouteRuntime` with a
bespoke `TimesheetMONTHLYEditor` grid — a month's worth of daily entries edited
in place is not the single-record read/edit shape the generic runtime
expresses, which is exactly the bespoke-page exception `AGENTS.md` names. The
other three pages in the same assertion (`leaves`, `attendance`, `projects`)
still call `buildPublishedStandardRouteRuntime` and were left unchanged.

`packages/config/widget-runtime-contract.test.js` now asserts the *current*
contract for the timesheet detail page — it must **not** call
`buildPublishedStandardRouteRuntime` and must render `TimesheetMONTHLYEditor`
— with a comment recording why, so a future regression here is a real defect
rather than a permanently-red, unexamined assertion. No bug record was raised
against the page, because the page is not the defect: the test was.

Wired (4): `npm run test:widget-runtime-contract` (`package.json`) runs `node
--test packages/config/widget-runtime-contract.test.js`, and the `test-runtime`
CI job — already a member of the `CI required gate`'s `needs` list
(`.github/workflows/ci.yml:1163`) — now runs it as a step, alongside its
sibling `packages/config` contract tests. It cannot fail unobserved again.

## History

- 2026-08-24 — found by SESSION-0047 while running the full `packages/config`
  suite during the session close-out, and filed rather than fixed. It is outside
  that session's scope — it belongs to none of the sessions being closed — and
  choosing between "the page is wrong" and "the test is wrong" is a
  product-contract decision, not a repair. `PLAN_REQUIRED` with the evidence
  attached, so the next agent starts from the question rather than the symptom.

- 2026-09-11 — resolved. The contract moved (a8c04f16); the test was stale and
  now asserts the current, deliberate contract. Wired into `package.json` and
  the `test-runtime` CI job.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[deployment-architecture]], [[tenant-application]]

<!-- GRAPH:END -->
