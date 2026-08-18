import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainEventType } from '@prisma/client';
import type { OutboxEvent, Prisma } from '@prisma/client';
import type {
  OutboxHandler,
  OutboxHandlerOutcome,
} from '../outbox/outbox.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import {
  lifecycleNotificationFor,
  PLATFORM_LIFECYCLE_NOTIFICATIONS,
  type LifecycleNotificationDefinition,
} from './platform-lifecycle-notifications.catalog';

/**
 * Turns commercial lifecycle events into notifications.
 *
 * WHY THERE IS NO FALLBACK ADDRESS. A hardcoded operator e-mail is the failure
 * this is written to avoid: it works until the person leaves, and then failed
 * payments and broken provisioning go to a mailbox nobody reads, with nothing
 * anywhere reporting that they do. So when no recipient is configured this
 * handler returns `MANUAL_ACTION_REQUIRED` — the event stays visible in the
 * outbox as needing attention rather than being quietly marked delivered.
 *
 * That is deliberately louder than dropping it and deliberately quieter than
 * retrying forever: no amount of retrying will invent a recipient.
 */
@Injectable()
export class LifecycleNotificationHandler
  implements OutboxHandler, OnModuleInit
{
  readonly consumerKey = 'notifications.lifecycle';

  /** Only the event types the catalogue actually notifies on. */
  readonly handles = PLATFORM_LIFECYCLE_NOTIFICATIONS.map(
    (definition) => definition.eventType,
  );

  private readonly logger = new Logger(LifecycleNotificationHandler.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly dispatcher: OutboxDispatcherService,
  ) {}

  onModuleInit(): void {
    this.dispatcher.register(this);
  }

  async handle(
    event: OutboxEvent,
    payload: Prisma.JsonValue,
  ): Promise<OutboxHandlerOutcome> {
    const definition = lifecycleNotificationFor(event.eventType);

    if (!definition) {
      // Registered for an event the catalogue no longer covers. Not a failure —
      // the catalogue is the authority on what is worth notifying about.
      return {
        status: 'SKIPPED',
        detail: `No lifecycle notification defined for ${event.eventType}.`,
      };
    }

    const recipients = await this.resolveRecipients(definition, event);

    if (recipients.length === 0) {
      return {
        status: 'MANUAL_ACTION_REQUIRED',
        detail: `No recipient configured for ${definition.code} (${definition.audience}). Set PLATFORM_OPS_NOTIFICATION_EMAILS, or give the tenant an owner. Nothing was sent.`,
      };
    }

    // Recorded rather than sent. Wiring this into the notification orchestrator
    // is a separate step with its own template and delivery concerns; what
    // matters first is that the decision — who should hear about this, and why —
    // is made in one place and is inspectable.
    this.logger.log(
      JSON.stringify({
        event: 'lifecycle.notification.resolved',
        code: definition.code,
        eventType: event.eventType,
        audience: definition.audience,
        severity: definition.severity,
        recipientCount: recipients.length,
        tenantId: event.tenantId,
        correlationId: event.correlationId,
      }),
    );

    return {
      status: 'PROCESSED',
      detail: `${definition.code} resolved to ${recipients.length} recipient(s).`,
    };
  }

  /**
   * Who hears about this.
   *
   * Platform operators come from configuration. Tenant and customer audiences
   * are resolved from the record itself, so a notification about a workspace
   * always goes to that workspace's people and never to a list.
   */
  private async resolveRecipients(
    definition: LifecycleNotificationDefinition,
    event: OutboxEvent,
  ): Promise<string[]> {
    if (definition.audience === 'PLATFORM_OPS') {
      return this.platformOpsRecipients();
    }

    if (definition.audience === 'TENANT_OWNER' && event.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: event.tenantId },
        select: { ownerUser: { select: { email: true } } },
      });
      return tenant?.ownerUser?.email ? [tenant.ownerUser.email] : [];
    }

    if (definition.audience === 'CUSTOMER') {
      const customerId =
        event.customerAccountId ??
        (event.tenantId
          ? (
              await this.prisma.tenant.findUnique({
                where: { id: event.tenantId },
                select: { customerAccountId: true },
              })
            )?.customerAccountId
          : null);

      if (!customerId) {
        return [];
      }

      const customer = await this.prisma.customerAccount.findUnique({
        where: { id: customerId },
        select: { billingContactEmail: true, contactEmail: true },
      });

      // Billing contact first: every CUSTOMER-audience notification here is
      // about money or data retention, which is the billing contact's business
      // rather than whoever happened to fill in the form.
      const address =
        customer?.billingContactEmail ?? customer?.contactEmail ?? null;
      return address ? [address] : [];
    }

    return [];
  }

  /**
   * Operator recipients, from configuration only.
   *
   * Returns an empty list when unconfigured, which the caller turns into
   * `MANUAL_ACTION_REQUIRED`. Substituting a default here would be the exact
   * hardcoded-address problem this class exists to prevent.
   */
  private platformOpsRecipients(): string[] {
    const raw = this.configService.get<string>(
      'PLATFORM_OPS_NOTIFICATION_EMAILS',
    );

    if (!raw?.trim()) {
      return [];
    }

    return raw
      .split(',')
      .map((address) => address.trim().toLowerCase())
      .filter((address) => address.includes('@'));
  }
}
