import { PartnerOnboardingStatus, PartnerStatus } from '@prisma/client';
import {
  PARTNER_LIFECYCLE_CLOSED_TO_ONBOARDING_REVIEW,
  PARTNER_ONBOARDING_REVIEWABLE_STATUSES,
  partnerOnboardingReviewRefusal,
} from './partner-onboarding.state-machine';

/*
 * REG — BUG-0016: partner onboarding review had no state machine.
 *
 * `reviewOnboarding` derived the new status from the `decision` argument alone
 * and wrote it with no check on the current one. Two reproduced consequences:
 *
 *   1. An application in INVITED — never submitted, legalName and iban both
 *      null — was approved, and the partner activated. The compliance gate was
 *      satisfiable without the compliance data it exists to review.
 *   2. An APPROVED application was flipped to REJECTED after activation,
 *      cascading a live ACTIVE partner with a signed agreement and a working
 *      referral link to REJECTED.
 *
 * These tests pin the from-sets, not the implementation: a decision requires a
 * submission, and a live partner is not reachable by this endpoint.
 */
describe('partner onboarding review state machine', () => {
  const submitted = new Date('2026-08-01T00:00:00.000Z');

  const subject = (
    overrides: Partial<{
      status: PartnerOnboardingStatus;
      submittedAt: Date | null;
      partnerStatus: PartnerStatus;
    }> = {},
  ) => ({
    status: PartnerOnboardingStatus.SUBMITTED,
    submittedAt: submitted,
    partnerStatus: PartnerStatus.SUBMITTED,
    ...overrides,
  });

  it('allows a decision on a submitted application', () => {
    expect(partnerOnboardingReviewRefusal(subject())).toBeNull();
  });

  it.each(PARTNER_ONBOARDING_REVIEWABLE_STATUSES)(
    'allows a decision from %s',
    (status) => {
      expect(partnerOnboardingReviewRefusal(subject({ status }))).toBeNull();
    },
  );

  /* Consequence 1 — the approval that needed no compliance data. */
  it('refuses to review an application that was never submitted', () => {
    expect(
      partnerOnboardingReviewRefusal(
        subject({
          status: PartnerOnboardingStatus.INVITED,
          submittedAt: null,
          partnerStatus: PartnerStatus.ONBOARDING_INVITED,
        }),
      ),
    ).toMatch(/submitted for review first/i);
  });

  it('refuses even when the status looks reviewable but nothing was submitted', () => {
    /*
     * Guards rows written before the status check existed. Without this, a
     * legacy application sitting in SUBMITTED with a null submittedAt would
     * pass the from-set and still have no submission to review.
     */
    expect(
      partnerOnboardingReviewRefusal(subject({ submittedAt: null })),
    ).toMatch(/never been submitted/i);
  });

  /* Consequence 2 — the live partner knocked out by a mis-clicked review. */
  it.each(PARTNER_LIFECYCLE_CLOSED_TO_ONBOARDING_REVIEW)(
    'refuses any decision once the partner is %s',
    (partnerStatus) => {
      expect(
        partnerOnboardingReviewRefusal(subject({ partnerStatus })),
      ).toMatch(/lifecycle actions/i);
    },
  );

  it('refuses to re-decide an application that has already been decided', () => {
    for (const status of [
      PartnerOnboardingStatus.APPROVED,
      PartnerOnboardingStatus.REJECTED,
    ]) {
      expect(
        partnerOnboardingReviewRefusal(
          subject({ status, partnerStatus: PartnerStatus.INFORMATION_APPROVED }),
        ),
      ).not.toBeNull();
    }
  });

  it('names the partner lifecycle as the route for a live partner', () => {
    /*
     * The refusal has to point somewhere. `partnerTransition` already owns
     * suspend/deactivate/reactivate and already forbids `reject` from ACTIVE;
     * a message that just says "no" would send an operator looking for a
     * workaround.
     */
    const refusal = partnerOnboardingReviewRefusal(
      subject({ partnerStatus: PartnerStatus.ACTIVE }),
    );
    expect(refusal).toContain('suspend');
    expect(refusal).toContain('deactivate');
  });

  it('does not treat the pre-submission states as reviewable', () => {
    /*
     * Pinned by name so that adding one of them to the reviewable set later is
     * a deliberate, visible change rather than a quiet widening.
     */
    expect(PARTNER_ONBOARDING_REVIEWABLE_STATUSES).not.toContain(
      PartnerOnboardingStatus.INVITED,
    );
    expect(PARTNER_ONBOARDING_REVIEWABLE_STATUSES).not.toContain(
      PartnerOnboardingStatus.IN_PROGRESS,
    );
  });
});
