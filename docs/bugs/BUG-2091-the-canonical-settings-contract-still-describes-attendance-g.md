---
ID: BUG-2091
aliases: [BUG-2091]
Title: The canonical settings contract still describes attendance geolocation as configurable and Remote-Hybrid only
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: DOCUMENTATION
Source: ARCHITECT
DetectedDate: 2026-08-29
DetectedInSha: 70391242
AffectedModules: [docs/architecture]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-2091 — The canonical settings contract still describes attendance geolocation as configurable and Remote-Hybrid only

## Summary

`AGENTS.md` names `docs/architecture/settings-and-branding.md` "the canonical
contract for settings, branding and formatting". That document still describes
attendance geolocation as a tenant-configurable requirement that applies only to
Remote and Hybrid modes, with Office needing nothing but an active Work Site.
Since commit `a8c04f16` (2026-07-29) that has been false: location capture is a
mandatory integrity control for **all** self-service modes, including Office,
enforced by an unconditional throw that consults no setting at all.

Its implementation companion,
`docs/architecture/tenant-settings-attendance-runtime.md`, carries the same stale
claim in narrower words.

This is the `doc-code-drift` pattern
(`docs/qa/known-bug-patterns/doc-code-drift.md`): an instruction document
describing a repository state that does not exist, which agents then plan
against.

## Expected Behavior

The canonical settings contract describes the behaviour the code actually
enforces. Where the platform mandates a value, the document says it is mandated,
names the mechanism, and does not present it as tenant configuration.

## Actual Behavior

Both documents present location capture as conditional configuration:

- Office mode is described as requiring only an active Work Site. In the code it
  also requires a device position.
- Remote/Hybrid checkout geolocation is described as required "when configured".
  There is no "when" — the throw is unconditional.
- The nine settings and policy fields these sentences imply are live are read in
  **zero** enforcement branches.

An agent or engineer planning attendance work from these documents will conclude
that location capture can be turned off per tenant, and will write against a
mechanism that does not exist.

## Reproduction

Documentation defect; verified by reading, at `70391242`:

1. Open `docs/architecture/settings-and-branding.md` and read the "Attendance
   Rules" and "Attendance Runtime Consumption" sections (lines 302-323).
2. Open `services/api/src/modules/attendance/attendance.service.ts:3645` and read
   `validateAttendanceLocationPayload` through to its throws at `:3702` and
   below.
3. The two disagree: the document makes the requirement conditional and
   mode-scoped; the code makes it unconditional.

## Evidence

At `70391242`:

- `docs/architecture/settings-and-branding.md:304-305`:

> Attendance Rules define allowed work modes (Office, Remote, Hybrid), Office
> Work Site requirement, Remote/Hybrid browser-geolocation requirement, …

- `docs/architecture/settings-and-branding.md:314-315`:

> Office requires an active Work Site lookup value. Remote and Hybrid require
> browser geolocation.

- `docs/architecture/settings-and-branding.md:319-320`:

> Check Out … requires checkout geolocation for Remote/Hybrid **when
> configured** …

- `docs/architecture/tenant-settings-attendance-runtime.md:46-47`:

> Remote and Hybrid modes require browser coordinates **when the resolved policy
> enables location capture**.

- The code, `services/api/src/modules/attendance/attendance.service.ts:3702`
  inside `validateAttendanceLocationPayload` (`:3645`, called at `:326` for
  check-in and `:478` for check-out):

```ts
if (latitude === undefined || longitude === undefined) {
  throw new UnprocessableEntityException({
    code: 'LOCATION_CAPTURE_REQUIRED',
    …
```

  No mode check, no policy check, no settings check.

- The mandate's own written statement, which the architecture contract was never
  updated to match —
  `services/api/prisma/migrations/20260728234000_attendance_mandatory_location_capture/migration.sql`,
  line 1:

```sql
-- Attendance location is a mandatory integrity control for all self-service modes.
```

