import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SecretEncryptionService } from '../../../common/security/secret-encryption.service';
import { StorageService } from '../../../common/storage/storage.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import {
  ClipboardCaptureBatchDto,
  DlpAlertQueryDto,
  ScreenCaptureBatchDto,
  UpsertDlpRuleDto,
} from '../dto/dlp-capture.dto';

/**
 * The legal-document slug an employee must have acknowledged before capture is
 * accepted, when a tenant turns `dlpConsentRequired` on. The tenant authors that
 * document through the legal module; until it exists and is acknowledged, a
 * consent-required tenant captures nothing — the gate fails closed rather than
 * collecting without a record of consent.
 */
const DLP_MONITORING_POLICY_SLUG = 'dlp-monitoring-policy';

/** Where encrypted screenshot bytes live under the storage root. */
const DLP_SCREENSHOT_PREFIX = 'dlp-screenshots';

const DEFAULT_ALERT_LIMIT = 100;
const MAX_ALERT_LIMIT = 500;

type SettingsGate = {
  allowClipboardCapture: boolean;
  allowScreenshotCapture: boolean;
  clipboardFullContent: boolean;
  dlpConsentRequired: boolean;
  screenshotRetentionDays: number;
  historyRetentionDays: number;
};

/**
 * Ingest, storage, retention and review of desktop-agent DLP capture
 * (TASK-0020). Every capture decision is made here on the server — the client's
 * flags are advisory — so a stale or tampered agent cannot collect for a tenant
 * that has the capability switched off, and never collects content a tenant
 * asked to keep as metadata only.
 *
 * Nothing in this service logs captured content: clipboard text, screenshot
 * bytes and storage keys never reach the logger (agent AGENTS.md rule 2, at
 * maximum stakes). Reading captured content is a separate, audited action gated
 * by `dlp.review`.
 */
const RETENTION_THROTTLE_MS = 60 * 60 * 1000;

@Injectable()
export class DlpService {
  private readonly logger = new Logger(DlpService.name);
  private readonly retentionRunByTenant = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: SecretEncryptionService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  // --------------------------------------------------------------- ingest

  async ingestClipboardEvents(
    user: AuthenticatedUser,
    dto: ClipboardCaptureBatchDto,
  ) {
    const employee = await this.getLinkedEmployee(user);
    const settings = await this.getSettings(user.tenantId);

    if (!settings.allowClipboardCapture) {
      return { accepted: 0, captureEnabled: false };
    }
    if (
      settings.dlpConsentRequired &&
      !(await this.hasMonitoringConsent(user.tenantId, user.userId))
    ) {
      this.logger.warn(
        `dlp.clipboard.skipped_no_consent tenant=${user.tenantId} user=${user.userId}`,
      );
      return { accepted: 0, captureEnabled: true, consentMissing: true };
    }

    let accepted = 0;
    for (const event of dto.events) {
      const session = await this.resolveActiveSession(
        user,
        employee.id,
        event.sessionId,
        event.deviceId,
      );

      const occurredAt = new Date(event.occurredAt);
      const dedupeKey = `${user.tenantId}:${session.id}:clip:${occurredAt.toISOString()}:${event.contentSha256}`;

      // Full content is kept only when the tenant asked for it AND the agent did
      // not flag the sample as over the byte cap. Otherwise the row is metadata
      // only — the content never leaves the machine.
      const keepText =
        settings.clipboardFullContent &&
        !event.overCap &&
        typeof event.text === 'string' &&
        event.text.length > 0;

      const created = await this.createIdempotently(() =>
        this.prisma.clipboardCaptureEvent.create({
          data: {
            dedupeKey,
            tenantId: user.tenantId,
            employeeId: employee.id,
            userId: user.userId,
            sessionId: session.id,
            deviceId: event.deviceId,
            occurredAt,
            sourceApp: event.sourceApp ?? null,
            sourceAppPath: event.sourceAppPath ?? null,
            destinationApp: event.destinationApp ?? null,
            contentBytes: event.contentBytes,
            contentSha256: event.contentSha256,
            encryptedContent: keepText
              ? this.encryption.encrypt(event.text as string)
              : null,
            overCap: event.overCap ?? false,
            firedRuleId: event.firedRuleId ?? null,
            agentVersion: event.agentVersion ?? 'unknown',
          },
        }),
      );

      if (created) accepted += 1;
    }

    this.logger.log(
      `dlp.clipboard.ingested tenant=${user.tenantId} accepted=${accepted}/${dto.events.length}`,
    );
    await this.maybeRunRetention(user.tenantId, settings);
    return { accepted, captureEnabled: true };
  }

