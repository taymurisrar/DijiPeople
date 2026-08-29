---
ID: BUG-1558
aliases: [BUG-1558]
Title: Admin list copy uses incorrect pluralisation and articles
Status: VERIFIED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [super-admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-283
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1558 — Admin list copy uses incorrect pluralisation and articles

> **Architect triage, 2026-08-27 — `DEFER`.** Copy.


## Summary

Admin list screens render ungrammatical copy: "1 records" where the count is
one, and "Create a invoice" where the article should be "an". Both are visible
on production screens an operator uses daily.

## Expected Behavior

Counts are pluralised according to their value, and articles agree with the noun
that follows.

## Actual Behavior

"1 records" appears on list screens showing a single row. "Create a invoice"
appears on the invoices screen.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open a list filtered to a single result and read the count.
3. Open Invoices and read the create copy.

## Evidence

Observed on production, 2026-08-26. Both strings were captured verbatim from
admin list screens.

## Root Cause

Not established, though the shape is familiar: a count string concatenating a
fixed plural, and an article hardcoded ahead of an interpolated entity name.
Neither has been located in the source.

## Impact

Cosmetic. It affects how finished the console feels rather than what an operator
can do. Recorded because the article defect is generated from an entity name,
which means it will recur for every entity beginning with a vowel rather than
being a single typo.

## Affected Areas

- `apps/admin` — list screen copy and empty-state copy
- Whichever shared component composes count and create strings

## Proposed Resolution

Pluralise the count on its value. For the article, either avoid the construction
entirely — "New invoice" needs no article — or select the article from the noun.
Avoiding it is simpler and reads better in a button.

## Acceptance Criteria

- A list showing one row reads "1 record".
- No admin screen renders "a" before a vowel-initial entity name.
- The fix holds for entity names added later, not only for invoices.

## Regression Coverage

None yet. A low-value candidate for a dedicated test; the fix should prefer a
construction that cannot be wrong over a test that checks it is not.

## Dependencies

None.

## Related Items

One of several presentation defects found in the same pass; see [[BUG-1556]] and
[[BUG-1559]].

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`.

The count pluralises on its value, so "1 record" and "2 records".

For the article, this record suggested avoiding the construction rather than
solving it. The construction turned out to be load-bearing in the empty-state
copy fixed alongside ([[BUG-1752]]), so the article is chosen from the word
instead — and chosen by *sound* rather than spelling, because the vowel rule
alone produces "an user" and "a hour". The handful of words where the two
disagree are listed.

Guarded by REG-283.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `packages/config/empty-list-message.test.js` ran and passed, as part of `node --test packages/config/…`.

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. `empty-list-message.test.js` asserts the article
selection, including the words where sound and spelling disagree.

The browser check is a list with exactly one record: it must read "1 record".

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - un-deferred: counts pluralise and the indefinite article is chosen from the noun's sound. REG-283.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `packages/config/empty-list-message.test.js`

Proven by:

- `node --test packages/config/…` — 11 of 12 files passing (the twelfth is ITEM-0092, unrelated)

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

- Modules — [[super-admin]]
- Regression — REG-283 (see the regression register)

<!-- GRAPH:END -->
