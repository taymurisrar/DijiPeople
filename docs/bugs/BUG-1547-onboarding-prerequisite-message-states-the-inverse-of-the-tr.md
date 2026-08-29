---
ID: BUG-1547
aliases: [BUG-1547]
Title: Onboarding prerequisite message states the inverse of the truth
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [onboarding]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-290
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1547 — Onboarding prerequisite message states the inverse of the truth

> **Architect triage, 2026-08-27 — `DEFER`.** Same form as BUG-1545. Confirm whether the evaluation is inverted or only its label when that is fixed.


## Summary

The onboarding prerequisite message reports the opposite of the state it is
describing. When industry and company size are *not* selected, it says
"Onboarding prerequisites are not complete: Industry is selected, Company size
is selected". The header contradicts the list beneath it, and the list states
the inverse of the truth.

## Expected Behavior

A prerequisite message names what is missing, in terms that agree with its own
header — for example "Industry is not selected".

## Actual Behavior

The message reads "Onboarding prerequisites are not complete: Industry is
selected, Company size is selected" while neither is selected.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open Onboarding and start a new record.
3. Leave Industry and Company size unselected.
4. Save.
5. Read the prerequisite message.

## Evidence

Observed on production, 2026-08-26, on the Onboarding save path. The message was
captured verbatim as quoted above, with both fields confirmed unselected on the
form at the time.

## Root Cause

Not established. The wording reads as a prerequisite label being rendered in its
satisfied form regardless of the evaluated result — but whether the label or the
evaluation is at fault has not been confirmed, and the distinction matters: if
the evaluation is wrong, something may be passing prerequisites it should fail.

## Impact

An operator reading the message is told the two things blocking them are already
done. The most likely response is to conclude the form is broken and stop, which
makes this worse than a message that said nothing at all.

The possibility that the evaluation itself is inverted — rather than only its
label — should be settled before this is dismissed as a copy defect.

## Affected Areas

- `services/api/src/modules/onboarding` — prerequisite evaluation
- `apps/admin` — the Onboarding form and its error surface

## Proposed Resolution

Confirm first whether the prerequisite evaluation is correct and only the
rendering is inverted. Fix whichever is wrong, and make the message name the
unmet condition in the negative so it agrees with its header.

## Acceptance Criteria

- With Industry and Company size unselected, the message names both as not
  selected.
- With both selected, no prerequisite message appears.
- The header and the itemised list never contradict each other.

## Regression Coverage

None yet. Needs a test asserting the message text for both the satisfied and
unsatisfied cases. Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

Shares the onboarding form with [[BUG-1546]] and [[BUG-1548]].

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`. This record asked which half was
wrong before patching either; the answer is neither the evaluation nor the
rendering, but the reuse of one string for two purposes.

`missingItems` filters `!passed` and always did — the evaluation was correct.
The `label` on each check states the condition positively ("Industry is
selected") because it sits beside a tick or a cross in the checklist, and the
failure message listed those same labels under "prerequisites are not
complete". So the message announced that the missing things were present.

Each check now carries an `unmet` phrasing as well, and the message is built
from that. Both stay: they are read in two directions, and deleting the positive
one would break the checklist to fix the message.

Guarded by REG-290.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `services/api/src/modules/super-admin/onboarding-prerequisites.spec.ts` ran and passed, as part of `npm --workspace api run test` (2016 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. `onboarding-prerequisites.spec.ts` asserts every
check has both phrasings, that the message is built from `unmet`, that each
unmet phrase carries a negation, and — the one that matters — that no pair is
identical bar capitalisation, which is this defect returning.

The browser check is a customer with no industry and no company size: the list
after the colon should name what is missing.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - un-deferred: the failure message has its own phrasing rather than reusing the checklist labels. REG-290.

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

- Regression — REG-290 (see the regression register)

<!-- GRAPH:END -->
