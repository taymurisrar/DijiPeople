---
ID: BUG-2009
aliases: [BUG-2009]
Title: Display labels fall through to the raw field key or raw enum value on three tenant surfaces
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-341
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2009 — Display labels fall through to the raw field key or raw enum value on three tenant surfaces

## Summary

Three surfaces in the tenant app print the stored token where a human string
belongs: ten controls on the Branding settings page are labelled with their
camelCase keys, the related-list tables on an employee record use raw model field
names as column headers and raw enum values as cell contents, and the dashboard's
Recent changes list shows raw enum constants as its labels. They are filed
together because they are one symptom with one shape — a display-label lookup
that falls through to its input — and a fixer benefits from seeing all three at
once. **They are grouped by symptom, not by a proven shared cause**: the branding
page is driven by the settings page config and the other two by the metadata
runtime, so each surface must be fixed and verified on its own.

## Expected Behavior

Every label a user reads is a human string: "Muted text colour", "Attendance
date", "Present", "System access provisioned". A field key or an enum constant
never reaches the screen.

## Actual Behavior

**Surface 1 — Branding settings (`/settings/branding`).** Six of the twelve
colour tokens are labelled properly with helper text:

```
Primary color    — Main action and navigation emphasis
Secondary color  — Supporting color for highlights
```

The other six fall back to the key plus a generic description:

```
mutedTextColor                — Branding color token.
borderColor                   — Branding color token.
sidebarBackgroundColor        — Branding color token.
sidebarTextColor              — Branding color token.
sidebarActiveBackgroundColor  — Branding color token.
sidebarActiveTextColor        — Branding color token.
```

and four text fields on the same page are labelled with the bare key:

```
supportEmail · supportPhone · privacyPolicyUrl · termsOfUseUrl
```

Ten mislabelled controls in total, on a page a customer configures during
onboarding.

**Surface 2 — Employee record related lists.** The Attendance tab renders a table
whose headers are the raw model field names, and whose status cell is the raw
enum:

```
attendanceDate | attendanceStatus | checkInAt              | checkOutAt
08/27/2026     | PRESENT          | 08/27/2026, 9:05 AM    | 08/27/2026, 6:00 PM
```

The standalone `/attendance` list, over the same data, labels everything
correctly: "Attendance Entry | Date | Work Mode | Shift | Check In | Check Out |
Total Working Time | Status". So the related-list renderer is not resolving
display labels from the metadata that the list page does resolve.

**Surface 3 — Dashboard Recent changes.** The label column prints the raw enum
constant:

```
TYPE Timesheet  LABEL DRAFT
TYPE Employee   LABEL EMPLOYEE_SYSTEM_ACCESS_PROVISIONED
```

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Open `/settings/branding` (`/settings/appearance/branding` redirects here) and
   read the control labels. Six colour tokens and four text fields show their
   camelCase keys.
2. Open any employee record with attendance data and select the **Attendance**
   tab. The column headers are `attendanceDate`, `attendanceStatus`,
   `checkInAt`, `checkOutAt`; the status cell reads `PRESENT`.
3. Open `/attendance` for the same employee and compare — every column is
   properly labelled there.
4. Open the dashboard and read **Recent activity > Recent changes**. The LABEL
   column shows `DRAFT` and `EMPLOYEE_SYSTEM_ACCESS_PROVISIONED`.

## Evidence

All three surfaces observed live on the production demo tenant, quoted verbatim
above. The `/attendance` versus employee-Attendance-tab contrast in step 3 is the
strongest single piece of evidence: same data, same tenant, same session, one
renderer resolves labels and the other does not.

No file:line evidence was collected for any of the three. The settings page
config for branding, the related-list column renderer in
`apps/web/app/components/runtime/`, and the dashboard Recent changes component
all need locating before the fix, and the "one cause or three" question answered
there rather than here.

Note for whoever picks this up: the branding page's primary-colour placeholder
was already `#0f766e`, i.e. the intended default brand, which suggests the six
well-labelled tokens were curated by hand and the other six were never added to
whatever list supplies the labels. That is a hypothesis, not a finding.

## Root Cause

Not established, and deliberately not guessed. Three surfaces show the same
symptom; whether they share one label-resolution path is the first question to
answer, and it determines whether this is one fix or three.

## Impact

Visible on three surfaces a customer uses regularly, one of which
(`/settings/branding`) is configured during onboarding and one of which (the
dashboard) is the landing screen. Nothing breaks and nothing is wrong, but a
control labelled `sidebarActiveBackgroundColor` asks the customer to understand
the data model, and a status of `EMPLOYEE_SYSTEM_ACCESS_PROVISIONED` asks them to
read a constant.

Rated MEDIUM rather than LOW on breadth and placement: ten controls on an
onboarding settings page, a table on every employee record, and the dashboard.
Individually each is cosmetic; together they are the product's finish.

## Affected Areas

`apps/web/app/(authenticated)/settings/_lib/` (branding page config);
`apps/web/app/components/runtime/` (related-list column headers and cell
rendering); the dashboard Recent changes component.

## Proposed Resolution

Find out first whether one lookup serves all three. If it does, fix it once and
verify all three surfaces. If it does not:

- **Branding** — supply labels and helper text for the six colour tokens and four
  text fields that lack them, in the same place the six working ones are defined.
- **Related lists** — resolve column headers and enum cell values through the
  same metadata the standalone list page already uses.
- **Recent changes** — resolve the enum to its display label.

Add a check that no rendered label equals its own field key, so the class cannot
come back one control at a time. That is the part worth more than the three
fixes.

## Acceptance Criteria

- No control on `/settings/branding` is labelled with its field key.
- Employee record related-list column headers are human labels and enum cells are
  human values.
