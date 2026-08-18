import { DomainEventType } from '@prisma/client';

/**
 * Who a lifecycle notification is for.
 *
 * The distinction matters because the two audiences need opposite defaults. A
 * platform operator wants to hear about a failed provisioning immediately; the
 * tenant wants to hear that their workspace is ready and emphatically does not
 * want a message every time DijiPeople's reconciliation job finds a warning.
 */
export type LifecycleAudience = 'PLATFORM_OPS' | 'TENANT_OWNER' | 'CUSTOMER';

export type LifecycleSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type LifecycleNotificationDefinition = {
  eventType: DomainEventType;
  /** Stable notification code, distinct from the event that triggers it. */
  code: string;
  audience: LifecycleAudience;
  severity: LifecycleSeverity;
  subject: string;
  /** One line explaining why this notification exists at all. */
  rationale: string;
};

/**
 * Notifications for the commercial lifecycle.
 *
 * The existing `NOTIFICATION_EVENT_CATALOG` covers tenant HR events — payslips,
 * leave, claims. It has nothing for the commercial lifecycle, so until now a
 * payment could fail, a provisioning run could break and a tenant could sit
 * un-provisioned with nobody told.
 *
 * WHAT IS DELIBERATELY NOT HERE. Only transitions somebody would act on. The
 * outbox emits 24 event types and most of them are bookkeeping — a
 * `SEAT_CHANGE_APPLIED` that went exactly as scheduled is not news. Notifying on
 * every event trains people to ignore the channel, which costs more than the
 * missing messages it was meant to prevent.
 */
export const PLATFORM_LIFECYCLE_NOTIFICATIONS: LifecycleNotificationDefinition[] =
  [
    {
      eventType: DomainEventType.LEAD_SUBMITTED,
      code: 'OPS_LEAD_SUBMITTED',
      audience: 'PLATFORM_OPS',
      severity: 'INFO',
      subject: 'New website enquiry',
      rationale:
        'Sales response time is the whole value of a lead; an unnoticed one is a lost one.',
    },
    {
      eventType: DomainEventType.PARTNER_INQUIRY_SUBMITTED,
      code: 'OPS_PARTNER_INQUIRY_SUBMITTED',
      audience: 'PLATFORM_OPS',
      severity: 'INFO',
      subject: 'New partner enquiry',
      rationale: 'Same reasoning as a lead, different pipeline and owner.',
    },
    {
      eventType: DomainEventType.PAYMENT_FAILED,
      code: 'OPS_PAYMENT_FAILED',
      audience: 'PLATFORM_OPS',
      severity: 'WARNING',
      subject: 'A payment failed',
      rationale:
        'A failed payment is recoverable for a few days and then is not. Nobody discovers it by reading the database.',
    },
    {
      eventType: DomainEventType.SUBSCRIPTION_ACTIVATED,
      code: 'OPS_SUBSCRIPTION_ACTIVATED',
      audience: 'PLATFORM_OPS',
      severity: 'INFO',
      subject: 'A subscription activated',
      rationale:
        'The one event that means revenue started. Also the trigger operators use to watch provisioning.',
    },
    {
      eventType: DomainEventType.TENANT_PROVISIONING_FAILED,
      code: 'OPS_PROVISIONING_FAILED',
      audience: 'PLATFORM_OPS',
      severity: 'CRITICAL',
      subject: 'Provisioning failed for a paying customer',
      rationale:
        'Somebody has paid and cannot use the product. This is the highest-severity operational state the platform has.',
    },
    {
      eventType: DomainEventType.TENANT_READY,
      code: 'TENANT_WORKSPACE_READY',
      audience: 'TENANT_OWNER',
      severity: 'INFO',
      subject: 'Your workspace is ready',
      rationale:
        'The customer is waiting for exactly this. It is the only tenant-facing message in the provisioning chain.',
    },
    {
      eventType: DomainEventType.SEAT_OVERAGE_DETECTED,
      code: 'CUSTOMER_SEAT_OVERAGE',
      audience: 'CUSTOMER',
      severity: 'WARNING',
      subject: 'You are over your purchased capacity',
      rationale:
        'A surprise on an invoice is worse than a warning before it. Sent on the episode, not per day — see SeatOverageEvent.',
    },
    {
      eventType: DomainEventType.PLAN_CHANGE_APPLIED,
      code: 'CUSTOMER_PLAN_CHANGED',
      audience: 'CUSTOMER',
      severity: 'INFO',
      subject: 'Your plan has changed',
      rationale:
        'A downgrade reduces what is reachable. The customer agreed to it, and should still be told when it took effect.',
    },
    {
      eventType: DomainEventType.CANCELLATION_REQUESTED,
      code: 'OPS_CANCELLATION_REQUESTED',
      audience: 'PLATFORM_OPS',
      severity: 'WARNING',
      subject: 'A customer cancelled',
      rationale:
        'The only window in which retention is possible is before the paid-through date.',
    },
    {
      eventType: DomainEventType.TENANT_DELETION_REQUESTED,
      code: 'OPS_TENANT_DELETION_REQUESTED',
      audience: 'PLATFORM_OPS',
      severity: 'CRITICAL',
      subject: 'A workspace deletion was requested',
      rationale:
        'Irreversible, and requires a platform operator to approve. It must not wait to be noticed.',
    },
    {
      eventType: DomainEventType.RETENTION_STARTED,
      code: 'CUSTOMER_RETENTION_STARTED',
      audience: 'CUSTOMER',
      severity: 'WARNING',
      subject: 'Your data is scheduled for deletion',
      rationale:
        'The customer is told the exact date while they can still act on it. Sending nothing here is how data loss becomes a surprise.',
    },
    {
      eventType: DomainEventType.TENANT_ERASED,
      code: 'OPS_TENANT_ERASED',
      audience: 'PLATFORM_OPS',
      severity: 'INFO',
      subject: 'A workspace was erased',
      rationale:
        'Closes the loop on an irreversible action. The durable record is TenantErasureReceipt; this is the notification of it.',
    },
  ];

const BY_EVENT_TYPE = new Map(
  PLATFORM_LIFECYCLE_NOTIFICATIONS.map((definition) => [
    definition.eventType,
    definition,
  ]),
);

export function lifecycleNotificationFor(
  eventType: DomainEventType,
): LifecycleNotificationDefinition | undefined {
  return BY_EVENT_TYPE.get(eventType);
}

/** Event types this catalog deliberately does not notify on. */
export function isNotifiableLifecycleEvent(
  eventType: DomainEventType,
): boolean {
  return BY_EVENT_TYPE.has(eventType);
}
