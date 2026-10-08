import { PartnerCommissionStatus, Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import type { PrismaService } from '../../common/prisma/prisma.service';

/*
 * ADR-0026 D3/D4 — a partner commission is an operator-created ledger entry.
 *
 * Nothing in billing accrues commissions (there is no source of commissionable
 * amounts and no payment hook; see the backlog item filed with EXECPLAN-0055
 * WP-06), so the rules here are the whole of the domain:
 *
 * - the rate is a percentage 0–100 (Decimal(5,2)), defaulting to the partner's
 *   configured default; 0 on the partner means "not configured", so an entry
 *   with no rate of its own and no configured default is refused rather than
 *   recorded as a 0% commission;
 * - the amount is `baseAmount × rate / 100`, computed here and never accepted
 *   from a caller;
 * - the status moves only forward through the machine below, and a PAID entry
 *   is final;
 * - the money terms (base, rate, amount, currency) are fixed at creation. No
 *   path edits them: a wrong entry is voided and a correct one added, which is
 *   what keeps the ledger explainable to the partner it is paid to.
 */

export const PARTNER_COMMISSION_ACTIONS = {
  'approve-commission': {
    from: [PartnerCommissionStatus.PENDING],
    to: PartnerCommissionStatus.APPROVED,
    label: 'Approve',
  },
  'mark-commission-payable': {
    from: [PartnerCommissionStatus.APPROVED],
    to: PartnerCommissionStatus.PAYABLE,
    label: 'Mark payable',
  },
  'mark-commission-paid': {
    from: [PartnerCommissionStatus.PAYABLE],
    to: PartnerCommissionStatus.PAID,
    label: 'Mark paid',
  },
  'void-commission': {
    from: [
      PartnerCommissionStatus.PENDING,
      PartnerCommissionStatus.APPROVED,
      PartnerCommissionStatus.PAYABLE,
    ],
    to: PartnerCommissionStatus.VOID,
    label: 'Void',
  },
} as const satisfies Record<
  string,
  {
    from: readonly PartnerCommissionStatus[];
    to: PartnerCommissionStatus;
    label: string;
  }
>;

export type PartnerCommissionActionKey =
  keyof typeof PARTNER_COMMISSION_ACTIONS;

export function isPartnerCommissionAction(
  value: string,
): value is PartnerCommissionActionKey {
  return Object.keys(PARTNER_COMMISSION_ACTIONS).includes(value);
}

const STATUS_LABELS: Record<PartnerCommissionStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  PAYABLE: 'Payable',
  PAID: 'Paid',
  VOID: 'Void',
};

/** The status `action` produces from `current`, or a refusal naming both. */
export function commissionTransition(
  current: PartnerCommissionStatus,
  action: PartnerCommissionActionKey,
): PartnerCommissionStatus {
  const rule = PARTNER_COMMISSION_ACTIONS[action];
  if (!(rule.from as readonly PartnerCommissionStatus[]).includes(current))
    throw new AppError('PARTNER_COMMISSION_TRANSITION_NOT_ALLOWED', {
      message: `${rule.label} is not available while the commission is ${STATUS_LABELS[current]}.`,
    });
  return rule.to;
}

/**
 * The action that moves `current` to `target`, for the older
 * `PATCH /partners/:id/commissions/:commissionId { status }` body. A target
 * no single action reaches — PAID → PENDING, PENDING → PAID, anything out of
 * VOID — is refused with the same domain error as the action itself.
 */
export function commissionActionForTarget(
  current: PartnerCommissionStatus,
  target: PartnerCommissionStatus,
): PartnerCommissionActionKey {
  const match = (
    Object.entries(PARTNER_COMMISSION_ACTIONS) as Array<
      [
        PartnerCommissionActionKey,
        (typeof PARTNER_COMMISSION_ACTIONS)[PartnerCommissionActionKey],
      ]
    >
  ).find(
    ([, rule]) =>
      rule.to === target &&
      (rule.from as readonly PartnerCommissionStatus[]).includes(current),
  );
  if (!match)
    throw new AppError('PARTNER_COMMISSION_TRANSITION_NOT_ALLOWED', {
      message: `A commission cannot move from ${STATUS_LABELS[current]} to ${STATUS_LABELS[target]}. The order is Pending → Approved → Payable → Paid; Void is available until it is paid.`,
    });
  return match[0];
}

/**
 * The rate an entry is recorded at: its own when given, else the partner's
 * configured default. A partner default of 0 is "not configured" (the column
 * defaults to 0), the same reading agreements give it.
 */
export function resolveCommissionRate(
  explicitRate: number | null | undefined,
  partnerDefault: { toString(): string } | number | null | undefined,
): Prisma.Decimal {
  if (explicitRate !== undefined && explicitRate !== null)
    return new Prisma.Decimal(explicitRate);
  const fallback =
    partnerDefault === undefined || partnerDefault === null
      ? null
      : new Prisma.Decimal(partnerDefault.toString());
  if (!fallback || fallback.lte(0))
    throw new AppError('PARTNER_COMMISSION_RATE_REQUIRED');
  return fallback;
}