- **The 2026-08-22 resync did not catch it.** `settings-and-branding.md` was
  deliberately re-synced with the code on 2026-08-22 (commit `1c18a0b3`, "the
  canonical settings contract matches the code again", BUG-0045). That pass
  covered routes, categories and shared components and never touched the
  attendance section. So the "when configured" language is stale rather than
  re-affirmed — a resync that reads as authoritative while leaving a false claim
  standing is worse than no resync, because the next reader trusts the date.

## Root Cause

Established. Commit `a8c04f16` landed the mandate across the catalog, a write
lock, a retro-migration, the resolve site and a test, but not into any
documentation. No ADR was written either — `docs/decisions/` holds only ADR-0001
and ADR-0002, neither related. The only durable statement of the intent is a SQL
comment on line 1 of a migration, which is not somewhere a reader of the
settings contract will look.

The 2026-08-22 resync then stamped the file as current without re-deriving the
attendance claims, which is the specific failure mode `doc-code-drift`'s
detection checklist warns about: the document states behaviour as fact without
distinguishing CURRENT from TARGET, and nothing validates a prose claim.

## Impact

Agents and engineers plan attendance work against a mechanism that does not
exist. The concrete cost is already visible: BUG-1979 and BUG-1981 were both
opened as `PRODUCT_DECISION` and sat blocked because nobody could tell whether
the override was deliberate — a question the architecture contract should have
answered and instead answered wrongly. Resolving it took a full investigation.

No runtime consequence and no security exposure. Rated MEDIUM as an
architectural divergence with demonstrated downstream cost.

## Affected Areas

`docs/architecture/settings-and-branding.md` (Attendance Rules, Attendance
Runtime Consumption), `docs/architecture/tenant-settings-attendance-runtime.md`
(Attendance resolution), and `docs/decisions/` — which is missing the ADR
entirely.

## Proposed Resolution

No ExecPlan needed.

1. Rewrite the attendance geolocation sentences in
   `docs/architecture/settings-and-branding.md` to state the mandate: device
   location is required for every self-service check-in and check-out, in all of
   OFFICE, REMOTE and HYBRID, and is not tenant-configurable. Name
   `validateAttendanceLocationPayload` as the enforcement point so a reader can
   verify it.
2. Do the same in `docs/architecture/tenant-settings-attendance-runtime.md`.
3. Write the ADR the mandate never got, citing commit `a8c04f16` and migration
   `20260728234000`, and link it from both documents and from BUG-1979.
4. State explicitly that the nine settings/policy fields are reported but not
   enforcing, so the next reader does not mistake them for controls.

## Acceptance Criteria

- Neither architecture document describes attendance geolocation as conditional,
  as configurable, or as scoped to Remote/Hybrid.
- Both name the enforcement point and the mandate's origin.
- An ADR records the mandate and is linked from both documents.
- `RelatedDecision` on BUG-1979 points at that ADR.

## Regression Coverage

Not unit-testable, per `docs/qa/known-bug-patterns/doc-code-drift.md`. The
control is the staleness rule: the amended sections carry the commit they were
verified against, and a future attendance change re-derives them rather than
trusting them.

## Dependencies

None. The ADR in step 3 is the same ADR BUG-1979's resolution asks for; write it
once.

## Related Items

BUG-1979 (the mandate's evidence and the settings-UI half of the same
unfinished cleanup), BUG-1981 (the schema and resolve-site half), ITEM-0112 (the
mandate's enforcement mechanism has no test). BUG-0045 was the 2026-08-22 resync
of this same document that did not reach the attendance section.

Pattern: `docs/qa/known-bug-patterns/doc-code-drift.md`.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from architect at `70391242`.
- 2026-08-29 — filed by the SESSION-0072 attendance-override investigation, which found the canonical settings contract contradicting the code while amending BUG-1979, BUG-1980 and BUG-1981. Triaged FIX_NOW: the documentation claim is unambiguously false and the fix needs no product input.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
