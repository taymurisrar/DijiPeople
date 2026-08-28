---
ID: BUG-1747
aliases: [BUG-1747]
Title: Partner Currency is a required numeric input so partner creation forces a corrupt currency code
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin, api:super-admin]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1747 — Partner Currency is a required numeric input so partner creation forces a corrupt currency code

## Summary

On **Partners → New**, the **Currency** field is required and rendered as
`<input type="number">`, validating with "Enter a number." The field holds
`currencyCode`, a three-letter currency code. An operator cannot satisfy the
form with a currency, so the only way to create a partner through the console is
to type a number — and the API stores it without complaint. A partner created
this way carries `currencyCode: "5"`.

This turns [[BUG-1425]] from a latent validation bound into a live defect on the
primary creation path, which matters because BUG-1425 was deferred precisely on
the grounds that it was not reachable.

## Expected Behavior

Currency offers the currencies the platform supports — the plan form already
enumerates `QAR SAR AED BHD KWD OMR USD GBP EUR PKR INR` — and a partner is
created carrying one of them.

## Actual Behavior

Currency is a numeric input. Entering a currency code is impossible. Entering a
number is accepted end to end and stored as the partner's currency.

## Reproduction

1. Platform Admin, **Partners → New**.
2. Fill Partner name; Partner type and Status carry defaults.
3. Observe **Currency** under Commercial: marked required, rendered as a number
   input, and failing with "Enter a number." rather than "This field is
   required." — which is why the form appears to refuse with no visible error
   (see [[BUG-1746]]).
4. Enter `10` in Default commission and `5` in Currency. Fill Business email on
   **Contacts and Users**. Press **Save**.
5. The partner is created. Read it back:
   `GET /api/platform-runtime/partners/<id>` returns `currencyCode: "5"`.

## Evidence

Field definition — `apps/admin/lib/runtime/platform-module-registry.ts:914`:

```ts
field("currencyCode", "Currency", "currency", "commercial", true)
```

Renderer — `apps/admin/app/_components/runtime/runtime-form.tsx:368`:

```ts
if (["integer", "decimal", "currency", "percentage"].includes(field.type)) {
```

The runtime treats type `"currency"` as a money **amount**, formatted to two
fraction digits. `currencyCode` holds a **code**, so the wrong control is
rendered for it. The final argument `true` marks it required.

DOM inspection of the live form confirms the control is
`{ i: 6, type: "number", label: "…Default commission*Currency*En…" }`.

The API validates nothing here. Against
`POST /api/platform-runtime/partners/validate`:

| `currencyCode` | result |
|---|---|
| `"QAR"` | `success: true` |
| `1` (number) | `success: true` |
| omitted entirely | `success: true` |

So the field is required by the UI, optional and unvalidated at the API, and the
only value the UI will accept is one the domain cannot use.

The partner created during this pass (`currencyCode: "5"`) was deleted
afterwards.

## Root Cause

A field-type collision in the runtime metadata. The type name `"currency"` is
used for two different things — a money amount and a currency code — and the
registry assigns it to `currencyCode`, which is the code. The renderer resolves
it as an amount.

## Impact

Partner creation from the Platform Admin console, in production. The operator is
faced with a required field they cannot fill correctly; the path of least
resistance produces corrupt commission-currency data that nothing downstream
validates.

Partner commissions are money owed to third parties, so a wrong currency code on
a partner is not a cosmetic problem.

## Affected Areas

`apps/admin` partner form and the runtime field-type map; `super-admin` partner
DTOs; commissions, which read the same field.

## Proposed Resolution

Give currency codes their own field type — a select over the supported
currencies — and stop overloading `"currency"` for both amounts and codes. Then
audit every field declared `"currency"` in the registry to see which are amounts
and which are codes.

Fix the API side with [[BUG-1425]]: validate `currencyCode` against the
supported set rather than by string length. The two should land together, since
either alone leaves the other half open.

## Acceptance Criteria

- Currency on the Partner form is a select of supported currency codes.
- A partner cannot be created or updated with a `currencyCode` outside that set,
  through the UI or the API.
- No field holding a currency code is rendered as a numeric input anywhere.
- A regression test asserts the partner form's Currency control is a select and
  that a non-currency value is rejected by the API.

## Regression Coverage

None yet.

## Dependencies

Pairs with [[BUG-1425]] for the API-side validation.

## Related Items

[[BUG-1425]] — `currencyCode` accepts any string of three characters or fewer;
deferred on 2026-08-27 as "a validation bound, not a live defect on any observed
path". This record is the observed path, so that premise no longer holds and the
disposition is worth revisiting.
[[BUG-1746]] — why this failure presents as a form with no visible error.
[[BUG-1743]] — partners cannot be edited either, for an unrelated reason.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  reproduced in a browser against production `e0aeabcd`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[super-admin]]

<!-- GRAPH:END -->
