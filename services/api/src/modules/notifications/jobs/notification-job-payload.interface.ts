import type { SendTemplateEmailInput } from '../email/email.service';

export const NOTIFICATION_EMAIL_JOB_NAME = 'notification.email.send';

export type NotificationJobChannel = 'EMAIL' | 'IN_APP';

export type NotificationJobPayload = {
  jobId: string;
  tenantId: string;
  eventCode: string;
  channel: NotificationJobChannel;
  sourceModule?: string | null;
  correlationId?: string | null;
  requestedByUserId?: string | null;
  requestedAt: string;
};

export type EmailNotificationJobPayload = NotificationJobPayload & {
  channel: 'EMAIL';
  email: SendTemplateEmailInput;
};
