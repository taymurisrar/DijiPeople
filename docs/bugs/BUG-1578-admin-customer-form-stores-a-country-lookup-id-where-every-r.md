---
ID: BUG-1578
aliases: [BUG-1578]
Title: Admin customer form stores a country lookup id where every reader expects a name
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [super-admin, contracts, lookups]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-26
ResolvedAt:
---

# BUG-1578 — Admin customer form stores a country lookup id where every reader expects a name

## Summary

The admin Customers form writes the country **lookup id** into
`CustomerAccount.country`, a column every other producer and consumer treats as
a display name. The public signup path writes `Qatar`; the admin form writes
`ec7dbbe3-1179-4465-990f-06427a4ab59f`. The consequence is visible on a legal
document: a generated agreement renders that UUID as the counterparty's
registered address.

## Expected Behavior

`CustomerAccount.country` holds a country name, consistently, whichever surface
created the record — or it holds an id and every reader resolves it. One
convention, not two.

## Actual Behavior

Customers created through the admin form store a UUID. Customers created through
public signup store a name. Readers assume a name, so the UUID is rendered
verbatim.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Create a customer through the Customers form, selecting a country.
3. Read the stored record — `country` is a UUID.
4. Create an agreement from that customer and inspect `customer.address`.

## Evidence

Read from production, 2026-08-26, through the admin API as a platform owner.

Customer `QA E2E Customer 20260826` (`f445a0d1-4c82-4b2f-9bfd-da8494671751`),
created through the admin form:

```
legalCompanyName = None
addressLine1     = None
addressLine2     = None
city             = None
stateProvince    = None
country          = 'ec7dbbe3-1179-4465-990f-06427a4ab59f'
```

Across the 13 customers on production, **1 holds a UUID and 12 hold a name**.
The 12 are the public-signup and seeded records (`Qatar`, `Pakistan`); the 1 is
the one created through the admin form. That ratio is what localises the defect
to the admin write path rather than to the column or its readers.

Downstream, on contract `CON-20260826-DCA95FD5`
(`dea80bb1-ccc1-4d8d-84b9-f4a06c1369d8`), `GET /api/contracts/{id}/document-fields`
returns:

```
customer.address  src=create  = ec7dbbe3-1179-4465-990f-06427a4ab59f
```

`customerSource()` in `contracts.service.ts` joins `addressLine1`,
`addressLine2`, `city`, `stateProvince` and `country` with `.filter(Boolean)`.
With the first four null, the address *is* the country value — so the UUID is
the whole rendered address.

## Root Cause

Established for the symptom, not yet for the write. `CustomerAccount.country` is
a plain string column carrying a display name by convention, and the admin
Customers form submits the selected lookup's id rather than its label. Which
layer performs that substitution — the runtime lookup control, the form
metadata, or the create handler — has not been isolated, and that is the one
step remaining before a fix.

The renderer is not at fault: it faithfully prints what the column holds.

## Impact

A generated agreement names a UUID as the counterparty's registered address.
That is a document intended for signature, so the defect reaches a customer in
the worst possible form — and unlike an unresolved `{{token}}`, it does not look
broken to an automated check, because the field is populated.

`customer.country` is affected identically wherever a template uses it, and any
report, filter or grouping by country silently splits admin-created customers
into their own bucket.

Only one production record is affected today because the admin create path is
little used — see [[BUG-1545]], which blocks the adjacent onboarding create
entirely. That number rises the moment admin-initiated provisioning works.

## Affected Areas

- `apps/admin` — the Customers form and its runtime lookup control
- `services/api/src/modules/super-admin` — customer create/update
- `services/api/src/modules/lookups` — country lookup
- `services/api/src/modules/contracts` — `customerSource()`, as the consumer
  that makes the defect visible
- `CustomerAccount.country` in `schema.prisma`

## Proposed Resolution

Decide which convention the column holds, then make both writers obey it. The
name is the pragmatic choice — twelve of thirteen rows already hold one, and
every reader assumes it — so the admin form should submit the label.

Storing the id would be the cleaner model, but it is an expand/backfill/contract
migration touching every reader, and it needs an ExecPlan under `PLANS.md`
rather than a patch.

Whichever is chosen, the create handler should reject a value that does not match
the convention, so a third writer cannot introduce a third format.

## Acceptance Criteria

- A customer created through the admin form stores the same country format as
  one created through public signup.
- `customer.address` and `customer.country` render a country name on an
  agreement generated from an admin-created customer.
- The existing production record is corrected.
- A country value in the wrong format is rejected at write time.

## Regression Coverage

None yet. Needs a test asserting the admin create path stores the same country
representation as the public subscribe path, driven from both. Requires a
`REG-nnn` entry once written.

## Dependencies

None, unless the id-storing option is chosen, which would need an ADR and an
ExecPlan.

## Related Items

Found while establishing the root cause of [[BUG-1541]], and it is part of what
made that agreement unusable. Adjacent to [[BUG-1545]], which blocks the other
admin-initiated create on the same surface.

## Resolution

Not yet resolved.

## QA Retest

Not yet retested. Retest by creating a customer through the admin form and
reading the stored value, not by reading the form back — the form will redisplay
its own id as a selected label and look correct.

## History

- 2026-08-26 — found while reading production contract `CON-20260826-DCA95FD5`
  to establish the root cause of [[BUG-1541]]. Not observed during the original
  QA pass, which read the rendered document rather than the field values.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]], [[contracts-and-agreements]]

<!-- GRAPH:END -->
