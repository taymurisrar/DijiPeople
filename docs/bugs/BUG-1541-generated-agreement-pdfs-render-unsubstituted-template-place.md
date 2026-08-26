---
ID: BUG-1541
aliases: [BUG-1541]
Title: Generated agreement PDFs render unsubstituted template placeholders
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [contracts, legal]
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

# BUG-1541 — Generated agreement PDFs render unsubstituted template placeholders

## Summary

Agreements generated from a contract template render their merge fields as raw
`{{handlebars}}` tokens instead of the customer's data. A generated PDF names
neither the counterparty, the tenant, nor the billing dates, so nothing produced
by this path can be sent to a customer. The contract *title* merges correctly,
which narrows the fault to template-body rendering rather than to the merge data
or the template record.

## Expected Behavior

Generating an agreement document substitutes every merge field defined by the
template with the values held on the contract and its related customer, tenant
and plan records. A generated document is fit to send.

## Actual Behavior

More than 30 tokens survive into the rendered document verbatim, including the
customer legal name, registered address, tenant name and workspace URL, admin
contact, entitled modules, SLA terms and billing dates. Whitespace between
adjacent tokens is also lost, so consecutive placeholders run together.

The document title on the same record merges correctly.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open a customer record — `QA E2E Customer 20260826` reproduces it.
3. Create an agreement from the template
   "DijiPeople Tenant Provisioning & Service Order".
4. Open the generated agreement and generate its document.
5. Read the rendered body rather than the record header.

## Evidence

Observed on production, 2026-08-26, against contract `CON-20260826-DCA95FD5`:

- The rendered body contains unsubstituted tokens for, among others, customer
  legal name, registered address, tenant name, workspace URL, admin contact,
  entitled module list, SLA response times and billing period dates.
- The contract title rendered its merge field correctly on the same record,
  from the same contract data.
- Whitespace separating adjacent tokens was absent in the output.

The reproduction customer and contract were deliberately left on production so
this record can be verified against a live case. They are listed for cleanup
once the fix is confirmed.

## Root Cause

Not established. The title rendering correctly while the body does not suggests
two different rendering paths, or a body that is stored and re-emitted without
ever being passed through the template engine. That is a hypothesis, not a
finding — it must be confirmed against `contracts` before any fix is designed.

## Impact

Every agreement generated from a template is unusable. This is the document a
customer signs, so the defect is directly customer-visible and blocks the
commercial contract lifecycle at its first step. Any agreement already sent
from this path carries no counterparty identification and is unlikely to be
enforceable.

Reachable in production today by any platform operator.

## Affected Areas

- `services/api/src/modules/contracts` — agreement document generation
- `services/api/src/modules/legal` — versioned template storage
- `apps/admin` — the agreement record screen and its generate action
- Every contract template that defines body merge fields

## Proposed Resolution

Establish which code path renders the body and why it differs from the one that
renders the title. If the body is rendered by a different mechanism, converge
them. Add a rendering test that asserts no `{{` survives into output for a
representative template, so this cannot regress silently.

Whitespace loss between adjacent tokens should be fixed in the same change; it
points at the same rendering step.

## Acceptance Criteria

- A document generated from "DijiPeople Tenant Provisioning & Service Order"
  contains no `{{` sequence anywhere in its rendered body.
- Customer legal name, registered address, tenant name, workspace URL, admin
  contact, module list, SLA terms and billing dates all show record values.
- Whitespace between adjacent merge fields is preserved.
- A template field with genuinely no value renders a defined placeholder or an
  empty string, never the raw token.

## Regression Coverage

None yet. The fix must add a test that renders a template containing every
supported merge field and asserts that no unsubstituted token remains. It needs
a `REG-nnn` entry in the regression register once that test exists.

## Dependencies

None. This is independently fixable.

## Related Items

Found during the same production admin E2E pass as [[BUG-1515]] and
[[BUG-1516]]. Unrelated in cause to both.

## Resolution

Not yet resolved.

## QA Retest

Not yet retested. Retest against `CON-20260826-DCA95FD5` while it remains on
production, then against a freshly generated agreement.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[contracts-and-agreements]], [[legal]]

<!-- GRAPH:END -->
