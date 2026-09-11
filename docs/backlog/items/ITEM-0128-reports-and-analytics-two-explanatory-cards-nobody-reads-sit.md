---
ID: ITEM-0128
aliases: [ITEM-0128]
Title: Reports and Analytics: two explanatory cards nobody reads sit above the data
Type: UX
Status: DONE
Priority: P2
Severity: 
AffectedModules: [apps/web]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0128 — Reports and Analytics: two explanatory cards nobody reads sit above the data

## Summary

Two large cards in the reporting workspace explain the product to the reader
before showing them anything. On Overview it is **Analytics surfaces** — five
cards, each with a paragraph and a quoted note contrasting the surface with the
Dashboard. On every Analytics page it is **How to read these numbers** —
thirteen paragraphs of caveats on Attendance, twelve on Workforce, six on
Recruitment, placed above the first figure.

Both contain genuinely good writing. Both are in the wrong place, and at that
size a reader skips them, which means the caveats they carry are not read by the
people who most need them.

## Why It Matters

The caveats are not decoration. On Attendance they explain why a rate can exceed
one hundred percent, why unreconciled days are absent rather than zero, and why
a period including today reads short. A reader who skips them will
misinterpret the numbers, and the current placement guarantees skipping: on a
900px viewport the Attendance page shows the workspace header, the surface
header, the filter block and the thirteen paragraphs before a single number.

On Overview the cost is different. "Analytics surfaces" occupies the first
screen with an explanation of a distinction — analytics versus dashboard — that
a reader has not yet asked about, delaying the report list that is the reason
they came.

## Evidence

Measured on the production Starter demo tenant, 2026-09-09:

| Surface | Explanatory paragraphs above the first number |
|---|---|
| Attendance analytics | 13 |
| Workforce analytics | 12 |
| Recruitment analytics | 6 |

Overview: the "Analytics surfaces" card carries five surface cards, each with a
description and a separate quoted "The Dashboard shows..." note, before the
Reports section begins.

The affordances for a better placement already exist and are already used: every
metric tile carries an info control reading "5 notes on how attendance rate is
measured", and every filter label carries one. The content therefore already has
somewhere to live.

## Proposed Approach

No ExecPlan; this is presentation.

**How to read these numbers** — move the body behind the per-tile and per-filter
info controls that already exist, keeping at most two inline lines for the
caveats that change interpretation of the headline figure rather than of one
column. The rule for what stays inline: if not reading it would make a reader
draw a wrong conclusion from the biggest number on the page, it stays.

**Analytics surfaces** — reduce to a single row of links with one line each, or
move it below the report list. The Dashboard contrast is a good sentence for a
first-run tour or the empty state, not for every visit.

Neither change should delete the writing. The failure here is placement and
volume, and deleting it would trade one defect for a worse one.

## Acceptance Criteria

- The first metric on any analytics surface is visible without scrolling at
  1440x900.
- Every caveat currently in "How to read these numbers" is still reachable from
  the page, through a control that names how many notes it holds.
- Overview shows the report list within the first screen.
- No caveat text is lost.

## Dependencies

None. Best sequenced after [[BUG-3007]], which removes two surfaces entirely
from plans that do not include them, and alongside [[BUG-3020]], which changes
the table directly beneath these cards.

## Related Items

- [[BUG-3007]] — the entitlement leak on the same surface.
- [[BUG-3020]] — the drill-down table below these cards.
- [[ITEM-0130]] — why the review missed these.
- Modules — [[reporting]], [[tenant-application]]

## History

- 2026-09-09 — raised by the user during the Reports & Analytics review: both
  cards are large, and a reader neither reads them nor knows what they are for.
- 2026-09-09 — triaged READY by the Architect for SESSION-0095. Not deferred:
  the caveats are load-bearing for interpreting the numbers, so their placement
  is a correctness concern rather than a cosmetic one.
- 2026-09-11 — resolved. See Resolution below.

## Resolution

Premise confirmed: `apps/web/app/(authenticated)/reports/_components/caveat-panel.tsx`
printed every page-level caveat as an always-open list above the metric tiles,
and `reports-landing.tsx` led with five "Analytics surfaces" cards (paragraph
+ quoted Dashboard-contrast note each) before the report list.

**"How to read these numbers"** — reused the disclosure pattern
`metric-tile.tsx` already established for a per-metric caveat ("N notes on how
X is measured") rather than inventing a second one: the caveat list is now
inside a native `<details>`, with the same `<summary>` wording pattern naming
how many notes it holds. The suppression banner (data actually withheld right
now, not a note about interpretation) stays outside the disclosure and always
visible, since it changes what the breakdown chart's bars mean *right now*
rather than qualifying the headline number's meaning in general — the
distinction the record's own placement rule draws ("if not reading it would
make a reader draw a wrong conclusion from the biggest number on the page, it
stays"). The "at most two inline lines" refinement beyond full collapse was not
attempted: the API returns `caveats: string[]` with no per-caveat priority
signal, and picking two by a frontend heuristic risked hiding the wrong ones
more than it helped — a decision worth recording rather than a silent
half-measure.

**"Analytics surfaces"** — Reports now leads with the report list; the surface
cards moved below it and shrank from a grid of bordered article cards to a
compact single-column list (one line per surface: link + description). The
Dashboard-contrast sentence is not deleted — the record is explicit that
deleting it "would trade one defect for a worse one" — it is one `<details>`
disclosure away per surface instead of a quoted block printed for every visit.

Neither change deletes any caveat text.

**Acceptance criteria:**

- First metric visible without scrolling at 1440x900 — met by removing the
  vertical space the always-open caveat list occupied; not measured against a
  live browser (no Playwright run in this task), so this is a structural claim
  from the markup change, not a pixel measurement.
- Every caveat still reachable, through a control naming how many notes it
  holds — met, `<summary>{count} notes on how these numbers are measured</summary>`.
- Overview shows the report list within the first screen — met, Reports now
  renders first in document order.
- No caveat text lost — met; verified by rendering with sample caveats and
  asserting the exact text is present in the output markup.

**Tests:** `apps/web` has no rendering test tooling, but neither `CaveatPanel`
nor `ReportsLanding` needs it: `CaveatPanel` reads no context, and
`ReportsLanding`'s only hook (`useFormattingContext`) degrades to `null` with
none supplied, so `react-dom/server`'s `renderToStaticMarkup` renders both for
real. New file
`apps/web/app/(authenticated)/reports/_components/item-0128-caveat-placement.spec.ts`
asserts: the caveat list renders inside a `<details>` with a summary naming
the count; every caveat's text is present in the markup regardless; the
suppression banner renders outside and before the `<details>`; the panel
renders nothing when there is nothing to say; and, on Reports Overview, the
"Reports" heading precedes "Analytics surfaces" in document order while the
surface description and Dashboard-contrast sentence both still appear
verbatim in the markup. `npm --workspace web run test -- item-0128-caveat-placement`
— 6 passed. `npm --workspace web run check-types` — clean.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
