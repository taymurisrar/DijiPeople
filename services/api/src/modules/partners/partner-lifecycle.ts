import {
  PARTNER_LIFECYCLE_ACTIONS,
  PARTNER_STATUS_LABELS,
  isPartnerPostActivation,
  type PartnerLifecycleActionKey,
} from '@repo/config';
import { PartnerAccountStatus, PartnerStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';

/*
 * The API half of ADR-0026. Which statuses each lifecycle action may start
 * from lives in `@repo/config` (`partner-lifecycle.js`), because the admin
 * console decides which commands to offer from the same table — the two used
 * to disagree, and the console hid Activate in the one state where it works.
 */

export function partnerStatusLabel(status: string): string {
  return (PARTNER_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

/** A status sent as a field: refused, with the actions that do change it. */
export function partnerStatusRequiresAction(current: string): AppError {
  return new AppError('PARTNER_STATUS_ACTION_REQUIRED', {
    message: `Partner status is changed through lifecycle actions, not edited. The partner is ${partnerStatusLabel(current)}; use the action for the change you want — for example Start review, Activate partner, Suspend or Deactivate.`,
  });
}

/**
 * Refuse a step that would move a partner who has been live back into the
 * application or agreement funnel. `step` reads as the subject of a sentence:
 * "Approving the application", "Rejecting the application".
 */
export function assertPartnerNotLive(status: string, step: string): void {
  if (isPartnerPostActivation(status))
    throw new AppError('PARTNER_ALREADY_LIVE', {
      message: `${step} is not available: the partner is ${partnerStatusLabel(status)}. Use Suspend, Deactivate or Reactivate to change a live partner.`,
    });
}

/** The status `action` produces from `current`, or a refusal naming both. */
export function partnerTransition(
  current: PartnerStatus,
  action: PartnerLifecycleActionKey,
): PartnerStatus {
  const rule = PARTNER_LIFECYCLE_ACTIONS[action];
  if (!rule || !(rule.from as readonly string[]).includes(current))
    throw new AppError('PARTNER_ACTION_NOT_AVAILABLE', {
      message: `Action ${action} is not available while the partner is ${partnerStatusLabel(current)}.`,
    });
  return rule.to as PartnerStatus;
}

/**
 * Refuse an application-review action (`requiresInquiry` in the shared table)
 * for a partner with no partner inquiry — one an operator created in the
 * console, which starts at DRAFT and takes the agreement-first path. Checked
 * before the status rule so the operator is told why, not merely that the
 * action is unavailable.
 */
export function assertPartnerInquiryFor(
  action: PartnerLifecycleActionKey,
  hasInquiry: boolean,
): void {
  if (PARTNER_LIFECYCLE_ACTIONS[action]?.requiresInquiry && !hasInquiry)
    throw partnerInquiryRequired();
}

export function partnerInquiryRequired(): AppError {
  return new AppError('PARTNER_INQUIRY_REQUIRED', {
    message:
      'This partner was created by an operator and has no partner application to review. Create an agreement to continue.',
  });
}

/*
 * `accountStatus` is system-controlled (ADR-0026 D2) and follows the action:
 * suspend → SUSPENDED, deactivate → DISABLED, and reactivate → whatever access
 * the partner actually has. Reactivate used to set ACTIVE unconditionally,
 * which reported a portal account as live for a partner whose contact had never
 * accepted the invitation.
 */
export function accountStatusAfterAction(
  action: PartnerLifecycleActionKey,
  hasActivatedPortalUser: boolean,
): PartnerAccountStatus | undefined {
  if (action === 'suspend') return PartnerAccountStatus.SUSPENDED;
  if (action === 'deactivate') return PartnerAccountStatus.DISABLED;
  if (action === 'reactivate')
    return hasActivatedPortalUser
      ? PartnerAccountStatus.ACTIVE
      : PartnerAccountStatus.INVITED;
  return undefined;
}
