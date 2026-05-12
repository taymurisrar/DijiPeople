import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
};

@Injectable()
export class ErrorLogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ErrorLogsService.name);
  private retentionTimer: NodeJS.Timeout | null = null;
  private missingTableWarningLogged = false;
  private errorLogTableAvailable: boolean | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    void this.cleanupExpiredLogs();
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

    const data = sanitizeForErrorLog({
      traceId: input.traceId,
      errorCode: input.errorCode,
      statusCode: input.statusCode,
      severity: input.severity,
      message: input.message,
      description: input.description,
      stack: config.includeStack ? input.stack : undefined,
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

    try {
      await this.prisma.errorLog.upsert({
        where: { traceId: data.traceId },
        update: data as Prisma.ErrorLogUpdateInput,
        create: data as Prisma.ErrorLogCreateInput,
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
    user: { tenantId?: string; roleKeys?: string[] },
  ) {
    if (!(await this.canUseErrorLogTable(traceId))) return null;

    let log: Awaited<ReturnType<typeof this.prisma.errorLog.findUnique>>;
    try {
      log = await this.prisma.errorLog.findUnique({ where: { traceId } });
    } catch (error) {
      if (this.isErrorLogTableMissing(error)) {
        this.logMissingTableWarning(traceId);
        return null;
      }

      throw error;
    }

    if (!log) return null;

    if (
      this.isPlatformCustomizer(user) ||
      !log.tenantId ||
      log.tenantId === user.tenantId
    ) {
      return log;
    }

    return null;
  }

  async formatDownload(
    traceId: string,
    user: { tenantId?: string; roleKeys?: string[] },
  ) {
    const log = await this.findForUser(traceId, user);
    if (!log) return null;
    const config = getErrorFrameworkConfig(this.configService);

    return formatErrorLogText(log, {
      includeStack: config.includeStack && config.exposeStackToSystemCustomizer,
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
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private isPlatformCustomizer(user: { roleKeys?: string[] }) {
    const roles = new Set((user.roleKeys ?? []).map(normalizeRole));
    return roles.has('global-admin') && roles.has('system-customizer');
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
      const result = await this.prisma.$queryRaw<
        Array<{ exists: boolean }>
      >`SELECT to_regclass('public."ErrorLog"') IS NOT NULL AS "exists"`;
      this.errorLogTableAvailable = Boolean(result[0]?.exists);
    } catch (error) {
      if (this.isErrorLogTableMissing(error)) {
        this.errorLogTableAvailable = false;
      } else {
        this.logger.warn(
          JSON.stringify({
            traceId,
            message: 'Unable to verify ErrorLog table availability.',
            error: error instanceof Error ? error.message : String(error),
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
