import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EmailProviderType } from '@prisma/client';
import { createTransport } from 'nodemailer';
import type {
  EmailConnectionTestResult,
  EmailProvider,
  EmailSendPayload,
  EmailSendResult,
} from '../interfaces/email-provider.interface';
import {
  maskSensitiveConfiguration,
  redactEmailError,
  SECRET_KEY_PATTERN,
} from './email-safety';

/**
 * Whether a provider type discards the message instead of delivering it.
 *
 * `CONSOLE` and `DEV` both resolve to `ConsoleEmailProvider`, which writes the
 * message to the log and returns success. Every layer above then reported
 * success too: a scheduled report ran, its delivery log said `SENT` with a
 * `console_…` message id, and the only trace that nobody received anything was
 * a `providerType` field nobody reads.
 *
 * The pair of comparisons already existed twice in `resolveProvider` and once
 * in `getProvider`. Naming it once means a new sink type is added in one place,
 * and "can this workspace actually send?" has a single answer.
 */
export function isSinkProvider(providerType: EmailProviderType): boolean {
  return (
    providerType === EmailProviderType.CONSOLE ||
    providerType === EmailProviderType.DEV
  );
}

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

  async testConnection(): Promise<EmailConnectionTestResult> {
    return {
      success: true,
      message: 'Console delivery is available in this server process.',
    };
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

    const transport = this.createTransport(config);

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
        attachments: payload.attachments,
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
      const message = redactEmailError(error);
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
    const port = Number(config.port);
    const hasPort = Number.isInteger(port) && port >= 1 && port <= 65535;
    const auth = config.auth;
    const hasAuthObject = Boolean(
      auth && typeof auth === 'object' && !Array.isArray(auth),
    );
    const authEnabled = config.authEnabled !== false;
    const hasUsername = Boolean(
      typeof config.username === 'string' && config.username.trim(),
    );
    const hasPassword = Boolean(
      typeof config.password === 'string' && config.password.trim(),
    );

    if (
      !hasHost ||
      !hasPort ||
      (authEnabled && !hasAuthObject && (!hasUsername || !hasPassword))
    ) {
      throw new BadRequestException(
        'SMTP requires a valid host and port. Username and password are required when authentication is enabled.',
      );
    }
  }

  async testConnection(config: Record<string, unknown>) {
    this.validateConfig(config);
    const transport = this.createTransport(config);
    try {
      await transport.verify();
      return { success: true, message: 'SMTP connection verified.' };
    } catch (error) {
      throw new BadRequestException(
        `SMTP connection failed: ${redactEmailError(error)}`,
      );
    } finally {
      transport.close();
    }
  }

  maskConfig(config: Record<string, unknown>) {
    return maskSensitiveConfiguration(config) as Record<string, unknown>;
  }

  private createTransport(config: Record<string, unknown>) {
    const auth =
      config.auth && typeof config.auth === 'object'
        ? (config.auth as { user?: string; pass?: string })
        : {
            user: configText(config.username),
            pass: configText(config.password),
          };
    const port = Number(config.port);
    const security = configText(config.security).toUpperCase();
    const authEnabled = config.authEnabled !== false;
    return createTransport({
      host: configText(config.host),
      port,
      secure: security === 'TLS' || config.secure === true || port === 465,
      requireTLS: security === 'STARTTLS',
      ignoreTLS: security === 'NONE',
      connectionTimeout: Number(config.connectionTimeoutMs ?? 10000),
      greetingTimeout: Number(config.connectionTimeoutMs ?? 10000),
      socketTimeout: Number(config.connectionTimeoutMs ?? 10000),
      ...(authEnabled
        ? { auth: { user: auth.user ?? '', pass: auth.pass ?? '' } }
        : {}),
    });
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

  async testConnection(): Promise<EmailConnectionTestResult> {
    throw new BadRequestException(
      'Connection testing is not implemented for this provider.',
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
