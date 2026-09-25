# TASK-0032 — Bug and backlog records map

Created by the records clerk pass over discovery streams D1-D6. All records
carry `DetectedInSha: 75fec5b9`, `DetectedDate: 2026-09-25`,
`ArchitectDisposition: FIX_NOW`, `RelatedImplementation: TASK-0032`.

## Bug records

| # | Title (as requested) | Allocated ID | Severity | Type |
|---|---|---|---|---|
| 1 | A Platform Admin can open and edit a tenant but every save is refused as not System Admin | [[BUG-3544]] | HIGH | AUTHORIZATION |
| 2 | The admin session heartbeat is refused for most platform roles and raises a blocking permission dialog | [[BUG-3545]] | HIGH | AUTHORIZATION |
| 3 | Tenant record Edit leaves the operator on a tab with nothing editable | [[BUG-3546]] | LOW | UX |
| 4 | The platform role picker offers two "Platform Owner" roles and a legacy Member role | [[BUG-3547]] | MEDIUM | UX |
| 5 | A numeric value in a `*_TTL_SECONDS` variable issues access tokens that expire after one second | [[BUG-3548]] | MEDIUM | BUG |
| 6 | Partner type (Individual/Company) drives no behaviour and individuals are asked for a company registration number | [[BUG-3549]] | MEDIUM | BUG |
| 7 | Partners can be created as duplicates: admin create has no duplicate check and the inquiry check ignores tax and registration numbers | [[BUG-3550]] | MEDIUM | DATA_INTEGRITY |
| 8 | Partner create, update, lifecycle and onboarding review are not written to the audit log | [[BUG-3551]] | MEDIUM | SECURITY |
| 9 | The agreement template editor offers every placeholder group regardless of agreement type | [[BUG-3552]] | MEDIUM | BUG |
| 10 | An agreement can be created for an inactive partner or an archived lead or customer, and duplicate submissions create duplicate agreements | [[BUG-3553]] | MEDIUM | DATA_INTEGRITY |
| 11 | The typed-signature style selector is cosmetic: the chosen style never reaches the signed document | [[BUG-3554]] | LOW | UX |
| 12 | Error log redaction covers auth secrets only: stack traces and personal or financial values are stored unredacted | [[BUG-3555]] | MEDIUM | SECURITY |

## Backlog items

| # | Title (as requested) | Allocated ID | Type |
|---|---|---|---|
| A | TOTP multi-factor authentication for tenant and platform users | [[ITEM-0197]] | SECURITY |
| B | Admin monitoring: platform health overview, grouped error fields, module facet and incident-first layout | [[ITEM-0198]] | UX |
| C | Admin dashboard: operational metrics for logins, MFA adoption, error rate, job failures, partner funnel and agreements | [[ITEM-0199]] | UX |
| D | Agreements have no end-to-end test coverage and partners/leads have no e2e lifecycle suite | [[ITEM-0200]] | TEST_GAP |

## Validation

```
node scripts/rebuild-backlog.mjs          → Backlog rebuilt — 668 record(s) (468 bug, 200 item)
npm run remediation:sync                  → 16 added, 0 refreshed, 0 removed
node scripts/rebuild-backlog.mjs --check  → Backlog indexes are current — 668 record(s), 0 structural errors.
npm run remediation:check                 → Remediation inventory is current — 668 row(s).
```

All 16 records set `Status: OPEN` (bugs) / `Status: READY` (items — triaged
already, so `TRIAGE_REQUIRED` would misstate that) and
`ArchitectDisposition: FIX_NOW`. Backlog items ITEM-0197/0198/0199 note an
ExecPlan requirement (MFA: schema change + new public endpoints + two
frontend login contracts) or flag scoping needed before implementation where
applicable; bug records needing a product decision before a fix direction is
chosen (BUG-3547 role-picker treatment, BUG-3549 individual-onboarding
fields, BUG-3550's DB-unique-constraint question, BUG-3553's block-vs-warn
question, BUG-3554's remove-vs-implement question, BUG-3555's message/stack
scrub scope) say so explicitly in their own Dependencies/Proposed Resolution
sections rather than being silently marked ready.
