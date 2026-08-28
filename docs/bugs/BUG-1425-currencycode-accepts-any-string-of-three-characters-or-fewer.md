---
ID: BUG-1425
aliases: [BUG-1425]
Title: currencyCode accepts any string of three characters or fewer
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 8d6be21b
AffectedModules: [services/api/src/modules/partners]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-26-admin-prod-e2e-8d6be21.md
RegressionId: REG-273
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1425 — currencyCode accepts any string of three characters or fewer

> **Architect triage, 2026-08-27 — `DEFER`.** A validation bound, not a live defect on any observed path. Worth doing with the next billing change.


## Summary

`currencyCode` on a partner — and on a commission — is validated as
`@IsString() @MaxLength(3)` and nothing more. There is no check that the value
is a currency. `"5"`, `"X"`, `"ZZZ"` and `""` are all accepted and stored.

This was found by accident: a QA probe put a stray `"5"` in the field and the
partner was created with `currencyCode: "5"`. A payload of `"NOT_A_CURRENCY"`
*is* rejected — but only for being fourteen characters long, not for failing to
be a currency. The validation that appears to work is measuring the wrong thing.

## Expected Behavior

`currencyCode` accepts only a currency the platform actually supports. The
supported set already exists and is already enumerated in the UI — the plan form
offers `QAR SAR AED BHD KWD OMR USD GBP EUR PKR INR`.

## Actual Behavior

Any string of three characters or fewer is accepted and persisted. Commission
amounts and partner defaults are then denominated in a code that means nothing.

## Reproduction

```js
await fetch('/api/platform-runtime/partners', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    displayName: 'QA probe',
    type: 'COMPANY',
    status: 'NEW_INQUIRY',
    defaultCommissionRate: 5,
    currencyCode: '5',
    email: 'someone@example.test',
  }),
});
```

Observed, 2026-08-26 against `8d6be21b` — created, HTTP 201:

```json
{"item":{"id":"a0016c2d-62ea-47d3-bcb2-9cbeb342e501",
         "displayName":"QA0059displayNam",
         "defaultCommissionRate":0,
         "currencyCode":"5",
         "status":"NEW_INQUIRY"}}
```

The same endpoint with `currencyCode: "NOT_A_CURRENCY"` returns 400 — the
message names the length constraint, not the value.

**That record exists in production.** It was created by this QA run and is listed
for cleanup in the run report.

## Evidence

[`partner.dto.ts:50`](../../services/api/src/modules/partners/dto/partner.dto.ts#L50):

```ts
@IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
```

and the same shape on the commission DTO,
[`partner.dto.ts:62`](../../services/api/src/modules/partners/dto/partner.dto.ts#L62):

```ts
@IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
```

Compare the field beside it, which is constrained properly:

```ts
@IsOptional() @IsEnum(PartnerStatus) status?: PartnerStatus;
```

`class-validator` ships `@IsISO4217CurrencyCode`, and the platform's own
supported list is narrower than ISO 4217 anyway.

## Root Cause

`MaxLength(3)` encodes the *shape* of a currency code and reads, at a glance,
like validation of one. It rejects the obviously-wrong long string, which is
enough to make the field look guarded in review and in casual testing. The
values it lets through are exactly the ones that look plausible.

## Impact

Production. Commission and partner records can carry a meaningless currency,
which then flows into commission calculations and any report or export that
groups by currency. Nothing crashes — the value is a string everywhere — so this
surfaces as wrong money rather than an error.

Reachable by any platform user through the partner form and through the API.
Bounded in practice by the UI offering a fixed list; the API does not.

## Affected Areas

- `services/api/src/modules/partners/dto/partner.dto.ts` — partner and
  commission DTOs
- `Partner.currencyCode`, `PartnerCommission.currencyCode`
- Any consumer that groups or converts by currency

## Proposed Resolution

Constrain the value to the platform's supported currencies rather than to a
length. The list already exists for the plan form; give it one home and validate
against it — `@IsIn(SUPPORTED_CURRENCIES)` — so the API and the UI cannot drift.
Falling back to `@IsISO4217CurrencyCode` would be a real improvement but still
wider than what the platform can actually price in.

Audit the other `currencyCode` fields in the schema in the same pass; this one
was found by accident and the pattern is unlikely to be unique.

Existing rows need checking — at least the one this run created.

## Acceptance Criteria

- A partner or commission cannot be created or updated with a currency the
  platform does not support.
- The rejection message names the currency as invalid, not the length.
- The supported currency list has exactly one definition shared by API and UI.
- A test fails for `"5"`, `""` and `"ZZZ"`.

## Regression Coverage

Needed: a DTO test asserting that a plausible-but-invalid short code is
rejected. A test that only checks a long string is rejected would pass against
the current code, which is the trap this bug is made of.

## Dependencies

None.

## Related Items

- [[BUG-1424]] — missing CSP, same run
- [[BUG-1422]] — the validation channel that made this hard to notice from the UI

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`. This was deferred on the grounds
that it was not reachable; [[BUG-1747]] showed it sat on the primary partner
creation path, so both were fixed together.

The real blocker was that there was nothing to validate *against*. Two catalogs
existed — `apps/admin` offered thirty-five currencies to the operator,
`services/api/src/common/reference-data` knew about eight, and nothing read the
API one at all. Validating against either alone would have made the two disagree
in a way that rejects real input.

The catalog now lives in `packages/config/platform-currencies.js`, the one
package both the API and the admin app already depend on, and both sides read
it. `@IsIn(PLATFORM_CURRENCY_CODES)` replaces `@IsString() @MaxLength(3)` on
partner create, partner update and commission create.

Minor units are carried with each entry because they are not all 2 — the Gulf
dinars are 3, JPY and KRW are 0. The API list omitted the field entirely, which
is a rounding error waiting to happen rather than a defect anyone has hit yet.

Scope: deliberately the two modules this record names. `currencyCode` appears in
roughly twenty other DTOs across tenant-facing modules, and whether a tenant may
use a currency outside the platform's sales catalog is a product question this
record does not answer. Narrowing those without asking would reject input that
is valid today.

Guarded by REG-273.

## QA Retest

Not yet retested. `packages/config/platform-currencies.test.js` asserts the exact
values this record names — `"5"`, `"X"`, `"ZZZ"`, `""` — are rejected, and that
`"NOT_A_CURRENCY"` is rejected for not being a currency rather than for its
length. It runs in CI as its own step.

## History

- 2026-08-26 — created from qa run at `8d6be21b`.
- 2026-08-28 — reachability established: the Partner form forces this path, so the DEFER premise is falsified. See [[BUG-1747]].
- 2026-08-28 - un-deferred: BUG-1747 made it reachable. One catalog in @repo/config, @IsIn on the DTOs. REG-273.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[partners]]
- Regression — REG-273 (see the regression register)

<!-- GRAPH:END -->
