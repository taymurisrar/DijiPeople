import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { PrismaService } from '../../common/prisma/prisma.service';
import { redactEmailError } from '../notifications/email/email-safety';
import { PlatformEmailSettingsService } from './platform-email-settings.service';

export type PlatformEmailInput = {
  eventCode: string;
  recipient: string;
  subject: string;
  html: string;
  text?: string;
  entityType?: string;
  entityId?: string;
  requestedById?: string;
  metadata?: Record<string, unknown>;
  /** Stable operation identifier used to suppress duplicate deliveries. */
  idempotencyKey?: string;
};

@Injectable()
export class PlatformCommunicationsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PlatformCommunicationsService.name);
  private retryTimer: NodeJS.Timeout | null = null;
  private retryRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSettings: PlatformEmailSettingsService,
  ) {}

  onModuleInit() {
    this.retryTimer = setInterval(() => void this.runRetryCycle(), 5 * 60_000);
    this.retryTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  async sendEmail(input: PlatformEmailInput) {
    const recipient = input.recipient.trim().toLowerCase();
    const idempotencyKey =
      input.idempotencyKey ?? this.emailIdempotencyKey(input, recipient);
    const htmlBody = sanitizeHtml(input.html, {
      allowedTags: [
        'p',
        'br',
        'strong',
        'em',
        'h1',
        'h2',
        'h3',
        'ul',
        'ol',
        'li',
        'a',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
      ],
      allowedAttributes: { a: ['href', 'target', 'rel'] },
      allowedSchemes: ['https', 'http'],
    });
    const existing = await this.prisma.platformOutboundEmail.findUnique({
      where: { idempotencyKey },
    });
    if (existing?.status === 'SENT' || existing?.status === 'REJECTED')
      return existing;
    if (
      existing?.status === 'PENDING' &&
      existing.lastAttemptAt &&
      Date.now() - existing.lastAttemptAt.getTime() < 5 * 60_000
    )
      return existing;
    const attemptedAt = new Date();
    const delivery = existing
      ? await this.prisma.platformOutboundEmail.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING',
            errorMessage: null,
            attemptCount: { increment: 1 },
            lastAttemptAt: attemptedAt,
            nextRetryAt: null,
          },
        })
      : await this.prisma.platformOutboundEmail.create({
          data: {
            eventCode: input.eventCode,
            idempotencyKey,
            recipient,
            subject: input.subject.trim(),
            htmlBody,
            textBody: input.text,
            entityType: input.entityType,
            entityId: input.entityId,
            requestedById: input.requestedById,
            metadata: input.metadata as Prisma.InputJsonValue | undefined,
            attemptCount: 1,
            lastAttemptAt: attemptedAt,
          },
        });

    try {
      const resolved = await this.emailSettings.resolveProvider();
      if (!resolved)
        throw new Error('No platform email provider is configured.');
      const result = await resolved.provider.send({
        tenantId: 'platform',
        eventCode: input.eventCode,
        recipient,
        subject: input.subject.trim(),
        html: htmlBody,
        text: input.text,
        fromEmail: resolved.fromEmail,
        fromName: resolved.fromName,
        replyToEmail: resolved.replyToEmail,
        metadata: input.metadata,
        providerConfiguration: resolved.configuration,
      });
      return this.prisma.platformOutboundEmail.update({
        where: { id: delivery.id },
        data: {
          status: result.accepted ? 'SENT' : 'REJECTED',
          providerType: result.providerType,
          providerMessageId: result.providerMessageId,
          sentAt: result.accepted ? new Date() : null,
          nextRetryAt: null,
          metadata: {
            ...(input.metadata ?? {}),
            providerResponse: result.response ?? null,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      const message = redactEmailError(error);
      this.logger.error(
        `${input.eventCode} email to ${recipient} failed: ${message}`,
      );
      return this.prisma.platformOutboundEmail.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          errorMessage: message,
          nextRetryAt: new Date(
            Date.now() + Math.min(60, 2 ** delivery.attemptCount) * 60_000,
          ),
        },
      });
    }
  }

  async retryDueEmails(limit = 50) {
    const due = await this.prisma.platformOutboundEmail.findMany({
      where: {
        status: 'FAILED',
        nextRetryAt: { lte: new Date() },
        attemptCount: { lt: 6 },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return Promise.all(
      due.map((delivery) =>
        this.sendEmail({
          eventCode: delivery.eventCode,
          recipient: delivery.recipient,
          subject: delivery.subject,
          html: delivery.htmlBody,
          text: delivery.textBody ?? undefined,
          entityType: delivery.entityType ?? undefined,
          entityId: delivery.entityId ?? undefined,
          requestedById: delivery.requestedById ?? undefined,
          metadata: isRecord(delivery.metadata) ? delivery.metadata : undefined,
          idempotencyKey: delivery.idempotencyKey,
        }),
      ),
    );
  }

  private async runRetryCycle() {
    if (this.retryRunning) return;
    this.retryRunning = true;
    try {
      await this.retryDueEmails();
    } catch (error) {
      this.logger.error(
        `Platform email retry cycle failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.retryRunning = false;
    }
  }

  private emailIdempotencyKey(input: PlatformEmailInput, recipient: string) {
    const stableMetadata = Object.fromEntries(
      Object.entries(input.metadata ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
    return createHash('sha256')
      .update(
        JSON.stringify({
          eventCode: input.eventCode,
          recipient,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          metadata: stableMetadata,
        }),
      )
      .digest('hex');
  }
}

function isRecord(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function emailPage(
  title: string,
  body: string,
  action?: { label: string; url: string },
) {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replaceAll('\n', '<br>');
  const actionHtml = action
    ? `<p><a href="${escapeHtml(action.url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(action.label)}</strong></a></p>`
    : '';
  return `<h1>${safeTitle}</h1><p>${safeBody}</p>${actionHtml}<p>DijiPeople Platform</p>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
