import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CustomerOnboardingStatus } from '@prisma/client';
import {
  CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS,
  getDefaultSubStatus,
  isValidCustomerOnboardingSubStatus,
} from './platform-lifecycle.constants';

/*
 * REG-010 — every onboarding created by lead conversion was born unusable.
 *
 * convertLeadToCustomer seeded the new CustomerOnboarding with
 * status NOT_STARTED and subStatus 'Agreement executed'. That pair is not in
 * CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS, whose NOT_STARTED list is
 * ['Awaiting kickoff', 'Kickoff scheduled'].
 *
 * updateCustomerOnboarding validates the *effective* sub-status on every call,
 * so the invalid seed made the record permanently un-editable: a PATCH that
 * touched nothing but `notes` came back 400 "Onboarding sub-status is not valid
 * for the selected onboarding status." The operator could only escape by
 * guessing that a status change had to be sent in the same request. The E2E run
 * hit this immediately after conversion, on the very first onboarding edit.
 *
 * The seed now asks the catalogue for the default rather than hardcoding a
 * label, so the two cannot drift apart again.
 */
describe('CustomerOnboarding seeded by lead conversion', () => {
  /*
   * Asserted against the source text because the seed sits deep inside
   * convertLeadToCustomer's transaction, behind a dozen collaborators. What has
   * to stay true is narrow and textual: the conversion path must not write a
   * hardcoded sub-status literal that the catalogue does not know about.
   */
  const serviceSource = readFileSync(
    join(__dirname, 'platform-lifecycle.service.ts'),
    'utf8',
  );

  it('does not hardcode the invalid seed literal in the conversion path', () => {
    expect(serviceSource).not.toContain("subStatus: 'Agreement executed'");
  });

  it('derives the seeded sub-status from the catalogue', () => {
    expect(serviceSource.replace(/\s+/g, ' ')).toContain(
      "getDefaultSubStatus( 'customerOnboarding'",
    );
  });

  it('seeds a sub-status that its own validator accepts', () => {
    const seeded = getDefaultSubStatus(
      'customerOnboarding',
      CustomerOnboardingStatus.NOT_STARTED,
    );
    expect(seeded).not.toBeNull();
    expect(
      isValidCustomerOnboardingSubStatus(
        CustomerOnboardingStatus.NOT_STARTED,
        seeded as string,
      ),
    ).toBe(true);
  });

  it("no longer seeds the invalid 'Agreement executed' label", () => {
    /*
     * The executed agreement is already recorded by the onboarding's
     * contractSigned flag, so the sub-status never needed to restate it.
     */
    expect(
      isValidCustomerOnboardingSubStatus(
        CustomerOnboardingStatus.NOT_STARTED,
        'Agreement executed',
      ),
    ).toBe(false);
    expect(
      getDefaultSubStatus(
        'customerOnboarding',
        CustomerOnboardingStatus.NOT_STARTED,
      ),
    ).toBe('Awaiting kickoff');
  });

  /*
   * Generalised: any status we seed or transition into must have a usable
   * default, or the same class of defect reappears elsewhere in the lifecycle.
   */
  it.each(Object.values(CustomerOnboardingStatus))(
    'every %s onboarding status has a valid default sub-status',
    (status) => {
      const fallback = getDefaultSubStatus('customerOnboarding', status);
      expect(CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS[status].length).toBeGreaterThan(0);
      expect(fallback).not.toBeNull();
      expect(
        isValidCustomerOnboardingSubStatus(status, fallback as string),
      ).toBe(true);
    },
  );
});
