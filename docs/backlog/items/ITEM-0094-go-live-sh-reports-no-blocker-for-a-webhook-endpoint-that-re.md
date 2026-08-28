---
ID: ITEM-0094
aliases: [ITEM-0094]
Title: go-live.sh reports no blocker for a webhook endpoint that rejects every delivery
Type: TEST_GAP
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [scripts, api:billing, api:outbox]
Source: ARCHITECT
OwnerAgent: release-devops
ArchitectDisposition: DONE
CreatedAt: 2026-08-24
UpdatedAt: 2026-08-29
RelatedBug: BUG-0989
RelatedQA: docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0094 — go-live.sh reports no blocker for a webhook endpoint that rejects every delivery

## Summary

`scripts/go-live.sh` answers "what is between here and go-live" and is the thing
an operator reads before deciding the platform is ready to take money. Run
against production on 2026-08-24 it reported **`1 blocker(s)`** — Stripe test
mode — at a moment when **every Stripe webhook delivery was being rejected with
`400 VALIDATION_FAILED`** ([[BUG-0989]]).

The script has five checks: serving commit, Stripe mode, purchasable prices,
published legal documents, outbox worker. Not one of them touches webhook
delivery. So the single most consequential failure in the payment path — the one
where a customer is charged and the platform never learns of it — is invisible
to the check written to find exactly that class of problem.

## Why It Matters

A go-live check that under-reports is worse than no go-live check, because it
converts "I am not sure we are ready" into "we have one known blocker". Clear
that one blocker by switching `STRIPE_MODE=live` and the script would report
**no blockers at all** — while the first real customer pays and receives
nothing.

The failure is silent by construction. Stripe records the delivery as failed on
*its* side; the platform records a `400` in a log nobody is watching; the order
sits awaiting payment; and nothing connects those three facts.

This is the same shape as the defect it failed to catch. [[BUG-0904]]'s own
Proposed Resolution says it: *"an undrained outbox is invisible until someone
waits for a side effect that never arrives."* Webhook delivery is one step
further upstream and equally invisible.

## Evidence

- `scripts/go-live.sh` — checks 1 to 5. No check references
  `STRIPE_WEBHOOK_SECRET`, the webhook endpoint, or `StripeWebhookEvent`.
- Production run, 2026-08-24, from the Render Shell:

  ```
  Summary
    1 blocker(s) between here and go-live.
  ```

  with checks 3, 4 and 5 all `OK`.

- At that same moment: eleven `POST /api/billing/stripe/webhook` responses of
  `400 VALIDATION_FAILED` in the service log, and a probe returning
  `"Invalid Stripe webhook signature."` — see [[BUG-0989]].

## Proposed Approach

No ExecPlan. This is one more check in an existing script, plus one assertion in
an existing smoke suite.

1. **In `go-live.sh`, add a webhook-delivery check.** The honest signal is not
   reachable by sending a request — a deliberately-invalid signature is rejected
   whether the secret is right or wrong, which is precisely why the probe used
   during diagnosis could not confirm the fix. Use instead:
   - `STRIPE_WEBHOOK_SECRET` is set and non-empty;
   - the count of `StripeWebhookEvent` rows in the last 24h and how many are in
     a failed state — a table that is empty when Stripe should have been
     delivering is itself the finding;
   - name the dashboard step: *Developers → Webhooks → Recent deliveries →
     Resend*, which is the only true end-to-end confirmation.
2. **In `smoke:deployment`, assert the secret is configured.** It cannot assert
   correctness, but "set at all" is a real check that currently does not exist.
3. **Consider an alert on the failure ratio**, since the durable guard for a
   silent failure is monitoring rather than a test — [[ITEM-0009]]'s territory.

## Acceptance Criteria

- Run against a service whose `STRIPE_WEBHOOK_SECRET` does not match its
  endpoint, `go-live.sh` reports it as a blocker.
- The blocker text names the dashboard step that confirms the fix, because the
  script cannot confirm it itself.
- `npm run smoke:deployment` fails when `STRIPE_WEBHOOK_SECRET` is unset.
- The summary line's blocker count includes it, so "no blockers" means the
  payment path was actually exercised rather than merely configured.

## Dependencies

None. Independent of [[BUG-0989]]'s own fix — and worth doing whether or not
that fix lands, since the point is that the next such mismatch is caught by the
script rather than by a customer.

## Related Items

- [[BUG-0989]] — the defect this check failed to surface.
- [[BUG-0903]] — the one blocker it did report.
- [[BUG-0904]] — same class: a silent failure downstream of payment.
- [[ITEM-0078]] — the end-to-end run that is the real proof; this item is the
  cheap check that stands in front of it.
- [[ITEM-0009]] — no observability platform, which is why silent failures stay
  silent.
- [[unowned-verification-step]] — the pattern. A check exists, and the step it
  does not cover belongs to nobody.


## Resolution — 2026-08-29

Done, and **half of it turned out to be done already** — which is the part worth
recording, because this record would have had someone implement it twice.

**Step 2 was already in the tree.** `scripts/smoke-deployment.mjs` checks
`STRIPE_WEBHOOK_SECRET`: unset is a failure, a value that does not look like a
signing secret is a failure, and absent-from-this-process is an explicit skip
that `SMOKE_REQUIRE_STRIPE_WEBHOOK_SECRET=1` turns into a requirement. Nothing
was added there.

**Step 1 is new.** `go-live.sh` gains check 6, in two halves:

- `STRIPE_WEBHOOK_SECRET` set and shaped like `whsec_` — a blocker otherwise,
  because without it every delivery is rejected.
- Delivery history, read through `scripts/webhook-delivery-health.mjs`, which
  asks `billing/diagnostics` for the failure count and the last successful and
  failed deliveries. That endpoint already computed all three; nothing new was
  added to the API.

**What is deliberately not done: sending a probe.** A deliberately-invalid
signature is rejected whether the secret is right or wrong, which is exactly why
the probe used while diagnosing BUG-0989 could not confirm the fix. A green
probe would have been worse than no probe.

Three states, and the middle one is the point:

| | |
|---|---|
| `BLOCK` | deliveries arriving and failing |
| `WARN` | nothing has ever arrived — expected before the first sale, and the silent-failure signature after it, so the operator decides which they are looking at |
| `OK` | arriving, none failed in seven days |

**Unknown is never reported as health.** Without admin credentials in the shell,
or when the endpoint cannot be read, the script says the history was not
checked. That is the whole complaint this record was filed about: on 2026-08-24
it reported "1 blocker" while every delivery was being rejected, because silence
looked like success.

Step 3, an alert on the failure ratio, is not done and remains
[[ITEM-0009-no-observability-platform-exists]]'s territory. A durable guard for
a silent failure is monitoring, not a script somebody has to remember to run —
and the script now says so, naming the one thing that proves it end to end:
Stripe Dashboard → Developers → Webhooks → Recent deliveries → Resend.

## History

- 2026-08-24 — created at `363fe705`, from a production run of `go-live.sh`
  whose output disagreed with the service's observed behaviour.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0989]]
- Modules — [[billing]], [[outbox]]
- QA run — [[2026-08-24-record-state-reconciliation-0a5586f]]

<!-- GRAPH:END -->
