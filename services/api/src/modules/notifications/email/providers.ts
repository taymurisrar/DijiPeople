import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EmailProviderType } from '@prisma/client';
import type {
  EmailProvider,
  EmailSendPayload,
  EmailSendResult,
} from '../interfaces/email-provider.interface';
import {
  maskSensitiveConfiguration,
  SECRET_KEY_PATTERN,
} from './email-safety';

@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  readonly providerType = EmailProviderType.CONSOLE;
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async send(payload: EmailSendPayload): Promise<EmailSendResult> {
    this.logger.log(
      JSON.stringify({
        eventCode: payload.eventCode,
        tenantId: payload.tenantId,
        recipient: payload.recipient,
        cc: payload.cc,
        bcc: payload.bcc ? '[present]' : undefined,
        subject: payload.subject,
      }),
    );

    return {
      accepted: true,
      providerType: this.providerType,
      providerMessageId: `dev_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`,
    };
  }

  validateConfig() {
    return;
  }

  maskConfig(config: Record<string, unknown>) {
    return maskSensitiveConfiguration(config) as Record<string, unknown>;
  }
}

@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  readonly providerType = EmailProviderType.SMTP;

  async send(): Promise<EmailSendResult> {
    throw new BadRequestException(
      'SMTP provider adapter is prepared but nodemailer is not installed. Run: npm --workspace api install nodemailer && npm --workspace api install -D @types/nodemailer',
    );
  }

  validateConfig(config: Record<string, unknown>) {
    const hasHost = typeof config.host === 'string' && config.host.trim();
    const hasPort =
      typeof config.port === 'number' ||
      (typeof config.port === 'string' && config.port.trim());
    const auth = config.auth;
    const hasAuthObject = Boolean(
      auth && typeof auth === 'object' && !Array.isArray(auth),
    );
    const hasUsername = typeof config.username === 'string' && config.username;
    const hasPassword = typeof config.password === 'string' && config.password;

    if (!hasHost || !hasPort || (!hasAuthObject && (!hasUsername || !hasPassword))) {
      throw new BadRequestException(
        'SMTP providers require host, port, and either auth or username/password.',
      );
    }
  }

  maskConfig(config: Record<string, unknown>) {
    return maskSensitiveConfiguration(config) as Record<string, unknown>;
  }
}

@Injectable()
export class ApiPlaceholderEmailProvider implements EmailProvider {
  readonly providerType: EmailProviderType;

  constructor(providerType: EmailProviderType = EmailProviderType.CUSTOM) {
    this.providerType = providerType;
  }

  async send(): Promise<EmailSendResult> {
    throw new BadRequestException(
      'API email provider delivery is not implemented yet for this provider.',
    );
  }

  validateConfig(config: Record<string, unknown>) {
    const hasSecret = Object.entries(config).some(
      ([key, value]) =>
        SECRET_KEY_PATTERN.test(key) &&
        typeof value === 'string' &&
        value.trim().length > 0,
    );

    if (!hasSecret) {
      throw new BadRequestException(
        'API providers require an apiKey, token, secret, or equivalent credential.',
      );
    }
  }

  maskConfig(config: Record<string, unknown>) {
    return maskSensitiveConfiguration(config) as Record<string, unknown>;
  }
}
