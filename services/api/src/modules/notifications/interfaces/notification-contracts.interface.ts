import {
  EmailDeliveryStatus,
  EmailProviderType,
  NotificationChannel,
  NotificationEventCategory,
  NotificationType,
} from '@prisma/client';

export type EmailTemplateLookupInput = {
  tenantId: string;
  eventCode: string;
  templateKey?: string;
  /*
   * Optional placement of the record this email is about. Supplying it lets a
   * team, department, business unit or organization template win over the
   * tenant default.
   */
  organizationId?: string | null;
  businessUnitId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
};

export type EmailProviderLookupInput = {
  tenantId: string;
  providerName?: string;
};

export type NotificationPreferenceLookupInput = {
  tenantId: string;
  userId?: string | null;
  eventCode: string;
  channel: NotificationChannel;
};

export type EmailDeliveryLogCreateInput = {
  tenantId: string;
  eventCode: string;
  templateId?: string | null;
  providerType?: EmailProviderType | null;
  recipient: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  channel?: NotificationChannel;
  status?: EmailDeliveryStatus;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  retryCount?: number;
  maxRetryCount?: number;
  nextRetryAt?: Date | null;
  lastRetryAt?: Date | null;
  retryable?: boolean;
  requestedAt?: Date;
};

export type InAppNotificationCreateInput = {
  tenantId: string;
  eventCode: string;
  type?: NotificationType;
  category: NotificationEventCategory;
  title: string;
  body?: string | null;
  targetUrl?: string | null;
  payload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  recipientUserIds: string[];
  createdById?: string | null;
};
