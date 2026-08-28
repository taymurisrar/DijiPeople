---
ID: BUG-1753
aliases: [BUG-1753]
Title: Lookup display labels mangle acronyms and numeric ranges across the admin console
Status: VERIFIED
Severity: LOW
Priority: P3
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-285
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1753 — Lookup display labels mangle acronyms and numeric ranges across the admin console

## Summary

The label humaniser that turns stored lookup values into display text destroys
acronyms and range separators. Company sizes render as "11 50" instead of
"11-50", industries as "It / Software" instead of "IT / Software", sources as
"Linkedin" and "Whatsapp Inquiry", and a contract type as "Nda". This is display
only — the values submitted and stored are correct — but it appears in every
dropdown in the console.

## Expected Behavior

A lookup renders its label the way the business writes it: `IT / Software`,
`11-50`, `LinkedIn`, `WhatsApp`, `NDA`.

## Actual Behavior

Acronyms are title-cased to a single capital, and the hyphen in a numeric range
is replaced with a space so the range reads as two numbers.

## Reproduction

1. Platform Admin, **Leads → New Lead**, **Commercial** tab.
2. Open **Industry** — the list contains "It / Software".
3. Open **Company size** — the options are "1 10", "11 50", "51 200", "201 500",
   "501 1000", "1001 5000", "5000+".
4. Open **Source** — the list contains "Linkedin" and "Whatsapp Inquiry".
5. **Contracts → New → From template** — the template list contains
   "NDA · Nda", showing the template's own name correctly beside the mangled
   contract type.

## Evidence

Display is wrong; the submitted payload is right. Captured request body from the
same form, after selecting the mangled labels:

```json
{"values":{ ... ,"industry":"IT / Software","companySize":"11-50",
"source":"Manual Entry", ... },"mode":"create"}
```

So `IT / Software` and `11-50` are the stored values, and only the rendering
differs. "5000+" survives because it contains no separator to lose and no letters
to case.

"NDA · Nda" is the clearest single piece of evidence: the same string is
rendered correctly as a template name and incorrectly as a type label, side by
side in one option.

## Root Cause

Not established precisely. The symptom is consistent with a single humanise
helper that lower-cases a value, splits on separators and capitalises the first
letter of each word — which turns `IT` into `It`, `LINKEDIN` into `Linkedin`,
and treats the hyphen in `11-50` as a word separator that is then replaced by a
space rather than preserved.

## Impact

Cosmetic but pervasive: it affects every enum-backed dropdown in the admin
console. "11 50" is the worst of them, because a range rendered as two
space-separated numbers is genuinely ambiguous rather than merely ugly. On a
console shown to customers or used for demos, it reads as unfinished.

## Affected Areas

The shared lookup label formatter in `apps/admin`, and every dropdown that uses
it — industries, company sizes, lead sources, contract types, and others.

## Proposed Resolution

Preserve separators, and stop case-folding tokens that are already acronyms.
Prefer explicit display labels for the lookups that have a canonical spelling
(`IT / Software`, `LinkedIn`, `WhatsApp`, `NDA`) over trying to make a general
humaniser guess them.

## Acceptance Criteria

- Company sizes render with their separator: `11-50`, not `11 50`.
- Acronyms render as the business writes them: `IT`, `NDA`, `LinkedIn`,
  `WhatsApp`.
- A unit test covers the humaniser against these cases.

## Regression Coverage

None yet.

## Dependencies

None.

## Related Items

[[BUG-1747]] — a different rendering defect in the same form layer, where the
wrong control type is chosen rather than the wrong label.

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`.

`humanizeLabel` replaces the old `toLowerCase()`-then-capitalise, which
destroyed two things it should not have touched:

- **Ranges.** A hyphen between two digits joins them. `11-50` stays `11-50`; a
  hyphen anywhere else still separates words, so `PARTNER-REFERRED` still reads
  as two.
- **Acronyms.** Words with a canonical spelling are listed rather than guessed
  — `IT`, `NDA`, `LinkedIn`, `WhatsApp`, `SaaS` and a short table of others.
  This record preferred explicit labels over a cleverer general rule and it is
  right: no heuristic distinguishes `linkedin` → `LinkedIn` from `facebook` →
  `Facebook`.

Applied to the two humanisers that fill every dropdown — the registry's option
labels and the runtime form's fallback label.

**Not done:** six other copies of the same `toLowerCase()`-and-capitalise exist
in the admin app (dashboard, monitoring, signature detail, payment recheck,
events page, record status group). They render things other than lookup values,
which is outside what this record describes, and folding them in would be a
refactor rather than a fix. They are now the likeliest place for this to recur.

Guarded by REG-285.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `apps/admin/lib/runtime/humanize-label.spec.ts` ran and passed, as part of `npm --workspace admin run test` (379 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. `humanize-label.spec.ts` asserts every example this
record names — `11-50`, `IT / Software`, `LinkedIn`, `WhatsApp Inquiry`, `NDA` —
plus that ordinary values still read as they did, and that a word merely
*containing* an acronym is not corrupted ("EDIT" must not become "EDIT").

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  observed against production `e0aeabcd`.
- 2026-08-28 - one humaniser that keeps ranges and acronyms; six other copies elsewhere in the app deliberately untouched. REG-285.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `apps/admin/lib/runtime/humanize-label.spec.ts`

Proven by:

- `npm --workspace admin run test` — 379 passing

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

- Modules — [[platform-admin]]
- Regression — REG-285 (see the regression register)

<!-- GRAPH:END -->
