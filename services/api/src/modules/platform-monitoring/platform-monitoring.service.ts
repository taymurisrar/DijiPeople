import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { mkdir, readdir, stat } from 'fs/promises';
import path from 'path';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const LOG_FILE_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}\.(log|txt|json|ndjson)$/;

@Injectable()
export class PlatformMonitoringService {
  private readonly logDir = resolveLogDir();

  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async listEvents(
    user: AuthenticatedUser,
    query: Record<string, string | undefined>,
  ) {
    this.assertSuperAdmin(user);
    const take = Math.min(Math.max(Number(query.pageSize) || 100, 1), 250);
    const createdAt = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const logs = await this.prisma.errorLog.findMany({
      where: {
        traceId: query.reference
          ? { contains: query.reference, mode: 'insensitive' }
          : undefined,
        tenantId: query.tenantId || undefined,
        severity: query.severity || undefined,
        errorCode: query.category
          ? { contains: query.category, mode: 'insensitive' }
          : undefined,
        createdAt: Object.keys(createdAt).length > 0 ? createdAt : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return this.enrichEvents(logs);
  }

  async getEvent(user: AuthenticatedUser, traceId: string) {
    this.assertSuperAdmin(user);
    const log = await this.prisma.errorLog.findUnique({ where: { traceId } });
    if (!log) {
      throw new NotFoundException('Error event was not found.');
    }
    const [event] = await this.enrichEvents([log]);
    return {
      ...event,
      fullMessage: log.message,
      description: log.description,
      stack: log.stack,
      cause: log.cause,
      details: log.details,
      request: {
        method: log.method,
        path: log.path,
        params: log.params,
        query: log.query,
        body: log.requestBody,
        ipAddress: log.ipAddress,
      },
      client: { userAgent: log.userAgent },
      context: {
        userId: log.userId,
        tenantId: log.tenantId,
        organizationId: log.organizationId,
        businessUnitId: log.businessUnitId,
      },
    };
  }

  async listLogs(user: AuthenticatedUser) {
    this.assertSuperAdmin(user);
    await mkdir(this.logDir, { recursive: true });
    const entries = await readdir(this.logDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && LOG_FILE_PATTERN.test(entry.name))
        .map(async (entry) => {
          const filePath = this.resolveSafeLogPath(entry.name);
          const info = await stat(filePath);
          return {
            fileName: entry.name,
            size: info.size,
            createdAt: info.birthtime,
            modifiedAt: info.mtime,
          };
        }),
    );

    return files.sort(
      (a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime(),
    );
  }

  async getDownload(user: AuthenticatedUser, fileName: string) {
    this.assertSuperAdmin(user);
    await mkdir(this.logDir, { recursive: true });
    const filePath = this.resolveSafeLogPath(fileName);
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) {
      throw new NotFoundException('Log file was not found.');
    }

    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.platform?.id ?? user.userId,
      action: 'PLATFORM_ERROR_LOG_DOWNLOADED',
      entityType: 'PlatformLogFile',
      entityId: fileName,
      sourceModule: 'platform-monitoring',
      afterSnapshot: { fileName, size: info.size },
    });

    return {
      stream: createReadStream(filePath),
      fileName,
      size: info.size,
    };
  }

  async getLatestErrorDownload(user: AuthenticatedUser) {
    this.assertSuperAdmin(user);
    const logs = await this.listLogs(user);
    const latest =
      logs.find((file) => isErrorLogName(file.fileName)) ?? logs[0];

    if (!latest) {
      throw new NotFoundException('No log files are available.');
    }

    const download = await this.getDownload(user, latest.fileName);

    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.platform?.id ?? user.userId,
      action: 'PLATFORM_LATEST_ERROR_LOG_DOWNLOADED',
      entityType: 'PlatformLogFile',
      entityId: latest.fileName,
      sourceModule: 'platform-monitoring',
      afterSnapshot: { fileName: latest.fileName, size: latest.size },
    });

    return {
      ...download,
      fileName: `latest-${download.fileName}`,
    };
  }

  private assertSuperAdmin(user: AuthenticatedUser) {
    if (user.platform?.role !== 'SUPER_ADMIN') {
      void this.auditService.log({
        tenantId: 'platform',
        actorUserId: user.platform?.id ?? user.userId ?? null,
        action: 'PLATFORM_ERROR_LOG_ACCESS_DENIED',
        entityType: 'PlatformLogFile',
        entityId: 'logs',
        sourceModule: 'platform-monitoring',
      });
      throw new ForbiddenException({
        code: 'PLATFORM_SUPER_ADMIN_REQUIRED',
        message: 'Only Platform Super Admin can access platform monitoring.',
      });
    }
  }

  private async enrichEvents<
    T extends {
      traceId: string;
      errorCode: string;
      statusCode: number;
      severity: string;
      message: string;
      method: string | null;
      path: string | null;
      tenantId: string | null;
      userId: string | null;
      createdAt: Date;
    },
  >(logs: T[]) {
    const tenantIds = [...new Set(logs.flatMap((log) => log.tenantId ?? []))];
    const userIds = [...new Set(logs.flatMap((log) => log.userId ?? []))];
    const [tenants, users] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, firstName: true, lastName: true },
      }),
    ]);
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const userById = new Map(users.map((item) => [item.id, item]));

    return logs.map((log) => {
      const tenant = log.tenantId ? tenantById.get(log.tenantId) : null;
      const eventUser = log.userId ? userById.get(log.userId) : null;
      return {
        referenceNumber: log.traceId,
        timestamp: log.createdAt,
        severity: log.severity,
        sourceApp: log.traceId.startsWith('client_') ? 'web' : 'api',
        tenant:
          tenant ??
          (log.tenantId
            ? { id: log.tenantId, name: 'Unknown tenant', slug: '' }
            : null),
        user: eventUser
          ? {
              id: eventUser.id,
              email: eventUser.email,
              fullName: `${eventUser.firstName} ${eventUser.lastName}`.trim(),
            }
          : null,
        route: log.path,
        method: log.method,
        category: log.errorCode,
        message: log.message,
        status: log.statusCode >= 500 ? 'OPEN' : 'REVIEW',
        statusCode: log.statusCode,
        environment: process.env.NODE_ENV ?? 'development',
      };
    });
  }

  private resolveSafeLogPath(fileName: string) {
    const decoded = safeDecodeFileName(fileName);
    if (
      decoded !== path.basename(decoded) ||
      path.isAbsolute(decoded) ||
      decoded.includes('..') ||
      !LOG_FILE_PATTERN.test(decoded)
    ) {
      throw new BadRequestException('Invalid log filename.');
    }

    const root = path.resolve(this.logDir);
    const resolved = path.resolve(root, decoded);
    if (
      resolved !== path.join(root, decoded) ||
      !resolved.startsWith(root + path.sep)
    ) {
      throw new BadRequestException('Invalid log filename.');
    }
    return resolved;
  }
}

function resolveLogDir() {
  const configured =
    process.env.DIJIPEOPLE_LOG_DIR ??
    process.env.LOG_DIR ??
    process.env.ERROR_LOG_DIR;
  return path.resolve(configured ?? path.join(process.cwd(), 'logs'));
}

function safeDecodeFileName(fileName: string) {
  try {
    return decodeURIComponent(fileName);
  } catch {
    throw new BadRequestException('Invalid log filename.');
  }
}

function isErrorLogName(fileName: string) {
  return /error|exception|fatal/i.test(fileName);
}
