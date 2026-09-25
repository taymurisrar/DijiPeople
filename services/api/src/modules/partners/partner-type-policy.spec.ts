import { PartnerType } from '@prisma/client';
import {
  PARTNER_TYPE_POLICY,
  PARTNERSHIP_MODEL_POLICY,
  missingAdminIdentityFields,
  missingOnboardingFields,
  partnerTypeLabel,
} from './partner-type-policy';

/*
 * BUG-3549. `PartnerType` (INDIVIDUAL/COMPANY) drove zero behaviour before
 * this module existed — the same required-field list, including a company
 * registration number, applied to every applicant. These specs pin the two
 * things that actually distinguish the types now, and prove the one field
 * this task exists to fix.
 */

describe('partner-type-policy — admin identity fields', () => {
  it('requires a company name for a COMPANY partner', () => {
    expect(
      missingAdminIdentityFields(PartnerType.COMPANY, { companyName: '' }),
    ).toEqual(['companyName']);
    expect(
      missingAdminIdentityFields(PartnerType.COMPANY, {
        companyName: 'Acme Inc',
      }),
    ).toEqual([]);
  });

  it('requires a full name for an INDIVIDUAL partner, not a company name', () => {
    expect(
      missingAdminIdentityFields(PartnerType.INDIVIDUAL, {
        contactFirstName: '',
        contactLastName: '',
      }),
    ).toEqual(['contactFirstName', 'contactLastName']);
    expect(
      missingAdminIdentityFields(PartnerType.INDIVIDUAL, {
        contactFirstName: 'Ada',
        contactLastName: 'Lovelace',
      }),
    ).toEqual([]);
    // An individual is never asked for a company name.
    expect(PARTNER_TYPE_POLICY[PartnerType.INDIVIDUAL].adminRequiredFields).not.toContain(
      'companyName',
    );
  });

  it('treats whitespace-only values as missing, not present', () => {
    expect(
      missingAdminIdentityFields(PartnerType.COMPANY, { companyName: '   ' }),
    ).toEqual(['companyName']);
  });
});

describe('partner-type-policy — onboarding submission fields', () => {
  it('requires a registration number for COMPANY, and never a national ID', () => {
    const missing = missingOnboardingFields(PartnerType.COMPANY, {
      legalName: 'Acme Inc',
      registrationNumber: 'REG-1',
      registeredAddress: { line1: '1 Main St' },
      authorizedSigner: { name: 'Jane' },
      privacyConsent: true,
      taxInformation: { taxId: '123' },
      bankingInformation: { iban: 'x' },
    });
    expect(missing).toEqual([]);
    expect(PARTNER_TYPE_POLICY[PartnerType.COMPANY].onboardingRequiredFields).toContain(
      'registrationNumber',
    );
    expect(
      PARTNER_TYPE_POLICY[PartnerType.COMPANY].onboardingRequiredFields,
    ).not.toContain('nationalIdNumber');
  });

  /*
   * The exact defect this record exists for: an INDIVIDUAL applicant used to
   * be told `registrationNumber` was missing from their submission, with no
   * individual-appropriate field ever offered as an alternative.
   */
  it('requires a national ID for INDIVIDUAL instead of a company registration number', () => {
    const missingWithoutNationalId = missingOnboardingFields(
      PartnerType.INDIVIDUAL,
      {
        legalName: 'Ada Lovelace',
        registeredAddress: { line1: '1 Main St' },
        authorizedSigner: { name: 'Ada' },
        privacyConsent: true,
        taxInformation: { taxId: '123' },
        bankingInformation: { iban: 'x' },
      },
    );
    expect(missingWithoutNationalId).toEqual(['nationalIdNumber']);
    expect(missingWithoutNationalId).not.toContain('registrationNumber');

    const complete = missingOnboardingFields(PartnerType.INDIVIDUAL, {
      legalName: 'Ada Lovelace',
      nationalIdNumber: 'ID-12345',
      registeredAddress: { line1: '1 Main St' },
      authorizedSigner: { name: 'Ada' },
      privacyConsent: true,
      taxInformation: { taxId: '123' },
      bankingInformation: { iban: 'x' },
    });
    expect(complete).toEqual([]);
  });

  it('still respects the settings-driven tax/bank toggles for both types', () => {
    const base = {
      legalName: 'Acme Inc',
      registrationNumber: 'REG-1',
      registeredAddress: { line1: '1 Main St' },
      authorizedSigner: { name: 'Jane' },
      privacyConsent: true,
    };
    expect(
      missingOnboardingFields(PartnerType.COMPANY, base, {
        requireTaxInformation: false,
        requireBankInformation: false,
      }),
    ).toEqual([]);
    expect(
      missingOnboardingFields(PartnerType.COMPANY, base, {}),
    ).toEqual(
      expect.arrayContaining(['taxInformation', 'bankingInformation']),
    );
  });

  it('gives every type a human label, never a raw enum name', () => {
    expect(partnerTypeLabel(PartnerType.COMPANY)).toBe('Company');
    expect(partnerTypeLabel(PartnerType.INDIVIDUAL)).toBe('Individual');
  });
});

describe('partner-type-policy — partnership model matrix', () => {
  /*
   * Recorded as fact, not invented: no service reads `partnershipModel` to
   * change commission eligibility, lead ownership or the required agreement
   * type (D2 discovery). The matrix says so explicitly rather than fabricating
   * a distinction the code does not enforce.
   */
  it('states no behavioural difference between models, matching what the code does today', () => {
    for (const policy of Object.values(PARTNERSHIP_MODEL_POLICY)) {
      expect(policy.noBehavioralDifferenceFromOtherModels).toBe(true);
      expect(policy.leadOwnershipAllowed).toBe(true);
      expect(policy.commissionApplicable).toBe(true);
      expect(policy.expectedAgreementType).toBe('PARTNER_AGREEMENT');
    }
  });

  it('covers every PartnershipModel value the schema defines', () => {
    const values = ['REFERRAL', 'RESELLER', 'IMPLEMENTATION', 'TECHNOLOGY', 'STRATEGIC', 'CONSULTANT', 'OTHER'];
    for (const value of values) {
      expect(PARTNERSHIP_MODEL_POLICY).toHaveProperty(value);
    }
  });
});