- Dashboard Recent changes labels are human phrases.
- A repository check fails when a declared display label is absent and the key
  would be rendered instead.

## Dependencies

None identified.

## Related Items

BUG-2010 is the other half of the Recent changes defect — the unformatted ISO
timestamps in the same widget — and is a formatting problem rather than a label
problem, which is why it is separate. BUG-2017 (the inbox Related record column
showing a bare UUID) is the same family of raw values reaching the screen, with a
different fix. BUG-1753 mangles lookup labels in the admin console by
over-processing them; this record is the opposite failure and is not a duplicate
of it.

BUG-1950 (every tenant workspace screen renders the same `<h1>Dashboard</h1>`)
and BUG-1951 (143 of 232 authenticated pages render no `<main>` landmark), filed
independently on 2026-08-29, were checked against this record and are **distinct;
all three stand.** Those two concern page structure — the heading and landmark a
page emits regardless of its data — and are constant across every screen. This
record concerns the *values* a label lookup resolves to, and varies per field and
per surface. No fix to either of them changes a single string named here.

## Resolution

The "one cause or three" question the record left open resolved as: **not one
lookup, but one small helper (`humanizeEnumValue`/`humanizeFieldKey` in
`apps/web/lib/text/inflection.ts`, already built for BUG-1964) reused as the
fallback in three otherwise-independent places.**

- **Branding (`/settings/branding`)** —
  `app/(authenticated)/settings/branding/_components/branding-settings-form.tsx`.
  `COLOR_FIELD_LABELS` and `TEXT_FIELD_LABELS` were missing entries for the six
  reported colour tokens (`mutedTextColor`, `borderColor`,
  `sidebarBackgroundColor`, `sidebarTextColor`,
  `sidebarActiveBackgroundColor`, `sidebarActiveTextColor`) and four text
  fields (`supportEmail`, `supportPhone`, `privacyPolicyUrl`,
  `termsOfUseUrl`) — all eight added by hand, matching the six that already
  had one. The fallback for any *other* undeclared key changed from `?? key`
  to `?? humanizeFieldKey(key)` (new `resolveColorFieldLabel` /
  `resolveTextFieldLabel`), which also covers `successColor`, `warningColor`,
  `dangerColor` and `infoColor` — four colour tokens the schema
  (`lib/branding.ts`) has grown since this record was filed, bringing the
  total to sixteen, not the twelve the record measured.
- **Employee record related lists** —
  `apps/web/lib/runtime/runtime-value-formatter.ts`, the function every
  runtime list (including the standalone `/attendance` list the record
  contrasts against) shares. The optionset branch now falls back to
  `humanizeEnumValue(rawValue)` when no declared option matches, instead of
  the raw stored value; the final fallback (no field metadata at all — the
  generic-entity shape a related list frequently has) does the same. Column
  *headers* were already fixed for this record on this branch before this
  task started (`module-related-subgrid.tsx`, see the BUG-1964 resolution) —
  this closes the remaining half, the enum *cell values*.
- **Dashboard Recent changes** —
  `apps/web/app/components/dashboard/dashboard-widget-renderer.tsx`,
  `formatValue`'s default string branch now returns
  `humanizeEnumValue(value)` instead of the raw string. Landed in the same
  commit as BUG-2010, because both are fixes to the same function in the same
  file (BUG-2010 is the Date column in the same widget) — see that record's
  Resolution for the ISO-timestamp half.

Verified from source and by the specs below; not verified live against a
running tenant.

## Regression Coverage

REG-341. Three specs, one per surface (no jsdom in this app, so each asserts
pure logic rather than rendering):

- `apps/web/app/(authenticated)/settings/branding/_components/branding-field-labels.spec.ts`
  — walks **every** key in `BRANDING_COLOR_KEYS` and `BRANDING_TEXT_KEYS`
  (not just the ten reported) asserting the resolved label never equals the
  key, plus the ten reported labels by exact value. This is the "add a check
  that no rendered label equals its own field key" the Proposed Resolution
  named as worth more than the three fixes: a seventeenth colour token added
  later without a label fails this test rather than shipping unlabelled.
- `apps/web/lib/runtime/runtime-value-formatter.spec.ts` — a declared
  optionset label wins; an undeclared optionset value and a field with no
  metadata both humanise; ordinary prose (`"Fatima Ahmed"`) passes through
  unchanged.
- `apps/web/app/components/dashboard/dashboard-widget-formatting.spec.ts` —
  shared with BUG-2010; its enum-humanisation cases cover this record.

Mutation-tested, three separate mutations: reverting `resolveColorFieldLabel`
to `COLOR_FIELD_LABELS[key] ?? key` fails the "hypothetical undeclared key"
assertion; reverting the optionset fallback to `declaredLabel ?? rawValue`
fails the "no matching declared option" assertion; reverting the final
fallback to `String(value)` fails the "no field metadata at all" assertion.
Each reverted immediately after confirming.

## QA Retest

Not retested live against a running tenant. Verified from source and by the
specs above against every item in Acceptance Criteria, including the
completeness check the record itself asked for.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Merges three separately observed surfaces into one record because the symptom and probable fix are shared; the record states explicitly that the shared cause is unproven. Disposition FIX_NOW.
- 2026-08-29 — Checked against BUG-1950 and BUG-1951 (page heading and `main` landmark, filed independently the same day) and recorded as distinct: those are page structure, this is label resolution. All three stand.
- 2026-08-30 — resolved: not one lookup, but one helper (`humanizeEnumValue`/`humanizeFieldKey`) reused as the fallback in three independent places — branding, related-list cell values (headers were already fixed on this branch), and the dashboard widget. The dashboard fix landed in the same commit as BUG-2010 since both touch the same function. Closed FIXED under REG-341.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
