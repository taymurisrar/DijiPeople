import { EmailProviderType } from '@prisma/client';

export type EmailAddressList = string | string[] | null | undefined;

export type EmailSendPayload = {
  tenantId: string;
  eventCode: string;
  recipient: string;
  cc?: EmailAddressList;
  bcc?: EmailAddressList;
  subject: string;
  html: string;
  text?: string | null;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type EmailSendResult = {
  accepted: boolean;
  providerType: EmailProviderType;
  providerMessageId?: string | null;
  response?: Record<string, unknown> | null;
};

export interface EmailProvider {
  readonly providerType: EmailProviderType;
  send(payload: EmailSendPayload): Promise<EmailSendResult>;
  validateConfig(config: Record<string, unknown>): void;
  maskConfig(config: Record<string, unknown>): Record<string, unknown>;
}
