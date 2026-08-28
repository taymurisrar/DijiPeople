---
ID: BUG-1543
aliases: [BUG-1543]
Title: Stripe webhook rejected as VALIDATION_FAILED during a live payment
Status: DEFERRED
Severity: HIGH
Priority: P1
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [billing]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport: 
RegressionId: REG-299
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1543 — Stripe webhook rejected as VALIDATION_FAILED during a live payment

> **Architect triage, 2026-08-27 — `DEFER`.** Diagnosis is blocked behind BUG-1516, which is the most likely cause and is FIX_NOW. Re-evaluate once that lands; the symptom may simply go.


## Summary

During a real Stripe payment on production, the billing webhook endpoint
rejected Stripe's callbacks twice with `400 VALIDATION_FAILED`. The payment
itself succeeded and the tenant provisioned, so the rejection did not stop the
funnel — but it raised the critical "a customer may have paid without us
knowing" alert, which is exactly the condition the alert exists to detect.

## Expected Behavior

Every webhook Stripe delivers is accepted and processed, or is rejected for a
reason the platform records and an operator can act on. A successful payment
does not produce a rejected webhook.

## Actual Behavior

`POST /api/billing/stripe/webhook` returned `400 VALIDATION_FAILED` twice during
a single live payment. Two platform events were raised, including the critical
payment-attribution alert.

## Reproduction

1. Complete a paid signup through `www.dijipeople.com` with a Stripe test card.
2. Observe the payment succeed and the tenant provision.
3. Read the API logs for the webhook endpoint across the payment window.
4. Observe two `400 VALIDATION_FAILED` responses.

Reproduction depends on the duplicate-customer condition in [[BUG-1516]] being
present; see Root Cause.

## Evidence

Observed on production, 2026-08-26:

- Render API logs at 13:36:42Z contain two `POST /api/billing/stripe/webhook`
  responses of `400 VALIDATION_FAILED`.
- Two platform events were raised in the same window, one of them the critical
  payment-attribution alert.
- The payment completed: `PAID` invoice, `SUCCEEDED` payment, `ACTIVE`
  subscription and an `ACTIVE` tenant, all within roughly four seconds.

## Root Cause

Not established, but causally linked to [[BUG-1516]]: public signup creates
duplicate customer records, and Stripe tenant resolution cannot then decide
which customer the payment belongs to. Whether the 400 is thrown by that
ambiguity or by an unrelated payload validation failure has not been confirmed.

## Impact

The alert fires on real payments, which trains operators to ignore the one
signal that would tell them a customer paid and was not provisioned. Because the
funnel currently succeeds anyway, the defect is a monitoring integrity problem
rather than a revenue-loss problem — but it sits on the path where a genuine
attribution failure would appear, and would be indistinguishable from this noise.

Reachable in production on every paid signup that hits the duplicate condition.

## Affected Areas

- `services/api/src/modules/billing` — Stripe webhook handler
- `services/api/src/modules/platform-events` — the critical alert
- `services/api/src/modules/super-admin` — customer resolution

## Proposed Resolution

Fix [[BUG-1516]] first and re-run a paid signup, because the duplicate customer
is the most likely cause and clearing it may remove the symptom entirely. If the
400 survives that fix, capture the rejected payload shape and the specific
validation failure before designing anything further.

A rejected webhook should record which validation failed, so this does not
require log archaeology next time.

## Acceptance Criteria

- A complete paid signup produces no `400` response from the Stripe webhook
  endpoint.
- No critical payment-attribution alert is raised by a payment that succeeded.
- A webhook that is genuinely rejected records the failing field.

## Regression Coverage

None yet. Needs a test that drives the webhook handler with the payload shape
Stripe sends for this flow and asserts acceptance. Requires a `REG-nnn` entry
once written.

## Dependencies

Blocked behind [[BUG-1516]] for diagnosis — fixing that may resolve this.

## Related Items

Causally linked to [[BUG-1516]]. Found in the same production pass as
[[BUG-1515]].

## Resolution

**Partially addressed 2026-08-28. The cause is still unknown and this stays
deferred.**

This record sequences the work: fix [[BUG-1516]] first, re-run a paid signup,
and only then capture the payload if the 400 survives. BUG-1516 is fixed and
awaiting verification; the re-run needs a real Stripe payment on production,
which the repository owner put out of scope on 2026-08-28. So the diagnosis has
not moved.

What *was* done is the record's second, independent ask: *"A rejected webhook
should record which validation failed, so this does not require log archaeology
next time."*

`VALIDATION_FAILED` is the error catalog's code for every 400, so the response
cannot distinguish three quite different refusals. Each now logs which check
refused it, and they need opposite responses:

- **signature header absent** — the caller is not Stripe;
- **body is not a Buffer** — the raw-body middleware did not run for this route,
  which is a configuration answer;
- **signature does not verify** — either the wrong webhook secret for this
  endpoint, or a forgery. This one previously propagated uncaught and arrived
  as an indistinguishable 400.

Neither the payload nor the signature is logged — the body is a customer's
payment detail and the signature is a credential. What is recorded is which
check failed, the body's shape or size, and the verifier's own message.

Nothing about the response to Stripe changed.

Guarded by REG-299.

## QA Retest

**Not retested, and the cause is not established.** This stays deferred on
purpose.

The next step is unchanged and is the one this record already specifies: re-run
a paid signup on production now that BUG-1516 is fixed. If the 400 recurs, the
log line now names which of the three checks refused it — which is the whole
point of the change made today, and what turns the next occurrence into a
five-minute diagnosis instead of log archaeology.

The alert this raised is worth keeping in mind when it does: "a customer may
have paid without us knowing" is exactly the right thing to be paged for, and
the rejection was noise rather than a lost payment. A fix that silenced the
alert instead of explaining the rejection would be the wrong one.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - added the rejection diagnostics this record asks for; the cause is still unknown and needs a paid signup re-run, which is out of scope today. REG-299.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]]
- Regression — REG-299 (see the regression register)

<!-- GRAPH:END -->
