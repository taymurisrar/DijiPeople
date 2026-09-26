import {
  ContractPartyType,
  PartnerType,
  PartnershipModel,
} from '@prisma/client';

/**
 * What `PartnerType` (INDIVIDUAL/COMPANY) actually changes, in one place.
 *
 * BUG-3549. `PartnerType` and `PartnershipModel` answer different questions —
 * the schema comment at `schema.prisma:275-280` says so — but until now
 * neither one drove any behaviour at all. The identical onboarding requirement
 * list (`legalName`, `registrationNumber`, ...) was applied to an individual as
 * to a company, so a sole-proprietor partner was asked for a company
 * registration number with no individual-appropriate alternative.
 *
 * This module is the single place that answers "what does INDIVIDUAL vs
 * COMPANY require" so every enforcement point — admin create/update, the
 * public inquiry, the onboarding submission and its review — reads the same
 * answer instead of five call sites drifting the way
 * `contracts-and-agreements.md` (BUG-0011) already warns this codebase does.
 */

export type PartnerAdminIdentityField =
  | 'companyName'
  | 'legalName'
  | 'contactFirstName'
  | 'contactLastName';

export type PartnerTypePolicy = {
  /** Human label for the type, for messages and display — never a raw enum. */
  label: string;
  /**
   * Fields the admin create/update path (`CreatePartnerDto`/`UpdatePartnerDto`)
   * must have non-empty, beyond what the DTO already requires unconditionally.
   */
  adminRequiredFields: PartnerAdminIdentityField[];
  /**
   * Fields the onboarding submission (`PartnerOnboardingSubmission.data`) must
   * carry, replacing the one-size-fits-all list `validatePartnerOnboardingData`
   * used to apply to every applicant regardless of type.
   */
  onboardingRequiredFields: string[];
  /**
   * The counterparty party type an agreement records for this partner. Read by
   * `contracts.service.ts`'s default-party inference through
   * `contractPartyTypeForPartner` (ITEM-0203).
   */
  contractPartyType: ContractPartyType;
};

export const PARTNER_TYPE_POLICY: Record<PartnerType, PartnerTypePolicy> = {
  [PartnerType.COMPANY]: {
    label: 'Company',
    adminRequiredFields: ['companyName'],
    onboardingRequiredFields: [
      'legalName',
      'registrationNumber',
      'registeredAddress',
      'authorizedSigner',
      'privacyConsent',
    ],
    contractPartyType: ContractPartyType.PARTNER,
  },
  [PartnerType.INDIVIDUAL]: {
    label: 'Individual',
    adminRequiredFields: ['contactFirstName', 'contactLastName'],
    /*
     * The fix BUG-3549 is about: `registrationNumber` — a company registration
     * number — is replaced with `nationalIdNumber`, an identity document an
     * individual actually holds. Every other requirement (legal/full name, a
     * registered address, an authorized signer, privacy consent, and tax/bank
     * information where `partner-settings` requires it) is unchanged: no
     * evidence in this codebase distinguishes them for an individual, so this
     * policy does not invent a distinction the product never asked for.
     */
    onboardingRequiredFields: [
      'legalName',
      'nationalIdNumber',
      'registeredAddress',
      'authorizedSigner',
      'privacyConsent',
    ],
    contractPartyType: ContractPartyType.INDIVIDUAL,
  },
};

/** Fields a submission for this type must NOT be asked to provide. */
export function excludedOnboardingFieldsForType(type: PartnerType): string[] {
  const other =
    type === PartnerType.COMPANY ? PartnerType.INDIVIDUAL : PartnerType.COMPANY;
  const own = new Set(PARTNER_TYPE_POLICY[type].onboardingRequiredFields);
  return PARTNER_TYPE_POLICY[other].onboardingRequiredFields.filter(
    (field) => !own.has(field),
  );
}

/**
 * ITEM-0203. The party an agreement records for a partner counterparty: an
 * individual is an INDIVIDUAL party, a company a PARTNER party. A partner whose
 * type cannot be read keeps the PARTNER default every agreement used before.
 */
export function contractPartyTypeForPartner(
  type: PartnerType | null | undefined,
): ContractPartyType {
  return type
    ? PARTNER_TYPE_POLICY[type].contractPartyType
    : ContractPartyType.PARTNER;
}

