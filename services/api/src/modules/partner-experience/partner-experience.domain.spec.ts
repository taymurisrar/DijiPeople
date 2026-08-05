import { BadRequestException } from '@nestjs/common';
import { validatePartnerOnboardingData } from './partner-experience.service';

const complete = {
  legalName: 'Northstar LLC',
  registrationNumber: 'REG-1',
  registeredAddress: 'Riyadh',
  authorizedSigner: 'Nadia Rahman',
  privacyConsent: true,
  taxInformation: 'VAT-1',
  bankingInformation: 'Verified account',
};

describe('partner onboarding policy', () => {
  it('accepts a complete submission', () => {
    expect(() => validatePartnerOnboardingData(complete)).not.toThrow();
  });

  it('enforces configured compliance data and explicit privacy consent', () => {
    expect(() =>
      validatePartnerOnboardingData({ ...complete, taxInformation: undefined }),
    ).toThrow(BadRequestException);
    expect(() =>
      validatePartnerOnboardingData({ ...complete, privacyConsent: false }),
    ).toThrow('Privacy consent is required.');
  });

  it('supports settings that make tax and bank information optional', () => {
    const {
      taxInformation: _tax,
      bankingInformation: _bank,
      ...data
    } = complete;
    expect(() =>
      validatePartnerOnboardingData(data, {
        requireTaxInformation: false,
        requireBankInformation: false,
      }),
    ).not.toThrow();
  });
});
