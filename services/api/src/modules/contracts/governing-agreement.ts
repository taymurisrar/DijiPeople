import { ContractStatus, ContractType, Prisma } from '@prisma/client';

/*
 * The single definition of "the customer has signed the agreement that governs
 * their subscription". Lead conversion and tenant provisioning both gate on
 * this, so it lives in one place rather than being restated per caller.
 */
export const GOVERNING_CUSTOMER_AGREEMENT_TYPES: ContractType[] = [
  ContractType.SUBSCRIPTION_AGREEMENT,
  ContractType.CUSTOMER_AGREEMENT,
  ContractType.MASTER_SERVICES_AGREEMENT,
];

/*
 * Signing completes at FULLY_EXECUTED; the states after it are the contract's
 * ordinary operating life, not a loss of execution. ARCHIVED is included
 * because retention filing does not unsign a document, while VOIDED, DECLINED,
 * TERMINATED and SUPERSEDED are deliberately absent.
 */
export const EXECUTED_CONTRACT_STATUSES: ContractStatus[] = [
  ContractStatus.FULLY_EXECUTED,
  ContractStatus.ACTIVE,
  ContractStatus.EXPIRING,
  ContractStatus.EXPIRED,
  ContractStatus.ARCHIVED,
];

export const GOVERNING_AGREEMENT_REQUIRED_MESSAGE =
  'The DijiPeople SaaS Subscription & Services Agreement must be fully executed before this Lead can be converted.';

export const TENANT_ORDER_AGREEMENT_REQUIRED_MESSAGE =
  'A fully executed governing customer agreement is required before a tenant provisioning service order can be issued.';

export function executedGoverningAgreementWhere(
  scope: Prisma.ContractWhereInput,
): Prisma.ContractWhereInput {
  return {
    ...scope,
    contractType: { in: GOVERNING_CUSTOMER_AGREEMENT_TYPES },
    status: { in: EXECUTED_CONTRACT_STATUSES },
  };
}

/*
 * Contracts reach a customer either through the direct foreign key or through
 * the related-record link written when the agreement was raised from a lead.
 */
export function customerAgreementScope(
  customerAccountId: string,
): Prisma.ContractWhereInput {
  return {
    OR: [
      { customerAccountId },
      {
        relatedRecords: {
          some: { entityType: 'CustomerAccount', entityId: customerAccountId },
        },
      },
    ],
  };
}

export function leadAgreementScope(leadId: string): Prisma.ContractWhereInput {
  return {
    OR: [
      { relatedLeadId: leadId },
      { relatedRecords: { some: { entityType: 'Lead', entityId: leadId } } },
    ],
  };
}
