import { BadRequestException, ConflictException } from '@nestjs/common';
import { ContractStatus, ContractType, Prisma } from '@prisma/client';

/**
 * BUG-3553. Statuses a *new* agreement must not be created against, or an
 * existing link changed onto. This is deliberately narrow: every other
 * status in the pipeline — including the in-progress agreement statuses like
 * `AGREEMENT_DRAFTING`/`AWAITING_SIGNATURE` — is the very process that
 * *produces* the agreement, and blocking those would make the guard block
 * the thing it exists to allow.
 */
export const UNUSABLE_PARTNER_STATUSES = [
  'TERMINATED',
  'REJECTED',
  'SUSPENDED',
  'INACTIVE',
] as const;

/**
 * `ARCHIVED`/`CLOSED_LOST`/`UNQUALIFIED` mirror this repository's own
 * "lost-inactive" grouping (`leads.repository.ts`'s `leadViewWhere`) rather
 * than inventing a second one. `CONVERTED` is added on top of that view's
 * definition: a converted lead already has a CustomerAccount, so a new
 * agreement belongs against the customer, not against the lead it came from.
 */
export const UNUSABLE_LEAD_STATUSES = [
  'ARCHIVED',
  'CLOSED_LOST',
  'UNQUALIFIED',
  'CONVERTED',
] as const;

/**
 * `ARCHIVED` is the literal instruction; `CHURNED` is added for the same
 * reason `CONVERTED` is added to leads above — the relationship this
 * agreement would document has structurally ended, not merely paused
 * (`SUSPENDED` customers are not included: suspension is reversible and a
 * tenant admin may need a new agreement, e.g. a reinstatement addendum,
 * while suspended).
 */
export const UNUSABLE_CUSTOMER_STATUSES = ['ARCHIVED', 'CHURNED'] as const;

/**
 * An agreement in any of these statuses no longer competes for "the live
 * agreement of this type for this counterparty" — it has left the pipeline
 * one way or another. Kept separate from `EXECUTED_CONTRACT_STATUSES`
 * (`governing-agreement.ts`) because that constant answers a different
 * question ("has this been signed") and duplicating its list here to answer
 * "is this still live" would be the second copy BUG-0011 warned about.
 */
export const TERMINAL_DUPLICATE_STATUSES: ContractStatus[] = [
  ContractStatus.DECLINED,
  ContractStatus.VOIDED,
  ContractStatus.SUPERSEDED,
  ContractStatus.TERMINATED,
  ContractStatus.ARCHIVED,
];

/** Contract types the duplicate guard never applies to — they exist to
 * follow an executed agreement, so colliding with it is the point. */
const DUPLICATE_GUARD_EXEMPT_TYPES: ContractType[] = [
  ContractType.AMENDMENT,
  ContractType.RENEWAL,
];

export function assertPartnerUsable(partner: {
  id: string;
  status: string;
  displayName?: string | null;
}) {
  if ((UNUSABLE_PARTNER_STATUSES as readonly string[]).includes(partner.status))
    throw new BadRequestException(
      `${partner.displayName ?? 'This partner'} is ${partner.status.toLowerCase()} and cannot be the source of a new agreement.`,
    );
}

export function assertLeadUsable(lead: {
  id: string;
  status: string;
  companyName?: string | null;
}) {
  if ((UNUSABLE_LEAD_STATUSES as readonly string[]).includes(lead.status))
    throw new BadRequestException(
      `${lead.companyName ?? 'This lead'} is ${lead.status.toLowerCase().replaceAll('_', ' ')} and cannot be the source of a new agreement.`,
    );
}

export function assertCustomerUsable(customer: {
  id: string;
  status: string;
  companyName?: string | null;
}) {
  if (
    (UNUSABLE_CUSTOMER_STATUSES as readonly string[]).includes(customer.status)
  )
    throw new BadRequestException(
      `${customer.companyName ?? 'This customer'} is ${customer.status.toLowerCase()} and cannot be the source of a new agreement.`,
    );
}

/**
 * When an agreement links both a partner and a lead, the lead must actually
 * be that partner's — otherwise nothing stops an operator attributing an
 * unrelated lead to a partner agreement (discovery D3, scenario 4: "SUPPORTED,
 * unvalidated combo").
 */
export function assertLeadAttributedToPartner(
  lead: { id: string; partnerId?: string | null; companyName?: string | null },
  partnerId: string,
) {
  if (lead.partnerId && lead.partnerId !== partnerId)
    throw new BadRequestException(
      `${lead.companyName ?? 'This lead'} is attributed to a different partner and cannot be linked to this agreement.`,
    );
}

export type DuplicateAgreementLinks = {
  contractType: ContractType;
  partnerId?: string | null;
  customerAccountId?: string | null;
  relatedLeadId?: string | null;
  customerOnboardingId?: string | null;
  tenantId?: string | null;
};

/**
 * BUG-3553 / discovery D3 scenario 27: `POST /contracts` had no protection
 * against a double submission — two calls with the same counterparty and
 * type each created a separate, fully valid `Contract` row (a fresh
 * `reference('CON')` number avoids any unique-constraint collision).
 *
 * Matches on whichever links the new agreement actually declares; an
 * agreement with no counterparty link at all (a bare NDA typed in by hand,
 * say) has nothing to be a duplicate *of* and is not checked.
 */
export async function findDuplicateAgreement(
  prisma: { contract: { findFirst: (args: unknown) => Promise<unknown> } },
  links: DuplicateAgreementLinks,
): Promise<{ id: string; contractNumber: string } | null> {
  if (DUPLICATE_GUARD_EXEMPT_TYPES.includes(links.contractType)) return null;
  const linkFilters: Prisma.ContractWhereInput[] = [];
  if (links.partnerId) linkFilters.push({ partnerId: links.partnerId });
  if (links.customerAccountId)
    linkFilters.push({ customerAccountId: links.customerAccountId });
  if (links.relatedLeadId)
    linkFilters.push({ relatedLeadId: links.relatedLeadId });
  if (links.customerOnboardingId)
    linkFilters.push({ customerOnboardingId: links.customerOnboardingId });
  if (links.tenantId) linkFilters.push({ tenantId: links.tenantId });
  if (!linkFilters.length) return null;
  return (await prisma.contract.findFirst({
    where: {
      contractType: links.contractType,
      status: { notIn: TERMINAL_DUPLICATE_STATUSES },
      AND: linkFilters,
    },
    select: { id: true, contractNumber: true },
  })) as { id: string; contractNumber: string } | null;
}

export function duplicateAgreementError(existing: {
  id: string;
  contractNumber: string;
}) {
  return new ConflictException({
    code: 'CONTRACT_DUPLICATE_AGREEMENT',
    message: `An active agreement already exists for this counterparty (${existing.contractNumber}). Create an amendment, renewal, or copy instead of a new agreement.`,
    details: { existingContractId: existing.id },
  });
}