  async ingestScreenshotEvents(
    user: AuthenticatedUser,
    dto: ScreenCaptureBatchDto,
  ) {
    const employee = await this.getLinkedEmployee(user);
    const settings = await this.getSettings(user.tenantId);

    if (!settings.allowScreenshotCapture) {
      return { accepted: 0, captureEnabled: false };
    }
    if (
      settings.dlpConsentRequired &&
      !(await this.hasMonitoringConsent(user.tenantId, user.userId))
    ) {
      this.logger.warn(
        `dlp.screenshot.skipped_no_consent tenant=${user.tenantId} user=${user.userId}`,
      );
      return { accepted: 0, captureEnabled: true, consentMissing: true };
    }

    let accepted = 0;
    for (const event of dto.events) {
      const session = await this.resolveActiveSession(
        user,
        employee.id,
        event.sessionId,
        event.deviceId,
      );

      const occurredAt = new Date(event.occurredAt);
      const dedupeKey = `${user.tenantId}:${session.id}:shot:${occurredAt.toISOString()}:${event.contentSha256}`;

      // Store the encrypted bytes first; only then record the row that points at
      // them. A failed store must not leave a row referencing bytes that are not
      // there.
      const encrypted = this.encryption.encrypt(event.imageBase64);
      const stored = await this.storage.saveFile({
        buffer: Buffer.from(encrypted, 'utf8'),
        originalFileName: `${dedupeKey.replace(/[^a-zA-Z0-9]/g, '_')}.enc`,
        subdirectory: `${DLP_SCREENSHOT_PREFIX}/${user.tenantId}`,
      });

      const created = await this.createIdempotently(() =>
        this.prisma.screenCaptureEvent.create({
          data: {
            dedupeKey,
            tenantId: user.tenantId,
            employeeId: employee.id,
            userId: user.userId,
            sessionId: session.id,
            deviceId: event.deviceId,
            occurredAt,
            firedRuleId: event.firedRuleId,
            capturedReason: event.capturedReason ?? null,
            storageKey: stored.storageKey,
            contentBytes: event.contentBytes,
            contentSha256: event.contentSha256,
            agentVersion: event.agentVersion ?? 'unknown',
          },
        }),
      );

      if (created) {
        accepted += 1;
        // A triggered screenshot is an incident an investigator should see.
        await this.prisma.dlpAlert.create({
          data: {
            tenantId: user.tenantId,
            employeeId: employee.id,
            ruleId: event.firedRuleId,
            occurredAt,
            screenshotEventId: created.id,
          },
        });
      }
    }

    this.logger.log(
      `dlp.screenshot.ingested tenant=${user.tenantId} accepted=${accepted}/${dto.events.length}`,
    );
    await this.maybeRunRetention(user.tenantId, settings);
    return { accepted, captureEnabled: true };
  }

