---
ID: ITEM-0096
aliases: [ITEM-0096]
Title: A critical notification named no reason and no action, and the price estimate showed no working
Type: UX
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [api:platform-events, apps/admin, apps/landing]
Source: USER_REPORT
OwnerAgent: frontend
ArchitectDisposition: DONE
CreatedAt: 2026-08-24
UpdatedAt: 2026-08-24
ResolvedAt: 2026-08-24
RelatedBug: BUG-1128
RelatedQA: docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0096 — A critical notification named no reason and no action, and the price estimate showed no working

## Summary

Two surfaces showed a number or a status without the reasoning behind it, and
left the reader to reconstruct it.

**The notification.** A live `CRITICAL` row read:

> **Provider webhook failed**
> Stripe webhook processed
> CRITICAL · 4 minutes ago · Unread

A title saying *failed*, a body saying *processed*, and nothing to do. The owner:
*"that notification is meaningless … what will the platform user do looking at
it?"*

**The estimate.** For a one-person company, `/plans` showed *"QAR 80 · estimated
per month · below this plan's minimum"*. The reader typed **1**; nothing on
screen multiplied to **80**.

## Why It Matters

A `CRITICAL` badge that cannot be acted on trains an operator to ignore the
badge — which is precisely the failure `platform-notifications.ts` opens by
warning against: *"an operator would learn within a day to ignore the dot, which
is worse than no feed."* The catalogue was built to prevent that and this row
defeated it anyway.

For pricing, an unexplained figure reads as a **mistake**, not as a minimum
commitment. The arithmetic was right — the presentation invited the visitor to
distrust it.

## Evidence

Three separate defects behind one symptom, which is why the title alone did not
explain it:

1. **`describe()` never read `metadata.error`.** It checked `message`,
   `failureReason` and `reason`. `WebhookService.processStripeEvent` records
   `{ error: getSafeErrorMessage(error) }` — the one key not on the list — so a
   specific reason ("Stripe invoice could not be mapped to a DijiPeople
   subscription") was discarded for the fallback, which humanises the event code
   into *"Stripe webhook processed"*.
2. **The popover dropped `action`.** `PlatformNotification.action` has always
   existed and `notifications-feed.tsx` has always rendered it — but
   `notification-bell.tsx` did not. The surface an operator actually looks at
   was the one with no instruction.
3. **The action text stated a consequence, not a step:** *"Payments confirm
   through webhooks only. While these fail, paid orders will not advance."* True,
   and there is still nothing to do with it.

For the estimate, `estimateCost` already returned `billable` — the seat count
actually charged — and the card rendered only `total`.

## Proposed Approach

- Add `error` to the `describe()` fallback chain, after the deliberate names.
- Render `action` in the popover, clamped tighter than the detail.
- Rewrite the webhook rule to answer *and then what*, in working order: see the
  failure, fix it, replay it.
- Retitle it by consequence rather than mechanism.
- On the estimate, show `billable × rate`, and name the minimum as a quantity
  when it is doing the work.

## Acceptance Criteria

- A failed webhook notification shows the real failure reason.
- The popover shows the action.
- The action names a place to look and a step to take.
- The estimate shows the seats charged and the rate per seat.
- Where the minimum is billed instead of the entered headcount, the card says so.

## Dependencies

Surfaced by [[BUG-1128]] — the failed `invoice.paid` deliveries were what put a
live CRITICAL row in front of the owner.

## Related Items

- [[BUG-1128]], [[BUG-0989]] — the events that produced the notification.
- [[ITEM-0095]] — the sibling home/plans parity fix on the same surface.
- [[BUG-0080]] — a page and an invoice disagreeing; the reason the estimate
  restates the server's arithmetic rather than computing its own.
- [[landing-architecture]], [[platform-admin]]

## Resolution

Done on `agent/record-state-reconciliation`.

`describe()` now reads `error` last in the chain — a message an emitter wrote on
purpose still beats an error string it happened to catch, and both beat the
code. The popover renders `action`. The webhook rule is retitled **"Stripe could
not tell us about a payment"** and its action names the path: *Developers →
Webhooks → Recent deliveries* to see the rejection, then **Resend** once fixed,
with the reassurance that it is retried and not lost.

On `/plans`, each estimate now shows `10 seats (this plan's minimum, not your 1)
× QAR 8 each`, and the section intro states the minimum before the numbers
rather than qualifying them afterwards. `estimate.billable` is the server's own
`max(teamSize, minimumSeats, 1)`, restated — deliberately not recomputed, which
is the mistake [[BUG-0080]] was found through.

**One existing assertion had to change**, and it is worth recording why: the
spec pinned the literal phrase `"will not advance"`. It now asserts the action
carries a stake *and* a step. The old copy stated only the stake and passed —
so a test pinned to its wording could never have caught this, and a rewrite that
kept the phrase while still saying nothing to do would have been green.

Verified: `platform-events` 3 suites / 20 tests; landing 11 suites / 149 tests;
admin and landing typecheck clean; 0 lint errors.

**Not fixed here:** the notification for a *successful* webhook is still absent
by design, and the two remaining `no-unsafe` warnings in `platform-events` are
pre-existing and belong to [[ITEM-0080]].

## History

- 2026-08-24 — reported by the owner from a live notification and the Qatar
  pricing view, and fixed the same day.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-1128]]
- Modules — [[audit-and-events]], [[platform-admin]], [[landing-architecture]]
- QA run — [[2026-08-24-record-state-reconciliation-0a5586f]]

<!-- GRAPH:END -->
