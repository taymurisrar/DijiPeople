---
ID: BUG-1742
aliases: [BUG-1742]
Title: Lead creation is impossible: the runtime form always sends partnerId as an empty string
Status: FIXED
Severity: CRITICAL
Priority: P0
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin, api:platform-runtime, api:super-admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-272
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1742 — Lead creation is impossible: the runtime form always sends partnerId as an empty string

## Summary

No lead can be created through the Platform Admin console. The New Lead form
serializes its untouched optional Partner lookup as `partnerId: ""`, and the
API's `@IsUUID()` rejects the empty string, so every save fails with
`partnerId must be a UUID`. There is no Partner control anywhere on the form, so
the operator can neither supply a valid id nor clear the field. Leads is the
entry point of the Growth funnel and it has no working create path.

## Expected Behavior

Filling the required fields on New Lead and pressing Save creates the lead. An
optional lookup the operator never touched is omitted from the payload rather
than sent as an empty string.

## Actual Behavior

Save fails. The toolbar shows the bare API message `partnerId must be a UUID`
and the record is not created. Nothing on either tab is marked as the offending
field, and no Partner field exists to correct.

## Reproduction

1. Sign in to Platform Admin as a `PLATFORM_OWNER`.
2. Go to **Leads → New Lead**.
3. Summary tab: Company/Lead name, First name, Last name, Work email.
4. Commercial tab: Industry, Company size, Source (all three are required and
   only discoverable here — see [[BUG-1746]]).
5. Press **Save**.
6. `POST /api/platform-runtime/leads/validate` responds
   `{"success":false,"errors":[{"field":"partnerId","message":"partnerId must be a UUID"}]}`
   and no lead is created.

## Evidence

Captured request body, `POST /api/platform-runtime/leads/validate`:

```json
{"values":{"companyName":"QA E2E Lead 20260828","status":"NEW",
"contactFirstName":"Aisha","contactLastName":"Rahman",
"workEmail":"qa-e2e-lead-20260828@example.com","industry":"IT / Software",
"companySize":"11-50","source":"Manual Entry","partnerId":""},"mode":"create"}
```

Response:

```json
{"success":false,"message":"partnerId must be a UUID",
"errors":[{"field":"partnerId","message":"partnerId must be a UUID"}]}
```

Isolated against the same endpoint, same values:

| payload | result |
|---|---|
| values **with** `partnerId: ""` | `success: false` — partnerId must be a UUID |
| values **without** `partnerId` | `success: true` |

Enumerating every control on both tabs returns only `Select status reason` and
`Select owner` on Summary and no partner control on Commercial, so `partnerId`
is injected by the runtime and is unreachable from the UI.

## Root Cause

The runtime form serializes an untouched optional lookup as `""` rather than
omitting the key. The DTO validates the field as a UUID, and an empty string is
not one. The field is not rendered on the lead form at all, so the value can
only ever be `""`.

Same family as [[BUG-0220]]: the runtime's payload and the API's DTO are two
statements about different things, and nothing reconciles them. There the extra
key was rejected for existing; here an empty string is rejected for its shape.

## Impact

Every lead creation from the Platform Admin console, for every operator, in
production. Leads is the first stage of the commercial funnel. There is no
workaround in the UI; the only route is a direct API call that omits the field.

## Affected Areas

`apps/admin` leads record page, `platform-runtime` validate and create,
`super-admin` lead DTOs, and the runtime form serializer shared by every module.

## Proposed Resolution

Omit empty optional values from the runtime save payload instead of sending
`""` — this is the general fix and it protects every module, not just leads.
Then decide separately whether the lead form should expose a Partner lookup at
all; if it should, render it, and if it should not, stop including the key.
Treat the serializer change as the shared fix and audit the other modules for
the same shape.

## Acceptance Criteria

- A lead can be created from **Leads → New Lead** with no partner selected.
- The create payload contains no key whose value is an empty string for an
  optional lookup.
- If a Partner lookup is intended on this form, it is rendered and selectable.
- A regression test asserts the serializer omits untouched optional lookups.

## Regression Coverage

None yet. Needs a test that builds the lead create payload from an untouched
form and asserts `partnerId` is absent rather than `""`.

## Dependencies

None.

## Related Items

[[BUG-0220]] — the same runtime-payload versus DTO-contract split, fixed for
plans only.
[[BUG-1743]] — customers and partners cannot be updated, the other live
instance of that split.
[[BUG-1746]] — required fields on other tabs are undiscoverable, which is what
sends an operator hunting before they ever reach this error.

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`, together with [[BUG-1743]] — one
mechanism carried both.

The runtime save payload is now built by `buildWritePayload`
(`apps/admin/lib/runtime/runtime-write-payload.ts`), the single choke point every
admin module writes through. An optional field holding `""` is omitted on create
and sent as `null` on edit, because `@IsOptional()` skips `null` and `undefined`
and nothing else — an empty string reached `@IsUUID()` and failed, taking the
whole request with it. The edit half matters as much as the create half: sending
nothing would have made a cleared lookup silently keep its old value.

The Partner-control question is answered by not needing an answer. `partnerId`
stays in the create DTO and stays unrendered, so the key is simply never sent.
Whether the form should offer a Partner lookup is still a product decision, and
it is no longer load-bearing for creating a lead.

Guarded by REG-272.

## QA Retest

Not yet retested in a browser. The mechanism is covered by
`apps/admin/lib/runtime/runtime-write-contract.spec.ts`, which builds the
untouched-form payload for **every** module and asserts nothing survives that
the module's DTO would reject.

Left `FIXED` rather than `VERIFIED`: this was reproduced in a browser against
production and should be closed the same way.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  reproduced in a browser against production `e0aeabcd`.
- 2026-08-28 - fixed by deriving the runtime write contract from the DTOs and normalizing empty optionals. REG-272.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[super-admin]]
- Regression — REG-272 (see the regression register)

<!-- GRAPH:END -->
