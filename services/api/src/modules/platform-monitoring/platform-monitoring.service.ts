import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const page = normalizePositiveInt(query.page, 1);
    const pageSize = Math.min(
      Math.max(normalizePositiveInt(query.pageSize, 25), 10),
      100,
    );
    const createdAt = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const search = query.search?.trim();
    const where: Prisma.ErrorLogWhereInput = {
      AND: [
        query.reference
          ? { traceId: { contains: query.reference, mode: 'insensitive' } }
          : {},
        getSourceAppWhere(query.sourceApp),
        query.tenantId && query.tenantId !== 'platform'
          ? { tenantId: query.tenantId }
          : {},
        query.tenantId === 'platform' ? { tenantId: null } : {},
        query.userId ? { userId: query.userId } : {},
        query.severity ? { severity: query.severity } : {},
        query.category
          ? { errorCode: { contains: query.category, mode: 'insensitive' } }
          : {},
        query.route
          ? { path: { contains: query.route, mode: 'insensitive' } }
          : {},
        query.method ? { method: query.method.toUpperCase() } : {},
        Object.keys(createdAt).length > 0 ? { createdAt } : {},
        search
          ? {
              OR: [
                { traceId: { contains: search, mode: 'insensitive' } },
                { errorCode: { contains: search, mode: 'insensitive' } },
                { message: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { path: { contains: search, mode: 'insensitive' } },
                { userId: { contains: search, mode: 'insensitive' } },
                { tenantId: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const orderBy = getErrorLogOrderBy(query.sortBy, query.sortDirection);
    const [logs, total] = await Promise.all([
      this.prisma.errorLog.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.errorLog.count({ where }),
    ]);
    const items = await this.enrichEvents(logs);
    return {
      items: items.filter((item) => {
        if (query.environment && item.environment !== query.environment) {
          return false;
        }
        return true;
      }),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        sortBy: normalizeSortBy(query.sortBy),
        sortDirection: normalizeSortDirection(query.sortDirection),
      },
    };
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
        platformActor: readPlatformActor(log.details),
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
      details?: unknown;
    },
  >(logs: T[]) {
    const tenantIds = [...new Set(logs.flatMap((log) => log.tenantId ?? []))];
    const userIds = [...new Set(logs.flatMap((log) => log.userId ?? []))];
    const platformActorIds = [
      ...new Set(
        logs.flatMap((log) => {
          const actor = readPlatformActor(
            'details' in log ? (log as { details?: unknown }).details : null,
          );
          return actor?.id ?? [];
        }),
      ),
    ];
    const [tenants, users, platformUsers] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, firstName: true, lastName: true },
      }),
      this.prisma.platformUser.findMany({
        where: { id: { in: platformActorIds } },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      }),
    ]);
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const userById = new Map(users.map((item) => [item.id, item]));
    const platformUserById = new Map(
      platformUsers.map((item) => [item.id, item]),
    );

    return logs.map((log) => {
      const tenant = log.tenantId ? tenantById.get(log.tenantId) : null;
      const eventUser = log.userId ? userById.get(log.userId) : null;
      const platformActor = readPlatformActor(
        'details' in log ? (log as { details?: unknown }).details : null,
      );
      const platformUser = platformActor?.id
        ? platformUserById.get(platformActor.id)
        : null;
      return {
        referenceNumber: log.traceId,
        timestamp: log.createdAt,
        severity: log.severity,
        sourceApp: getLogSourceApp(log.traceId),
        tenant:
          tenant ??
          (log.tenantId
            ? { id: log.tenantId, name: 'Unknown tenant', slug: '' }
            : null),
        user: platformUser
          ? {
              id: platformUser.id,
              email: platformUser.email,
              fullName:
                `${platformUser.firstName} ${platformUser.lastName}`.trim(),
              role: platformUser.role,
              source: 'platform-admin' as const,
            }
          : eventUser
            ? {
                id: eventUser.id,
                email: eventUser.email,
                fullName: `${eventUser.firstName} ${eventUser.lastName}`.trim(),
                role: null,
                source: 'tenant-user' as const,
              }
            : platformActor
              ? {
                  id: platformActor.id,
                  email: platformActor.email ?? 'Unknown platform user',
                  fullName: platformActor.email ?? platformActor.id,
                  role: platformActor.role ?? null,
                  source: 'platform-admin' as const,
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

function getLogSourceApp(traceId: string) {
  if (traceId.startsWith('client_')) return 'web';
  if (traceId.startsWith('admin_')) return 'admin';
  return 'api';
}

function normalizePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeSortBy(value: string | undefined) {
  const allowed = new Set([
    'timestamp',
    'severity',
    'sourceApp',
    'tenant',
    'user',
    'route',
    'category',
    'statusCode',
  ]);
  return value && allowed.has(value) ? value : 'timestamp';
}

function normalizeSortDirection(value: string | undefined) {
  return value === 'asc' ? 'asc' : 'desc';
}

function getErrorLogOrderBy(
  sortBy: string | undefined,
  sortDirection: string | undefined,
) {
  const direction = normalizeSortDirection(sortDirection);
  switch (normalizeSortBy(sortBy)) {
    case 'severity':
      return { severity: direction } as const;
    case 'route':
      return { path: direction } as const;
    case 'category':
      return { errorCode: direction } as const;
    case 'statusCode':
      return { statusCode: direction } as const;
    case 'timestamp':
    case 'sourceApp':
    case 'tenant':
    case 'user':
    default:
      return { createdAt: direction } as const;
  }
}

function getSourceAppWhere(sourceApp: string | undefined) {
  switch (sourceApp) {
    case 'web':
      return { traceId: { startsWith: 'client_' } };
    case 'admin':
      return { traceId: { startsWith: 'admin_' } };
    case 'api':
      return {
        NOT: [
          { traceId: { startsWith: 'client_' } },
          { traceId: { startsWith: 'admin_' } },
        ],
      };
    default:
      return {};
  }
}

function readPlatformActor(details: unknown) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }
  const actor = (details as Record<string, unknown>).platformActor;
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) {
    return null;
  }
  const record = actor as Record<string, unknown>;
  return {
    id: typeof record.id === 'string' ? record.id : '',
    email: typeof record.email === 'string' ? record.email : null,
    role: typeof record.role === 'string' ? record.role : null,
  };
}