  /**
   * Runs the DLP retention purge at most once an hour per tenant, opportunistically
   * on the ingest path — the same throttled pattern the telemetry retention uses,
   * since this deployment has no scheduler wired.
   */
  private async maybeRunRetention(tenantId: string, settings: SettingsGate) {
    const now = Date.now();
    const last = this.retentionRunByTenant.get(tenantId) ?? 0;
    if (now - last < RETENTION_THROTTLE_MS) return;
    this.retentionRunByTenant.set(tenantId, now);
    try {
      await this.enforceDlpRetention(tenantId, settings);
    } catch (error) {
      this.logger.warn(
        `dlp.retention.failed tenant=${tenantId} reason=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  // ----------------------------------------------------------- rule config

  listRules(user: AuthenticatedUser) {
    return this.prisma.dlpRule.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async upsertRule(user: AuthenticatedUser, dto: UpsertDlpRuleDto) {
    const data = {
      name: dto.name,
      enabled: dto.enabled ?? true,
      sourceAppPatterns: dto.sourceAppPatterns,
      channelAppPatterns: dto.channelAppPatterns,
      action: dto.action ?? 'OBSERVE',
    };

    if (dto.id) {
      // Scope the update to the tenant so an id from another tenant cannot be
      // edited: updateMany with the tenant guard, then read back.
      const result = await this.prisma.dlpRule.updateMany({
        where: { id: dto.id, tenantId: user.tenantId },
        data: { ...data, updatedById: user.userId },
      });
      if (result.count === 0) {
        throw new NotFoundException('DLP rule was not found.');
      }
      const updated = await this.prisma.dlpRule.findFirstOrThrow({
        where: { id: dto.id, tenantId: user.tenantId },
      });
      await this.auditRuleChange(user, updated.id, 'DLP_RULE_UPDATED');
      return updated;
    }

    const created = await this.prisma.dlpRule.create({
      data: {
        ...data,
        tenantId: user.tenantId,
        createdById: user.userId,
        updatedById: user.userId,
      },
    });
    await this.auditRuleChange(user, created.id, 'DLP_RULE_CREATED');
    return created;
  }

  async deleteRule(user: AuthenticatedUser, id: string) {
    const result = await this.prisma.dlpRule.deleteMany({
      where: { id, tenantId: user.tenantId },
    });
    if (result.count === 0) {
      throw new NotFoundException('DLP rule was not found.');
    }
    await this.auditRuleChange(user, id, 'DLP_RULE_DELETED');
    return { deleted: true };
  }

  // --------------------------------------------------------------- review

  async listAlerts(user: AuthenticatedUser, query: DlpAlertQueryDto) {
    const limit = Math.min(query.limit ?? DEFAULT_ALERT_LIMIT, MAX_ALERT_LIMIT);
    return this.prisma.dlpAlert.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Returns the decrypted clipboard text for one event. This is the sensitive
   * read the whole permission model exists to gate, so it is audited every time
   * — actor, target employee and event id, never the content — before the
   * content is returned.
   */
  async readClipboardContent(user: AuthenticatedUser, id: string) {
    const event = await this.prisma.clipboardCaptureEvent.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!event) {
      throw new NotFoundException('Clipboard capture event was not found.');
    }

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'DLP_CLIPBOARD_CONTENT_VIEWED',
      entityType: 'ClipboardCaptureEvent',
      entityId: event.id,
      sourceModule: 'agent-dlp',
      afterSnapshot: {
        employeeId: event.employeeId,
        occurredAt: event.occurredAt,
      },
    });

    return {
      id: event.id,
      employeeId: event.employeeId,
      occurredAt: event.occurredAt,
      sourceApp: event.sourceApp,
      destinationApp: event.destinationApp,
      contentBytes: event.contentBytes,
      contentSha256: event.contentSha256,
      overCap: event.overCap,
      content: event.encryptedContent
        ? this.encryption.decrypt(event.encryptedContent)
        : null,
    };
  }

  /**
   * Returns the decrypted screenshot bytes for one event, audited. The caller
   * (controller) streams them; the storage key never reaches the client.
   */
  async readScreenshot(user: AuthenticatedUser, id: string) {
    const event = await this.prisma.screenCaptureEvent.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!event || !event.storageKey) {
      throw new NotFoundException('Screenshot was not found.');
    }

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'DLP_SCREENSHOT_VIEWED',
      entityType: 'ScreenCaptureEvent',
      entityId: event.id,
      sourceModule: 'agent-dlp',
      afterSnapshot: {
        employeeId: event.employeeId,
        occurredAt: event.occurredAt,
      },
    });

    const file = await this.storage.openFile(event.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of file.stream) {
      chunks.push(chunk as Buffer);
    }
    const decrypted = this.encryption.decrypt(
      Buffer.concat(chunks).toString('utf8'),
    );
    return {
      buffer: Buffer.from(decrypted, 'base64'),
      contentSha256: event.contentSha256,
    };
  }

  // ------------------------------------------------------------ retention

  /**
   * Deletes captured data past its retention window: clipboard events and alerts
   * on the general telemetry window, screenshots on their own (shorter) window,
   * and the stored screenshot bytes with the rows that reference them. Called
   * from the agent's retention pass so DLP data does not outlive the telemetry
   * it sits beside.
   */
  async enforceDlpRetention(tenantId: string, settings: SettingsGate) {
    const now = Date.now();
    const clipboardCutoff = new Date(
      now - Math.max(1, settings.historyRetentionDays) * 24 * 60 * 60 * 1000,
    );
    const screenshotCutoff = new Date(
      now - Math.max(1, settings.screenshotRetentionDays) * 24 * 60 * 60 * 1000,
    );

    // Remove the stored screenshot bytes before their rows, so a deleted row
    // never leaves an orphaned encrypted file behind.
    const expiredShots = await this.prisma.screenCaptureEvent.findMany({
      where: { tenantId, occurredAt: { lt: screenshotCutoff } },
      select: { storageKey: true },
    });
    for (const shot of expiredShots) {
      if (shot.storageKey) {
        await this.storage.deleteFile(shot.storageKey).catch((error) => {
          this.logger.warn(
            `dlp.retention.screenshot_delete_failed key=${shot.storageKey} reason=${
              error instanceof Error ? error.message : 'unknown'
            }`,
          );
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.clipboardCaptureEvent.deleteMany({
        where: { tenantId, occurredAt: { lt: clipboardCutoff } },
      }),
      this.prisma.screenCaptureEvent.deleteMany({
        where: { tenantId, occurredAt: { lt: screenshotCutoff } },
      }),
      this.prisma.dlpAlert.deleteMany({
        where: { tenantId, occurredAt: { lt: clipboardCutoff } },
      }),
    ]);
  }

  // --------------------------------------------------------------- helpers

  private async createIdempotently<T>(
    create: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await create();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  private async getLinkedEmployee(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    if (!employee) {
      throw new ForbiddenException(
        'Desktop agent access requires a linked employee profile.',
      );
    }
    return employee;
  }

  private async resolveActiveSession(
    user: AuthenticatedUser,
    employeeId: string,
    sessionId: string,
    deviceId: string,
  ) {
    const session = await this.prisma.workSession.findFirst({
      where: {
        tenantId: user.tenantId,
        id: sessionId,
        employeeId,
        userId: user.userId,
        deviceId,
        endedAt: null,
      },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException('Active work session was not found.');
    }
    return session;
  }

  private async getSettings(tenantId: string): Promise<SettingsGate> {
    const settings = await this.prisma.agentTrackingSettings.findUnique({
      where: { tenantId },
      select: {
        allowClipboardCapture: true,
        allowScreenshotCapture: true,
        clipboardFullContent: true,
        dlpConsentRequired: true,
        screenshotRetentionDays: true,
        historyRetentionDays: true,
      },
    });
    // No settings row means the tenant never configured the agent — capture off.
    return (
      settings ?? {
        allowClipboardCapture: false,
        allowScreenshotCapture: false,
        clipboardFullContent: false,
        dlpConsentRequired: false,
        screenshotRetentionDays: 30,
        historyRetentionDays: 90,
      }
    );
  }

  private async hasMonitoringConsent(
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    const ack = await this.prisma.legalDocumentAcknowledgement.findFirst({
      where: {
        tenantId,
        userId,
        version: { document: { slug: DLP_MONITORING_POLICY_SLUG } },
      },
      select: { id: true },
    });
    return !!ack;
  }

  private async auditRuleChange(
    user: AuthenticatedUser,
    ruleId: string,
    action: string,
  ) {
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action,
      entityType: 'DlpRule',
      entityId: ruleId,
      sourceModule: 'agent-dlp',
    });
  }
}
