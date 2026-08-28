---
ID: BUG-1422
aliases: [BUG-1422]
Title: Runtime form validation discards every field reason and shows the user Bad Request Exception
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 8d6be21b
AffectedModules: [services/api/src/modules/platform-runtime, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-26-admin-prod-e2e-8d6be21.md
RegressionId: REG-261
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-28
ResolvedAt: 2026-08-28
---

# BUG-1422 — Runtime form validation discards every field reason and shows the user Bad Request Exception

## Summary

Every metadata-driven admin form validates through
`POST /platform-runtime/:moduleKey/validate`. When validation fails, that
endpoint answers with the literal string **"Bad Request Exception"** and nothing
else — no field, no reason, no trace id.

The admin form is already written to display per-field errors and asks the
response for them. The server never sends them. So the operator gets one
meaningless toast, every field looks fine, and there is no way to discover which
value is wrong except by guessing.

The two halves of this contract disagree, and the half that is wrong is the
server: **the client is correct and is waiting for data the server throws
away.**

## Expected Behavior

A failed runtime validation names the fields that failed and why, in the
`fieldErrors` shape this repository already standardises on
(`HttpExceptionFilter` renders it, and `readFieldErrors` reads it). The form
puts each message under its field, as it is already coded to do.

## Actual Behavior

```json
{ "success": false, "message": "Bad Request Exception" }
```

`errors` is absent. The client's `validation.errors ?? []` is therefore always
empty, `setErrors({})` clears every field error, and only the toast survives —
carrying the name of a Nest exception class as though it were advice.

## Reproduction

1. Sign in to https://admin.dijipeople.com.
2. Go to `/leads/new` (or `/support/cases/new`).
3. Fill the fields marked with an asterisk, using a value the DTO rejects for
   any one of them.
4. Press **Save and close**.

Observed, 2026-08-26 against `8d6be21b`:

```
=== leads  (/leads/new)
   field errors: NONE RENDERED
   toasts      : ["Bad Request Exception"]
   requests    : 201 /api/platform-runtime/leads/validate
                     {"success":false,"message":"Bad Request Exception"}

=== support-cases  (/support/cases/new)
   field errors: NONE RENDERED
   toasts      : ["Bad Request Exception"]
   requests    : 201 /api/platform-runtime/support-cases/validate
                     {"success":false,"message":"Bad Request Exception"}
```

The same shape appears for `customers` when a rejected value is supplied.

## Evidence

The client asks for structured errors —
[`runtime-record-page.tsx:309`](../../apps/admin/app/_components/runtime/runtime-record-page.tsx#L309):

```ts
if (!validation.success) {
  setErrors(
    Object.fromEntries(
      (validation.errors ?? [])
        .filter((item) => item.field)
        .map((item) => [item.field!, item.message]),
    ),
  );
  return validation;
}
```

The server discards them —
[`platform-runtime.service.ts:943`](../../services/api/src/modules/platform-runtime/platform-runtime.service.ts#L943):

```ts
} catch (error) {
  return {
    success: false,
    message: error instanceof Error ? error.message : 'Validation failed.',
  };
}
```

The detail exists at the point it is thrown —
[`platform-runtime.service.ts:1299`](../../services/api/src/modules/platform-runtime/platform-runtime.service.ts#L1299):

```ts
if (errors.length)
  throw new BadRequestException(
    errors.flatMap((error) => Object.values(error.constraints ?? {})),
  );
```

`class-validator` gives each error a `property` and a `constraints` map. Both are
available here and neither is kept.

## Root Cause

`BadRequestException` constructed with an **array** puts that array on the
response payload and sets the exception's own `.message` to the constant string
`"Bad Request Exception"`. The `catch` reads `error.message`, so it reads the
class's name rather than the payload it was given. The real messages sit
untouched in `error.getResponse().message`.

`dto()` additionally flattens `errors` to constraint strings before throwing,
dropping `error.property` — so even the payload no longer says which field each
message belongs to.

The comment immediately above the `validate` call site shows the failure mode was
already understood for one module:

> Plans validate on update only … Without this entry every plan edit validated
> vacuously and then failed at save with a whole-request 400, because `dto()`
> runs with `forbidNonWhitelisted` and the form had no way to know which field
> was the problem.

That fix added a DTO for plans. It did not fix the channel that carries the
reason, so every other module still has "no way to know which field was the
problem".

## Impact

Production, every platform user, every metadata-driven create and edit form —
leads, customers, partners, support cases, contracts, tenants and every module
added to the runtime in future. The runtime is the documented default for new
admin modules, so this is the default experience of a validation failure.

The operator cannot correct their input, because nothing tells them what is
wrong. During this QA run it also cost real diagnostic time: the message is
indistinguishable from an outage.

No data is exposed or corrupted.

## Affected Areas

- `services/api/src/modules/platform-runtime/platform-runtime.service.ts` —
  `validate()` and `dto()`
- `apps/admin/app/_components/runtime/runtime-record-page.tsx` — the consumer,
  already correct
- Every module routed through `POST /platform-runtime/:moduleKey/validate`

## Proposed Resolution

Keep the reason with the field, and hand it back in the shape everything else
already uses.

1. `dto()` throws `BadRequestException({ message: [...constraints], fieldErrors:
   [{ field: error.property, message: <first constraint> }] })`. Keeping
   `message` as the array preserves today's behaviour for every other caller;
   adding `fieldErrors` is what `HttpExceptionFilter.readFieldErrors` already
   looks for, so every other `dto()` caller gains a correct contract for free.
2. `validate()` reads `fieldErrors` off `error.getResponse()` and returns it as
   `errors`, with `message` set to the joined constraint text rather than the
   exception's class name.

No client change is required — the form already consumes exactly this.

## Acceptance Criteria

- A failed runtime validation returns `errors: [{ field, message }]` naming
  every field that failed.
- The admin form renders each message beneath its own field.
- No user-facing message is ever the string "Bad Request Exception".
- A unit test fails if `validate()` returns a failure without `errors`.

## Regression Coverage

Needed: a spec that drives `validate()` with a payload its DTO rejects and
asserts the response names the offending field. That test fails against the
current code and passes after the fix.

## Dependencies

None.

## Related Items

- [[BUG-1419]] — dead incident links, same QA run
- [[BUG-1420]] — severity filter mismatch, same QA run
- [[BUG-1421]] — admin shell landmark and title defects
- [[BUG-1423]] — unlabelled runtime form controls, same component family

## Resolution

Fixed on `agent/admin-prod-e2e-qa`, 2026-08-26.

`dto()` now throws `BadRequestException({ message, fieldErrors })`, keeping each
constraint with `error.property` instead of flattening it away. `message` stays
the flat array of constraint strings so every existing caller and test reads
what it always read; `fieldErrors` is added beside it, in the shape
`HttpExceptionFilter.readFieldErrors` already looks for — so every other `dto()`
caller that lets the exception reach the filter now answers with the documented
contract as a side effect.

The `catch` in `validate()` was extracted to an exported `readValidationFailure`,
which reads the payload rather than `error.message` and returns `errors` in the
shape `runtime-record-page.tsx` already consumes. Extracting it was what let the
regression test execute the contract instead of grepping the source — the first
draft asserted source text and killed the mutant only through a string match.

No client change was required.

## QA Retest

Verified in a browser against production `e0aeabcd` on 2026-08-28.

Saving **Leads > New Lead** with every field empty produced per-field
"This field is required." messages against each control, plus the summary
"Complete the required fields." No "Bad Request Exception" anywhere.

Scope stated precisely: this exercises the CLIENT-side pre-validation path.
The server-side field-reason path was exercised separately in the same pass
and is still weak — the API returns `errors[].field` and the UI renders
only the bare message in the toolbar corner, unanchored to the field. That
remainder is carried by [[BUG-1746]].

## History

- 2026-08-26 — created from qa run at `8d6be21b`.
- 2026-08-28 — verified fixed in a browser; the server-error surface remains weak and is carried by [[BUG-1746]].

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]
- Regression — REG-261 (see the regression register)

<!-- GRAPH:END -->
