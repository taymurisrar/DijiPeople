import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getErrorFrameworkConfig } from '../../common/errors/error-config';
import { sanitizeForErrorLog } from '../../common/errors/sanitize-error-log';
import { formatErrorLogText } from './error-log.formatter';

export type PersistErrorLogInput = {
  traceId: string;
  errorCode: string;
  statusCode: number;
  severity: string;
  message: string;
  description: string;
  stack?: string;
  cause?: unknown;
  details?: unknown;
  method?: string;
  path?: string;
  params?: unknown;
  query?: unknown;
  requestBody?: unknown;
  userAgent?: string;
  ipAddress?: string;
  userId?: string;
  tenantId?: string;
  organizationId?: string;
  businessUnitId?: string;
  clientReported?: boolean;
};

@Injectable()
export class ErrorLogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ErrorLogsService.name);
  private retentionTimer: NodeJS.Timeout | null = null;
  private missingTableWarningLogged = false;
  private databaseUnavailableWarningLogged = false;
  private errorLogTableAvailable: boolean | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.retentionTimer = setInterval(
      () => void this.cleanupExpiredLogs(),
      24 * 60 * 60 * 1000,
    );
    this.retentionTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }
  }

  async persist(input: PersistErrorLogInput) {
    const config = getErrorFrameworkConfig(this.configService);
    if (!config.enabled || config.storage !== 'database') return;
    if (!(await this.canUseErrorLogTable(input.traceId))) return;

    const sanitized = sanitizeForErrorLog({
      traceId: input.traceId,
      errorCode: input.errorCode,
      statusCode: input.statusCode,
      severity: input.severity,
      message: input.message,
      description: input.description,
      stack:
        input.clientReported || config.includeStack ? input.stack : undefined,
      cause: input.cause,
      details: input.details,
      method: input.method,
      path: input.path,
      params: input.params,
      query: input.query,
      requestBody: config.includeRequestBody ? input.requestBody : undefined,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      userId: input.userId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      businessUnitId: input.businessUnitId,
    });
    const data = {
      ...sanitized,
      sourceApp: sourceAppFor(input.traceId),
      environment: process.env.NODE_ENV ?? 'development',
    };
    const fingerprint = incidentFingerprint(data);

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.errorLog.findUnique({
          where: { fingerprint },
        });
        const incident = existing
          ? await tx.errorLog.update({
              where: { id: existing.id },
              data: {
                lastSeenAt: new Date(),
                occurrenceCount: { increment: 1 },
                severity: data.severity,
                statusCode: data.statusCode,
                message: data.message,
                description: data.description,
                stack: data.stack,
                cause: data.cause as Prisma.InputJsonValue | undefined,
                details: data.details as Prisma.InputJsonValue | undefined,
              },
            })
          : await tx.errorLog.create({
              data: {
                ...(data as Prisma.ErrorLogCreateInput),
                fingerprint,
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
                occurrenceCount: 1,
              },
            });
        await tx.errorLogOccurrence.upsert({
          where: { traceId: data.traceId },
          update: {},
          create: {
            incidentId: incident.id,
            traceId: data.traceId,
            diagnosticJson: JSON.parse(
              JSON.stringify(data),
            ) as Prisma.InputJsonValue,
          },
        });
      });
    } catch (error) {
      if (this.isErrorLogTableMissing(error)) {
        this.logMissingTableWarning(input.traceId);
        return;
      }

      this.logger.error(
        JSON.stringify({
          traceId: input.traceId,
          errorCode: input.errorCode,
          storage: config.storage,
        }),
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async findForUser(
    traceId: string,
    user: { userId?: string; tenantId?: string; roleKeys?: string[] },
  ) {
    if (!(await this.canUseErrorLogTable(traceId))) return null;

    let log: Awaited<ReturnType<typeof this.prisma.errorLog.findUnique>>;
    try {
      log = await this.prisma.errorLog.findUnique({ where: { traceId } });
      if (!log) {
        const occurrence = await this.prisma.errorLogOccurrence.findUnique({
          where: { traceId },
          include: { incident: true },
        });
        log = occurrence?.incident ?? null;
      }
    } catch (error) {
      if (this.isErrorLogTableMissing(error)) {
        this.logMissingTableWarning(traceId);
        return null;
      }

      throw error;
    }

    if (!log) return null;

    if (this.isSupportUser(user)) {
      return log;
    }

    if (
      (!log.tenantId || log.tenantId === user.tenantId) &&
      Boolean(log.userId) &&
      log.userId === user.userId
    ) {
      return log;
    }

    return null;
  }

  async formatDownload(
    traceId: string,
    user: { userId?: string; tenantId?: string; roleKeys?: string[] },
  ) {
    const log = await this.findForUser(traceId, user);
    if (!log) return null;
    const config = getErrorFrameworkConfig(this.configService);

    return formatErrorLogText(log, {
      includeStack:
        traceId.startsWith('client_') ||
        (config.includeStack &&
          (this.userOwnsLog(log, user) ||
            (config.exposeStackToSystemCustomizer &&
              this.userCanDownload(user)))),
    });
  }

  userCanDownload(user: {
    roleKeys?: string[];
    accessContext?: { isSystemCustomizer?: boolean };
  }) {
    const config = getErrorFrameworkConfig(this.configService);
    const configuredKey = normalizeRole(config.downloadRole);
    return Boolean(
      user.accessContext?.isSystemCustomizer ||
      (user.roleKeys ?? []).some(
        (roleKey) => normalizeRole(roleKey) === configuredKey,
      ),
    );
  }

  async cleanupExpiredLogs() {
    const config = getErrorFrameworkConfig(this.configService);
    if (!config.enabled || config.storage !== 'database') return;
    if (!(await this.canUseErrorLogTable('retention'))) return;

    const cutoff = new Date(
      Date.now() - config.retentionDays * 24 * 60 * 60 * 1000,
    );
    try {
      const result = await this.prisma.errorLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      this.logger.log(
        JSON.stringify({
          traceId: 'retention',
          deletedCount: result.count,
          retentionDays: config.retentionDays,
        }),
      );
    } catch (error) {
      if (this.isErrorLogTableMissing(error)) {
        this.logMissingTableWarning('retention');
        return;
      }

      this.logger.warn(
        JSON.stringify({
          traceId: 'retention',
          message: 'Error log retention cleanup failed.',
          error: formatPrismaError(error),
        }),
      );
    }
  }

  private isSupportUser(user: { roleKeys?: string[] }) {
    const roles = new Set((user.roleKeys ?? []).map(normalizeRole));
    return (
      roles.has('global-admin') ||
      roles.has('global-administrator') ||
      roles.has('system-admin') ||
      roles.has('system-administrator') ||
      roles.has('system-customizer')
    );
  }

  private userOwnsLog(
    log: { userId?: string | null },
    user: { userId?: string },
  ) {
    return Boolean(log.userId && user.userId && log.userId === user.userId);
  }

  private isErrorLogTableMissing(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021'
    );
  }

  private async canUseErrorLogTable(traceId: string) {
    if (this.errorLogTableAvailable !== null) {
      if (!this.errorLogTableAvailable) {
        this.logMissingTableWarning(traceId);
      }
      return this.errorLogTableAvailable;
    }

    try {
      await this.prisma.errorLog.count({ take: 1 });
      this.errorLogTableAvailable = true;
    } catch (error) {
      if (this.isErrorLogTableMissing(error)) {
        this.errorLogTableAvailable = false;
      } else if (this.isDatabaseUnavailable(error)) {
        this.logDatabaseUnavailableWarning(traceId, error);
        return false;
      } else {
        this.logger.warn(
          JSON.stringify({
            traceId,
            message: 'Unable to verify ErrorLog table availability.',
            error: formatPrismaError(error),
          }),
        );
        return false;
      }
    }

    if (!this.errorLogTableAvailable) {
      this.logMissingTableWarning(traceId);
    }

    return this.errorLogTableAvailable;
  }

  private isDatabaseUnavailable(error: unknown) {
    const code = getPrismaErrorCode(error);
    const message =
      error instanceof Error ? error.message : String(error ?? '');
    const lowerMessage = message.toLowerCase();

    return (
      code === 'P1001' ||
      code === 'P1002' ||
      code === 'P1017' ||
      code === 'ECONNREFUSED' ||
      lowerMessage.includes('connection terminated') ||
      lowerMessage.includes('server has closed the connection') ||
      lowerMessage.includes('database system is in recovery mode') ||
      lowerMessage.includes('database system is not yet accepting connections')
    );
  }

  private logDatabaseUnavailableWarning(traceId: string, error: unknown) {
    if (this.databaseUnavailableWarningLogged) {
      return;
    }

    this.databaseUnavailableWarningLogged = true;
    this.logger.debug(
      JSON.stringify({
        traceId,
        message:
          'ErrorLog table availability check skipped because the database is not reachable.',
        error: formatPrismaError(error),
      }),
    );
  }

  private logMissingTableWarning(traceId: string) {
    if (this.missingTableWarningLogged) {
      return;
    }

    this.missingTableWarningLogged = true;
    this.logger.warn(
      JSON.stringify({
        traceId,
        message:
          'ErrorLog table is not available yet. Run the Prisma migration to enable persisted error logs.',
        command: 'npm --workspace api run prisma:migrate:dev',
      }),
    );
  }
}

function normalizeRole(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function sourceAppFor(traceId: string) {
  if (traceId.startsWith('client_')) return 'web';
  if (traceId.startsWith('admin_')) return 'admin';
  return 'api';
}

function incidentFingerprint(input: {
  errorCode: string;
  sourceApp: string;
  method?: string | null;
  path?: string | null;
  message: string;
}) {
  const stableMessage = input.message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\b\d+\b/g, ':n')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256')
    .update(
      [
        input.sourceApp,
        input.errorCode,
        input.method ?? '',
        input.path ?? '',
        stableMessage,
      ].join('|'),
    )
    .digest('hex');
}

function getPrismaErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : null;
}

function formatPrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      code: error.code,
      message: error.message,
      meta: error.meta,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return String(error);
}
