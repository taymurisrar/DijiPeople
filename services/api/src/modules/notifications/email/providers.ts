import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EmailProviderType } from '@prisma/client';
import { createTransport } from 'nodemailer';
import type {
  EmailProvider,
  EmailSendPayload,
  EmailSendResult,
} from '../interfaces/email-provider.interface';
import { maskSensitiveConfiguration, SECRET_KEY_PATTERN } from './email-safety';

@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  readonly providerType = EmailProviderType.CONSOLE;
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async send(payload: EmailSendPayload): Promise<EmailSendResult> {
    // Console is a bootstrap/debug transport only. It is intentionally not a
    // compliance-grade delivery channel and must not be mistaken for real email.
    const bootstrapArtifacts = extractBootstrapArtifacts(payload);
    this.logger.log(
      JSON.stringify({
        marker: '[CONSOLE_EMAIL_PROVIDER]',
        eventCode: payload.eventCode,
        tenantId: payload.tenantId,
        recipient: payload.recipient,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        renderedTextBody: redactUnrelatedSecrets(payload.text ?? null),
        renderedHtmlBody: redactUnrelatedSecrets(payload.html),
        metadata: sanitizeMetadata(payload.metadata ?? null),
        correlationId:
          typeof payload.metadata?.correlationId === 'string'
            ? payload.metadata.correlationId
            : null,
        bootstrapArtifacts,
      }),
    );

    return {
      accepted: true,
      providerType: this.providerType,
      providerMessageId: `console_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`,
      response: {
        transport: 'console',
        message:
          'Rendered email was written to server logs by the console provider.',
      },
    };
  }

  validateConfig() {
    return;
  }

  maskConfig(config: Record<string, unknown>) {
    return maskSensitiveConfiguration(config) as Record<string, unknown>;
  }
}

function sanitizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeMetadata);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, unknown>
  >((sanitized, [key, entryValue]) => {
    const normalizedKey = key.toLowerCase();
    const isIntentionalBootstrapSecret = [
      'activationurl',
      'reseturl',
      'otp',
    ].includes(normalizedKey);

    sanitized[key] =
      SECRET_KEY_PATTERN.test(key) && !isIntentionalBootstrapSecret
        ? '********'
        : sanitizeMetadata(entryValue);
    return sanitized;
  }, {});
}

function redactUnrelatedSecrets(value: string | null) {
  if (!value) return value;

  return value.replace(
    /(password|secret|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret)=?[^,\s<]*/gi,
    '$1=[redacted]',
  );
}

function extractBootstrapArtifacts(payload: EmailSendPayload) {
  const metadata = sanitizeMetadata(payload.metadata ?? null) as Record<
    string,
    unknown
  > | null;
  const body = `${payload.text ?? ''}\n${payload.html}`;
  const urlMatches = Array.from(
    new Set(body.match(/https?:\/\/[^\s"'<>]+/gi) ?? []),
  );
  const otpFromMetadata =
    metadata && typeof metadata.otp === 'string' ? metadata.otp : null;
  const otpFromBody = body.match(/\b\d{4,10}\b/)?.[0] ?? null;

  return {
    activationUrl:
      metadata && typeof metadata.activationUrl === 'string'
        ? metadata.activationUrl
        : (urlMatches.find((url) => /activat/i.test(url)) ?? null),
    resetUrl:
      metadata && typeof metadata.resetUrl === 'string'
        ? metadata.resetUrl
        : (urlMatches.find((url) => /reset/i.test(url)) ?? null),
    otp: otpFromMetadata ?? otpFromBody,
    urls: urlMatches,
  };
}

/** Normalises the shared address list shape into what nodemailer expects. */
function toAddressList(value: unknown): string | string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const items = value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    );
    return items.length ? items : undefined;
  }
  return typeof value === 'string' && value ? value : undefined;
}

/*
 * Configuration arrives as unknown JSON. Anything that is not already a scalar
 * is treated as absent rather than stringified, since `String({})` would send
 * "[object Object]" as a host or a password and fail in a way that looks like a
 * credential problem.
 */
function configText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  readonly providerType = EmailProviderType.SMTP;

  private readonly logger = new Logger(SmtpEmailProvider.name);

  async send(payload: EmailSendPayload): Promise<EmailSendResult> {
    const config = payload.providerConfiguration ?? {};
    this.validateConfig(config);

    const auth =
      config.auth && typeof config.auth === 'object'
        ? (config.auth as { user?: string; pass?: string })
        : {
            user: configText(config.username),
            pass: configText(config.password),
          };

    const port = Number(config.port);
    const transport = createTransport({
      host: configText(config.host),
      port,
      // Implicit TLS is port 465; other ports negotiate STARTTLS when offered.
      secure: config.secure === true || port === 465,
      auth: { user: auth.user ?? '', pass: auth.pass ?? '' },
    });

    const from = payload.fromName
      ? `${payload.fromName} <${payload.fromEmail}>`
      : payload.fromEmail;

    try {
      const info = await transport.sendMail({
        from,
        to: payload.recipient,
        cc: toAddressList(payload.cc),
        bcc: toAddressList(payload.bcc),
        replyTo: payload.replyToEmail ?? undefined,
        subject: payload.subject,
        html: payload.html,
        text: payload.text ?? undefined,
      });

      return {
        accepted: (info.accepted?.length ?? 0) > 0,
        providerType: this.providerType,
        providerMessageId: info.messageId ?? null,
        response: {
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
        },
      };
    } catch (error) {
      // Surfaced to the delivery log rather than thrown, so one bad mailbox
      // does not abort the notification that triggered it.
      const message =
        error instanceof Error ? error.message : 'SMTP send failed.';
      this.logger.error(`SMTP send failed: ${message}`);

      return {
        accepted: false,
        providerType: this.providerType,
        providerMessageId: null,
        response: { error: message },
      };
    } finally {
      transport.close();
    }
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

    if (
      !hasHost ||
      !hasPort ||
      (!hasAuthObject && (!hasUsername || !hasPassword))
    ) {
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