/**
 * `baseAmount × rate / 100`, rounded half-up to cents in decimal arithmetic.
 * `Math.round(base * rate) / 100` drifted on binary fractions (1.005 × 100).
 */
export function computeCommissionAmount(
  baseAmount: number | Prisma.Decimal,
  rate: number | Prisma.Decimal,
): Prisma.Decimal {
  return new Prisma.Decimal(baseAmount)
    .mul(rate)
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

type CommissionLinkReader = Pick<
  PrismaService,
  'lead' | 'customerAccount' | 'invoice'
>;

/**
 * Linked lead, customer and invoice ids are plain columns with no foreign key
 * (schema `PartnerCommission`), so nothing but this check stops an entry from
 * citing a record that does not exist or that another partner referred.
 *
 * - a lead belongs to the partner through `Lead.partnerId`;
 * - a customer through `CustomerAccount.originatingPartnerId`;
 * - an invoice through its tenant: the tenant's own attribution, else the
 *   attribution of the customer account the tenant was provisioned for. When
 *   the entry also names a customer, the invoice must be that customer's.
 */
export async function assertCommissionLinksBelongToPartner(
  db: CommissionLinkReader,
  partnerId: string,
  links: {
    leadId?: string | null;
    customerAccountId?: string | null;
    invoiceId?: string | null;
  },
): Promise<void> {
  if (links.leadId) {
    const lead = await db.lead.findUnique({
      where: { id: links.leadId },
      select: { id: true, partnerId: true },
    });
    if (!lead) throw linkError('The linked lead was not found.');
    if (lead.partnerId !== partnerId)
      throw linkError('The linked lead was not referred by this partner.');
  }
  if (links.customerAccountId) {
    const customer = await db.customerAccount.findUnique({
      where: { id: links.customerAccountId },
      select: { id: true, originatingPartnerId: true },
    });
    if (!customer) throw linkError('The linked customer was not found.');
    if (customer.originatingPartnerId !== partnerId)
      throw linkError('The linked customer is not attributed to this partner.');
  }
  if (links.invoiceId) {
    const invoice = await db.invoice.findUnique({
      where: { id: links.invoiceId },
      select: {
        id: true,
        tenant: {
          select: {
            originatingPartnerId: true,
            customerAccountId: true,
            customerAccount: { select: { originatingPartnerId: true } },
          },
        },
      },
    });
    if (!invoice) throw linkError('The linked invoice was not found.');
    const attributedTo =
      invoice.tenant?.originatingPartnerId ??
      invoice.tenant?.customerAccount?.originatingPartnerId ??
      null;
    if (attributedTo !== partnerId)
      throw linkError(
        'The linked invoice is not for a customer attributed to this partner.',
      );
    if (
      links.customerAccountId &&
      invoice.tenant?.customerAccountId !== links.customerAccountId
    )
      throw linkError('The linked invoice belongs to a different customer.');
  }
}

function linkError(message: string) {
  return new AppError('PARTNER_COMMISSION_LINK_INVALID', { message });
}

/** What an entry was recorded against, for the partner's commission grid. */
export function commissionSourceLabel(
  commission: {
    leadId?: string | null;
    customerAccountId?: string | null;
    invoiceId?: string | null;
  },
  names: {
    leads?: Map<string, string>;
    customers?: Map<string, string>;
    invoices?: Map<string, string>;
  } = {},
): string {
  if (commission.invoiceId)
    return `Invoice ${names.invoices?.get(commission.invoiceId) ?? commission.invoiceId}`;
  if (commission.customerAccountId)
    return `Customer ${names.customers?.get(commission.customerAccountId) ?? commission.customerAccountId}`;
  if (commission.leadId)
    return `Lead ${names.leads?.get(commission.leadId) ?? commission.leadId}`;
  return 'Manual entry';
}

/**
 * The names the commission record's Lead and Customer fields display.
 *
 * The record read returned only `leadId`/`customerAccountId`, and a read-only
 * lookup has no option list to resolve an id against, so the commission page
 * showed "Not set" beside a lead the partner grid named in the same breath.
 * Null when the entry cites nothing, or the cited row is gone.
 */
export function commissionReferenceLabels(
  commission: { leadId?: string | null; customerAccountId?: string | null },
  names: {
    leads?: Map<string, string>;
    customers?: Map<string, string>;
  } = {},
): { leadLabel: string | null; customerLabel: string | null } {
  return {
    leadLabel: commission.leadId
      ? (names.leads?.get(commission.leadId) ?? null)
      : null,
    customerLabel: commission.customerAccountId
      ? (names.customers?.get(commission.customerAccountId) ?? null)
      : null,
  };
}

/** Decimals as numbers, the way every other partner read returns them. */
export function normalizeCommission<
  T extends {
    baseAmount: unknown;
    commissionRate: unknown;
    commissionAmount: unknown;
  },
>(commission: T) {
  return {
    ...commission,
    baseAmount: Number(commission.baseAmount),
    commissionRate: Number(commission.commissionRate),
    commissionAmount: Number(commission.commissionAmount),
  };
}
