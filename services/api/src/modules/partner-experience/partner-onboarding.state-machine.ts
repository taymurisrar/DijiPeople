import { PartnerOnboardingStatus, PartnerStatus } from '@prisma/client';

/**
 * The partner onboarding review, expressed as transitions instead of as a
 * setter.
 *
 * `reviewOnboarding` used to derive the new status purely from the `decision`
 * argument and write it with no check on the current one, so every decision was
 * legal from every state in either direction (BUG-0016). Two things followed:
 * an application still in `INVITED`, with nothing submitted and no compliance
 * data, could be approved and the partner activated; and an already-`APPROVED`
 * application could be flipped to `REJECTED` after activation, knocking a live
 * partner — signed agreement, working referral link — out of service.
 *
 * What is declared here is deliberately only the part the repository had
 * already decided somewhere else and then contradicted here. It invents no
 * policy:
 *
 *   - **A decision requires a submission.** `submitOnboarding` is the only
 *     writer of `SUBMITTED`/`submittedAt`, and it already runs
 *     `validatePartnerOnboardingData` against the required-field list in
 *     `partner-settings`. Requiring a submission before a review therefore
 *     inherits the completeness rule that already exists rather than adding
 *     one — which is why no field-level KYC check appears below.
 *
 *   - **A live partner is not demoted through this endpoint.**
 *     `partnerTransition` in `partners.service.ts` already declares that
 *     `reject` is illegal from `ACTIVE`, and already owns `suspend`,
 *     `deactivate` and `reactivate`. Letting a compliance review reach an
 *     `ACTIVE` partner was the two files disagreeing, not a second policy.
 *
 * What is NOT decided here, and is deliberately left alone: whether an
 * `APPROVED` application may be re-opened for a fresh decision, and what should
 * happen to a live referral link and its in-flight attributed leads if a
 * partner is demoted after activation. Both are product questions; both are
 * recorded on BUG-0016.
 */

/**
 * Application states a review decision may be taken from.
 *
 * `CHANGES_REQUESTED` is reachable only *through* a review, and a review now
 * requires a submission, so it cannot smuggle an unsubmitted application in.
 * `APPROVED` and `REJECTED` are absent because they are decisions already
 * taken — re-deciding them is the product question this table declines to
 * answer.
 */
export const PARTNER_ONBOARDING_REVIEWABLE_STATUSES: PartnerOnboardingStatus[] =
  [
    PartnerOnboardingStatus.SUBMITTED,
    PartnerOnboardingStatus.UNDER_REVIEW,
    PartnerOnboardingStatus.CHANGES_REQUESTED,
  ];

/**
 * Partner states past the point where onboarding review governs the partner.
 *
 * Once a partner is live — or has been suspended, deactivated or terminated
 * from live — its status is owned by `partnerTransition`, which has its own
 * from-sets and writes a `PartnerTimeline` entry for every move. A review
 * decision reaching one of these states would change a partner's standing
 * without passing that governance.
 */
export const PARTNER_LIFECYCLE_CLOSED_TO_ONBOARDING_REVIEW: PartnerStatus[] = [
  PartnerStatus.ACTIVE,
  PartnerStatus.SUSPENDED,
  PartnerStatus.INACTIVE,
  PartnerStatus.TERMINATED,
];

export type PartnerOnboardingDecision = 'approve' | 'changes' | 'reject';

export type PartnerOnboardingReviewSubject = {
  status: PartnerOnboardingStatus;
  submittedAt: Date | null;
  partnerStatus: PartnerStatus;
};

/**
 * Why this review decision is refused, or `null` when it is legal.
 *
 * Returns a reason rather than throwing so the same rule can be asserted in a
 * unit test without constructing an HTTP exception, and so the caller decides
 * the status code.
 */
export function partnerOnboardingReviewRefusal(
  subject: PartnerOnboardingReviewSubject,
): string | null {
  if (
    PARTNER_LIFECYCLE_CLOSED_TO_ONBOARDING_REVIEW.includes(
      subject.partnerStatus,
    )
  ) {
    return `This partner is ${subject.partnerStatus} and is no longer governed by onboarding review. Use the partner lifecycle actions to suspend, deactivate or reactivate it.`;
  }

  if (!PARTNER_ONBOARDING_REVIEWABLE_STATUSES.includes(subject.status)) {
    return `A partner onboarding application cannot be reviewed while it is ${subject.status}. It must be submitted for review first.`;
  }

  /*
   * Belt and braces for rows that predate the status guard, and the assertion
   * that actually carries the compliance meaning: a review is a review *of*
   * something. An application with no submittedAt has no submission, and
   * therefore no validated legal or bank details to approve.
   */
  if (!subject.submittedAt) {
    return 'This application has never been submitted, so there is nothing to review.';
  }

  return null;
}