export function partnerTypeLabel(type: PartnerType): string {
  return PARTNER_TYPE_POLICY[type]?.label ?? type;
}

/**
 * Which admin-create/update identity fields are missing for this type.
 *
 * Returns field keys, never throws — the caller decides the exception shape
 * and message so this stays a pure, independently testable rule.
 */
export function missingAdminIdentityFields(
  type: PartnerType,
  values: Partial<Record<PartnerAdminIdentityField, string | null | undefined>>,
): PartnerAdminIdentityField[] {
  const policy = PARTNER_TYPE_POLICY[type];
  if (!policy) return [];
  return policy.adminRequiredFields.filter((field) => !values[field]?.trim());
}

/**
 * Which onboarding submission fields are missing for this type.
 *
 * `settings` mirrors the toggles `validatePartnerOnboardingData` already
 * respected (`requireTaxInformation`, `requireBankInformation`) — those two
 * are settings-driven, not type-driven, and stay that way: nothing in this
 * codebase makes tax/bank collection depend on INDIVIDUAL vs COMPANY.
 */
export function missingOnboardingFields(
  type: PartnerType,
  data: Record<string, unknown>,
  settings: Record<string, unknown> = {},
): string[] {
  const policy = PARTNER_TYPE_POLICY[type];
  const required = policy ? [...policy.onboardingRequiredFields] : [];
  if (settings.requireTaxInformation !== false) required.push('taxInformation');
  if (settings.requireBankInformation !== false)
    required.push('bankingInformation');
  return required.filter(
    (key) => data[key] === undefined || data[key] === null || data[key] === '',
  );
}

/**
 * `PartnershipModel` — the commercial relationship — described exactly as the
 * code behaves today, not as a product intent.
 *
 * Every dimension below is currently identical across all seven models: no
 * service reads `partnershipModel` to change lead ownership, commission
 * eligibility, the required agreement type, or referral-link behaviour
 * (confirmed — `partnershipModel` appears nowhere in `partners.service.ts`'s
 * commission code, `partner-experience.service.ts`'s agreement-requirement
 * check, or the referral resolver). It is captured and carried through
 * conversion (ITEM-0030) and nothing more.
 *
 * This is recorded as fact, not invented as policy: `ContractType` already
 * defines `REFERRAL_ADDENDUM`, `COMMISSION_ADDENDUM` and `TERRITORY_ADDENDUM`,
 * which read as designed for exactly this kind of per-model differentiation,
 * but no code path selects among them by `partnershipModel`. That is a GAP for
 * the Architect to triage, not something this module should paper over by
 * fabricating a mapping nothing enforces.
 */
export type PartnershipModelPolicy = {
  label: string;
  leadOwnershipAllowed: boolean;
  commissionApplicable: boolean;
  /** The agreement type actually required today — the same for every model. */
  expectedAgreementType: 'PARTNER_AGREEMENT';
  /** True for every model today: recorded explicitly so this stays visible. */
  noBehavioralDifferenceFromOtherModels: true;
};

const PARTNERSHIP_MODEL_LABELS: Record<PartnershipModel, string> = {
  [PartnershipModel.REFERRAL]: 'Referral',
  [PartnershipModel.RESELLER]: 'Reseller',
  [PartnershipModel.IMPLEMENTATION]: 'Implementation',
  [PartnershipModel.TECHNOLOGY]: 'Technology',
  [PartnershipModel.STRATEGIC]: 'Strategic',
  [PartnershipModel.CONSULTANT]: 'Consultant',
  [PartnershipModel.OTHER]: 'Other',
};

export const PARTNERSHIP_MODEL_POLICY: Record<
  PartnershipModel,
  PartnershipModelPolicy
> = Object.fromEntries(
  Object.values(PartnershipModel).map((model) => [
    model,
    {
      label: PARTNERSHIP_MODEL_LABELS[model],
      leadOwnershipAllowed: true,
      commissionApplicable: true,
      expectedAgreementType: 'PARTNER_AGREEMENT',
      noBehavioralDifferenceFromOtherModels: true,
    } satisfies PartnershipModelPolicy,
  ]),
) as Record<PartnershipModel, PartnershipModelPolicy>;
