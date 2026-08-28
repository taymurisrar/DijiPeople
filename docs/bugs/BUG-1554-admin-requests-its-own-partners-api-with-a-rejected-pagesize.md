---
ID: BUG-1554
aliases: [BUG-1554]
Title: Admin requests its own partners API with a rejected pageSize
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [partners]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-291
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1554 — Admin requests its own partners API with a rejected pageSize

> **Architect triage, 2026-08-27 — `DEFER`.** An unconditional 400 on a sparse screen. Noise, not breakage.


## Summary

The admin console calls its own partners API with `pageSize=5`, and the API
rejects any page size below 10. The request fails with 400 every time the screen
loads. The client and the server disagree about a constraint that is entirely
internal to the product.

## Expected Behavior

The admin console requests page sizes its own API accepts. A validator bound
that the UI cannot satisfy is either wrong or the UI is.

## Actual Behavior

`GET /api/platform-runtime/partners` is requested with `pageSize=5` and returns
400. The failure is recorded in the platform error log.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open a screen that loads the partners list with a five-row page — the
   dashboard-style summary reproduces it.
3. Observe the 400 in the network panel, or find the entry in
   Settings → Monitoring.

## Evidence

Observed on production, 2026-08-26, in the platform error log against
`/platform-runtime/partners`, with the rejected `pageSize=5` and the validator's
minimum of 10.

## Root Cause

Not established. Either the minimum page size of 10 is an arbitrary bound that
should not exist, or a summary component is requesting a preview-sized page from
a list endpoint that was only designed for full pages. Which is intended has not
been confirmed.

## Impact

A partners summary fails to load wherever it is rendered. Partner data is sparse
today, so the visible consequence is small, but the failure is unconditional and
adds noise to the error log — which raises the cost of finding real incidents,
particularly while [[BUG-1542]] makes the log hard to work.

## Affected Areas

- `apps/admin` — whichever surface requests five partner rows
- `services/api/src/modules/partners`
- The pagination DTO carrying the minimum bound

## Proposed Resolution

Decide whether a page size below 10 is legitimate. If it is, relax the
validator; if it is not, fix the caller to request a permitted size and take the
rows it needs.

A lower bound on page size protects nothing on its own, so the validator is the
more likely side to be wrong — but that should be confirmed rather than assumed.

## Acceptance Criteria

- The partners summary loads without a 400.
- Client and validator agree on the permitted page size range.
- No unconditional 400 for this route appears in the error log.

## Regression Coverage

None yet. Needs a test asserting the page sizes admin requests are within the
range its API accepts. Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

Contributes to the error-log noise described in [[BUG-1542]].

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`. This record asked which side was
wrong rather than assuming; the validator was.

`PartnerQueryDto.pageSize` carried `@Min(10)`. Every other query DTO in the
repository uses `@Min(1)` — a census found two `Min(1)` against this one
`Min(10)` — so it was an outlier rather than a rule, and the admin console
asking for `pageSize=5` was reasonable.

A *lower* bound on a page size protects nothing: a small page is a small
query. The upper bound does protect something and stays, because an unbounded
page size is a way to ask for the whole table.

Guarded by REG-291.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `services/api/src/modules/super-admin/onboarding-prerequisites.spec.ts` ran and passed, as part of `npm --workspace api run test` (2016 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. The check is one screen load: the partners API should
answer `pageSize=5` with 5 rows rather than a 400.

Worth confirming there is no *other* caller relying on the old floor to be
rejected — there should not be, since the floor rejected valid requests rather
than protecting anything.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - un-deferred: the partners pageSize floor was an outlier and is now Min(1), matching every other query DTO. REG-291.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `services/api/src/modules/super-admin/onboarding-prerequisites.spec.ts`

Proven by:

- `npm --workspace api run test` — 2016 passing

**What this does not establish.** No screen was opened. A guard that reads
source and asserts a string is weaker evidence than one that runs the code, and
this sweep does not distinguish between them — it establishes that the fix is
still present and its test still passes, which is what separates a real fix from
one that was silently reverted. Behaviour against production remains unverified
here, and a browser QA pass would still be worth having.

Part of a sweep over all 48: every one of the 206 regression test files named in
the register was confirmed to exist, and every suite containing one was run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[partners]]
- Regression — REG-291 (see the regression register)

<!-- GRAPH:END -->
