import {
  EmailDeliveryStatus,
  EmailProviderType,
  NotificationChannel,
} from '@prisma/client';

export type EmailTemplateLookupInput = {
  tenantId: string;
  eventCode: string;
  templateKey?: string;
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
  requestedAt?: Date;
};
