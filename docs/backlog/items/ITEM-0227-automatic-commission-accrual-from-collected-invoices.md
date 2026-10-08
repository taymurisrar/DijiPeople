---
ID: ITEM-0227
aliases: [ITEM-0227]
Title: Automatic commission accrual from collected invoices
Type: PRODUCT_DECISION
Status: PRODUCT_DECISION
Priority: P2
Severity: 
AffectedModules: [partners, billing]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
CreatedAt: 2026-10-07
UpdatedAt: 2026-10-07
RelatedBug: 
RelatedQA: 
RelatedADR: ADR-0026
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0227 — Automatic commission accrual from collected invoices

## Summary

Partner commissions are recorded by hand. An operator adds each one from the
partner record. The API computes `baseAmount × rate / 100`, and the entry then
moves Pending → Approved → Payable → Paid, or is voided before it is paid.

Nothing creates a commission when a customer that a partner referred pays an
invoice. The owner must decide whether the platform should accrue commissions
automatically, and on what basis.

## Why It Matters

- Manual entry does not scale with partner volume. A paid invoice with no
  commission entry is a missed payment to a partner, and nothing reports it.
- The admin console's empty-state text used to say "Commissions are
  calculated when a partner-referred subscription bills". The code never did
  that, so operators expected entries that never appeared. EXECPLAN-0055 WP-06
  replaced the text with how entries are actually created.

## Evidence

- `services/api/src/modules/partners/partners.service.ts`:
  `createCommission` is the only writer of `PartnerCommission` rows.
- `services/api/src/modules/billing/services/subscription-order.service.ts`
  (around line 715): checkout stores the attribution columns
  (`originatingPartnerId`, `originatingReferralLinkId`,
  `referralCodeSnapshot`). The comment there says commission is "calculated
  from" them, but no calculator exists.
- `PartnerCommission` (`services/api/prisma/schema.prisma`) stores `leadId`,
  `customerAccountId` and `invoiceId` as plain ids, with no relations and no
  link to a payment.
- ADR-0026 decision 4 rejected building this now: "there is no source of
  commissionable amounts".

## Proposed Approach

The owner must answer these first, because each one changes money paid out:

1. **Basis.** Is the commissionable amount the invoice subtotal, the net of
   tax, the net of discounts and credit notes, or only recurring line items?
2. **Trigger.** Does a commission accrue when the invoice is issued, when it is
   paid in full, or for each payment?
3. **Duration.** Does every invoice for the referred customer accrue, or only
   the first N months or the first year? Does this differ by partnership model
   or by agreement?
4. **Rate source.** Is the rate the commission percentage on the partner's
   signed agreement (snapshotted since WP-06), or the partner default?
5. **Refunds and credits.** Does a refund void or reverse the accrued entry?
   What happens if that entry has already been paid?
6. **Currency.** Is the commission in the invoice currency or in the
   partner's currency? If they differ, which exchange rate applies, and on
   which date?

Once those are answered, the work would:

- add a billing hook, on invoice payment or invoice issue, that resolves the
  attributed partner through the tenant or customer chain. This is the chain
  `assertCommissionLinksBelongToPartner` already uses;
- create a PENDING entry through `PartnersService.createCommission`, so the
  existing rules still apply (link ownership, the enabled-currency check, the
  server-computed amount, audit and the partner timeline);
- make the hook idempotent per invoice or payment. That needs a unique key,
  such as `@@unique([invoiceId, ...])` or a source-event id, so a webhook
  retry cannot accrue twice;
- add a refund path that voids or offsets the entry, following the status
  machine.

This changes the schema and moves money, so it needs an ExecPlan under
`PLANS.md`.

## Acceptance Criteria

- The owner has answered the six questions above, and the answers are
  recorded in an ADR.
- If the answer is "build it": paying an invoice for a partner-attributed
  customer creates exactly one PENDING commission. Its base, rate, amount and
  currency follow the recorded rules.
- A retried payment webhook creates no second entry.
- A refund follows the recorded rule, and a PAID entry is never silently
  changed.

## Dependencies

- EXECPLAN-0055 WP-06, which provides the commission status machine, the link
  ownership checks and the agreement commission snapshot.

## Related Items

- [[TASK-0037-partner-module-completion-delete-numbering-status-lifecycle-]]:
  the task that recorded this decision.
- [[ADR-0026-partner-lifecycle-commission-and-currency]]: commission is a
  snapshotted percentage, and accrual is deferred.
- [[partners]]: the module that owns commission entries.

## History

- 2026-10-07 — created at `c01b778b` by EXECPLAN-0055 WP-06. Disposition
  PRODUCT_DECISION. The basis, trigger and duration of an automatic accrual
  are commercial terms that only the owner can set.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[BUG-3982]]
- Modules — [[partners]], [[billing]]

<!-- GRAPH:END -->
