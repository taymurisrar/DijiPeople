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
import { userHasPlatformPermission } from '../platform-auth/platform-permissions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  redactSecretsInText,
  sanitizeForErrorLog,
} from '../../common/errors/sanitize-error-log';
import { NOT_AN_INCIDENT } from '../error-logs/expected-protocol-outcome';
import {
  buildErrorLogWhere,
  criticalIncidentWhere,
  getErrorLogOrderBy,
  investigatingIncidentWhere,
  normalizePositiveInt,
  normalizeSortBy,
  normalizeSortDirection,
  openIncidentWhere,
  scopeWhere,
  severityGroupOf,
  warningIncidentWhere,
  type ErrorLogListQuery,
} from './error-log-query';

/*
 * Re-exported so the callers that already import these predicates from the
 * service — the operations dashboard and the BUG-1750/BUG-2495 specs — keep one
 * definition rather than growing a second import path to a copy.
 */
export {
  CRITICAL_INCIDENT_SEVERITIES,
  INVESTIGATING_SUPPORT_STATUSES,
  criticalIncidentWhere,
  incidentViewWhere,
  investigatingIncidentWhere,
  openIncidentWhere,
} from './error-log-query';

const LOG_FILE_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}\.(log|txt|json|ndjson)$/;

/** How many tenant names a search may expand to before it stops widening. */
const TENANT_SEARCH_LIMIT = 50;

@Injectable()
export class PlatformMonitoringService {
  private readonly logDir = resolveLogDir();

  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async listEvents(user: AuthenticatedUser, query: ErrorLogListQuery) {
    this.assertMonitoring(user, 'read');
    const page = normalizePositiveInt(query.page, 1);
    const pageSize = Math.min(
      Math.max(normalizePositiveInt(query.pageSize, 25), 10),
      100,
    );
    const options = {
      now: new Date(),
      tenantIdsMatchingSearch: await this.findTenantIdsByName(query.search),
    };
    const where = buildErrorLogWhere(query, options);
    /*
     * The summary metrics count the *scope* — period, source, environment,
     * module, tenant, search — and ignore the severity/status selection. Each
     * metric card doubles as that filter, and a breakdown that collapsed to
     * zero everywhere except the card just pressed would stop being one.
     */
    const scope = scopeWhere(query, options);
    const orderBy = getErrorLogOrderBy(query.sortBy, query.sortDirection);
    const [
      logs,
      matching,
      total,
      critical,
      warning,
      open,
      resolved,
      investigating,
      criticalOpen,
    ] = await Promise.all([
      this.prisma.errorLog.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.errorLog.count({ where }),
      this.prisma.errorLog.count({ where: scope }),
      /*
       * The same definition of "critical" the filter uses (BUG-1750): one
       * definition, every call site.
       */
      this.prisma.errorLog.count({
        where: { AND: [scope, criticalIncidentWhere()] },
      }),
      this.prisma.errorLog.count({
        where: { AND: [scope, warningIncidentWhere()] },
      }),
      /*
       * "Unresolved" means waiting for a person. `not: 'RESOLVED'` counted
       * expected protocol outcomes as open work, which is the same miscount
       * that filled the queue — just expressed as a number.
       */
      this.prisma.errorLog.count({
        where: { AND: [scope, openIncidentWhere()] },
      }),
      this.prisma.errorLog.count({
        where: { AND: [scope, { supportStatus: 'RESOLVED' }] },
      }),
      /*
       * Measured, not inferred (BUG-2495): counted from the predicate the
       * `investigating` view filters on, so the tile and its list agree.
       */
      this.prisma.errorLog.count({
        where: { AND: [scope, investigatingIncidentWhere()] },
      }),
      /*
       * The overview's "critical and unresolved" tile. It used to show the
       * all-time critical count while linking to critical-and-NEW, so the
       * number and the list it opened disagreed.
       */
      this.prisma.errorLog.count({
        where: { AND: [scope, criticalIncidentWhere(), openIncidentWhere()] },
      }),
    ]);
    const items = await this.enrichEvents(logs);
    return {
      items,
      meta: {
        page,
        pageSize,
        total: matching,
        totalPages: Math.max(1, Math.ceil(matching / pageSize)),
        sortBy: normalizeSortBy(query.sortBy),
        sortDirection: normalizeSortDirection(query.sortDirection),
      },
      metrics: {
        total,
        critical,
        warning,
        open,
        resolved,
        investigating,
        criticalOpen,
      },
    };
  }

  /**
   * The values the console's filters offer, read from the incidents that
   * exist rather than from a hardcoded list.
   *
   * The previous screen offered "staging" as an environment and "WEB" as a
   * source, neither of which any row has ever stored, so choosing them always
   * returned nothing. A filter option the data cannot satisfy is a dead
   * control; these lists cannot contain one.
   *
   * Grouped over the whole table, not the current filter, so choosing a value
   * never makes the other options disappear. Each column is indexed
   * (`sourceApp`, `module`, `tenantId` lead an index; `environment` is
   * low-cardinality), and the tenant list is capped.
   */
  async listFacets(user: AuthenticatedUser) {
    this.assertMonitoring(user, 'read');
    const [sources, environments, modules, tenantRows] = await Promise.all([
      this.prisma.errorLog.groupBy({
        by: ['sourceApp'],
        _count: { _all: true },
        orderBy: { sourceApp: 'asc' },
      }),
      this.prisma.errorLog.groupBy({
        by: ['environment'],
        _count: { _all: true },
        orderBy: { environment: 'asc' },
      }),
      this.prisma.errorLog.groupBy({
        by: ['module'],
        where: { module: { not: null } },
        _count: { _all: true },
        orderBy: { module: 'asc' },
      }),
      this.prisma.errorLog.groupBy({
        by: ['tenantId'],
        _count: { _all: true },
        orderBy: { tenantId: 'asc' },
        take: 500,
      }),
    ]);
    const tenantIds = tenantRows.flatMap((row) => row.tenantId ?? []);
    const tenants = tenantIds.length
      ? await this.prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true },
        })
      : [];
    const tenantName = new Map(tenants.map((row) => [row.id, row.name]));

    return {
      sourceApps: sources.map((row) => ({
        value: row.sourceApp,
        count: row._count._all,
      })),
      environments: environments.map((row) => ({
        value: row.environment,
        count: row._count._all,
      })),
      modules: modules.flatMap((row) =>
        row.module ? [{ value: row.module, count: row._count._all }] : [],
      ),
      tenants: tenantRows
        .flatMap((row) =>
          row.tenantId && row.tenantId !== 'platform'
            ? [
                {
                  id: row.tenantId,
                  name: tenantName.get(row.tenantId) ?? 'Deleted tenant',
                  count: row._count._all,
                },
              ]
            : [],
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
      /* Incidents with no tenant: failed sign-ins, platform routes, probes. */
      platformCount: tenantRows
        .filter((row) => !row.tenantId || row.tenantId === 'platform')
        .reduce((total, row) => total + row._count._all, 0),
    };
  }

  /**
   * One incident, for the detail drawer.
   *
   * `traceId` may be the incident's own reference or the reference of any
   * later occurrence of it — the one the customer was actually shown is
   * usually the latter, and returning 404 for it sent the operator back to
   * searching by hand.
   */
  async getEvent(user: AuthenticatedUser, traceId: string) {
    this.assertMonitoring(user, 'read');
    const log =
      (await this.prisma.errorLog.findUnique({ where: { traceId } })) ??
      (await this.findIncidentByOccurrence(traceId));
    if (!log) {
      throw new NotFoundException('Error event was not found.');
    }
    const [
      event,
      relatedOccurrences,
      relatedAuditEvents,
      relatedOutboxEvents,
      organization,
      businessUnit,
    ] = await Promise.all([
      this.enrichEvents([log]).then(([item]) => item),
      this.findRelatedOccurrences(log.id, log.traceId),
      this.findRelatedAuditEvents(log.traceId),
      this.findRelatedOutboxEvents(log.traceId),
      /*
       * Names, not ids, for the context panel. Scoped by the incident's own
       * tenant so an id recorded against one tenant can never resolve to a
       * record of another.
       */
      log.organizationId && log.tenantId
        ? this.prisma.organization.findFirst({
            where: { id: log.organizationId, tenantId: log.tenantId },
            select: { id: true, name: true },
          })
        : null,
      log.businessUnitId && log.tenantId
        ? this.prisma.businessUnit.findFirst({
            where: { id: log.businessUnitId, tenantId: log.tenantId },
            select: { id: true, name: true },
          })
        : null,
    ]);
    /*
     * Re-sanitized on read, as defence in depth. Rows are sanitized when they
     * are written, but the sanitizer has grown since (BUG-3555 added free-text
     * scanning and the financial-identifier keys), and rows written before
     * that still hold whatever it used to miss. The same rules apply on the
     * way out, so an older row cannot show this screen a token the current
     * write path would have removed.
     */
    return {
      ...event,
      requestedReference: traceId,
      fullMessage: redactSecretsInText(log.message),
      description: redactSecretsInText(log.description),
      stack: log.stack ? redactSecretsInText(log.stack) : null,
      cause: sanitizeForErrorLog(log.cause),
      details: sanitizeForErrorLog(log.details),
      module: log.module,
      request: {
        method: log.method,
        path: log.path,
        params: sanitizeForErrorLog(log.params),
        query: sanitizeForErrorLog(log.query),
        body: sanitizeForErrorLog(log.requestBody),
        ipAddress: log.ipAddress,
      },
      client: { userAgent: log.userAgent },
      context: {
        userId: log.userId,
        tenantId: log.tenantId,
        organizationId: log.organizationId,
        organizationName: organization?.name ?? null,
        businessUnitId: log.businessUnitId,
        businessUnitName: businessUnit?.name ?? null,
        platformActor: readPlatformActor(log.details),
      },
      /*
       * BUG-3227's payoff: once AuditService fills traceId from ambient
       * context, an incident here can be joined straight back to the audit
       * rows the same request wrote — the "what did this request actually do"
       * question a raw stack trace cannot answer on its own.
       */
      relatedOccurrences,
      relatedAuditEvents,
      relatedOutboxEvents,
    };
  }

  private async findIncidentByOccurrence(traceId: string) {
    const occurrence = await this.prisma.errorLogOccurrence.findUnique({
      where: { traceId },
      select: { incident: true },
    });
    return occurrence?.incident ?? null;
  }

  /**
   * Tenants whose name matches a search, so "acme" finds Acme's incidents.
   * `ErrorLog` stores only the id; this is the join it cannot express.
   */
  private async findTenantIdsByName(search: string | undefined) {
    const value = search?.trim();
    if (!value || value.length < 2) return [];
    const tenants = await this.prisma.tenant.findMany({
      where: {
        OR: [
          { name: { contains: value, mode: 'insensitive' } },
          { slug: { contains: value, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: TENANT_SEARCH_LIMIT,
    });
    return tenants.map((tenant) => tenant.id);
  }

  /** Other recent occurrences of the same incident (same fingerprint), for "is this recurring". */
  private async findRelatedOccurrences(incidentId: string, ownTraceId: string) {
    const occurrences = await this.prisma.errorLogOccurrence.findMany({
      where: { incidentId, traceId: { not: ownTraceId } },
      orderBy: { occurredAt: 'desc' },
      take: 10,
      select: { traceId: true, occurredAt: true },
    });
    return occurrences.map((occurrence) => ({
      traceId: occurrence.traceId,
      occurredAt: occurrence.occurredAt,
    }));
  }

  /**
   * Audit rows this exact request wrote, tenant or platform. Both tables are
   * queried because a caller's own tenant is not known until the log row is
   * read, and a platform-scope request can still act on a tenant (a platform
   * admin editing a customer's record writes a *tenant* audit row carrying the
   * platform actor in `scope`, not a platform audit row).
   */
  private async findRelatedAuditEvents(traceId: string) {
    const [tenantRows, platformRows] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { traceId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          sourceModule: true,
          createdAt: true,
          tenantId: true,
        },
      }),
      this.prisma.platformAuditLog.findMany({
        where: { traceId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          sourceModule: true,
          createdAt: true,
        },
      }),
    ]);

    return [
      ...tenantRows.map((row) => ({ ...row, scope: 'tenant' as const })),
      ...platformRows.map((row) => ({
        ...row,
        tenantId: null,
        scope: 'platform' as const,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20);
  }

  /** Outbox jobs threaded through the same correlation id, for "did this come from a job". */
  private async findRelatedOutboxEvents(traceId: string) {
    const events = await this.prisma.outboxEvent.findMany({
      where: { correlationId: traceId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        eventType: true,
        status: true,
        attemptCount: true,
        lastError: true,
        createdAt: true,
      },
    });
    // `lastError` is a raw driver/handler message, never run through
    // `ErrorLog`'s sanitizer — the same free-text redaction applies here.
    return events.map((eventRow) => ({
      ...eventRow,
      lastError: eventRow.lastError
        ? redactSecretsInText(eventRow.lastError)
        : eventRow.lastError,
    }));
  }

  async updateEvent(
    user: AuthenticatedUser,
    traceId: string,
    body: Record<string, unknown>,
  ) {
    this.assertMonitoring(user, 'manage');
    const supportStatus = readSupportStatus(body.supportStatus);
    const assignedToUserId = readOptionalText(body.assignedToUserId, 80);
    const assignedTeam = readAssignedTeam(body.assignedTeam);
    const internalNote = readOptionalText(body.internalNote, 4_000);
    const customerUpdate = readOptionalText(body.customerUpdate, 4_000);
    const existing = await this.prisma.errorLog.findUnique({
      where: { traceId },
    });
    if (!existing) throw new NotFoundException('Error event was not found.');

    const assignee = assignedToUserId
      ? await this.prisma.platformUser.findFirst({
          where: {
            id: assignedToUserId,
            status: 'ACTIVE',
            role: {
              in: [
                'SUPER_ADMIN',
                'PLATFORM_OWNER',
                'PLATFORM_ADMIN',
                'MEMBER',
                'SUPPORT_MANAGER',
                'SUPPORT_AGENT',
                'MONITORING_OPERATOR',
              ],
            },
          },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : null;
    if (assignedToUserId && !assignee) {
      throw new BadRequestException(
        'Select an active platform admin or member.',
      );
    }
    const assignedTo = assignee
      ? `${assignee.firstName} ${assignee.lastName}`.trim() || assignee.email
      : assignedTeam;

    const resolvedAt =
      supportStatus === 'RESOLVED' ? (existing.resolvedAt ?? new Date()) : null;
    const updated = await this.prisma.errorLog.update({
      where: { traceId },
      data: {
        supportStatus,
        assignedTo,
        assignedToUserId: assignee?.id ?? null,
        internalNote,
        customerUpdate,
        resolvedAt,
      },
    });

    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.platform?.id ?? user.userId,
      action: 'PLATFORM_ERROR_SUPPORT_UPDATED',
      entityType: 'ErrorLog',
      entityId: traceId,
      sourceModule: 'platform-monitoring',
      beforeSnapshot: { supportStatus: existing.supportStatus },
      afterSnapshot: {
        supportStatus: updated.supportStatus,
        assignedTo: updated.assignedTo,
        assignedToUserId: updated.assignedToUserId,
        hasCustomerUpdate: Boolean(updated.customerUpdate),
      },
    });

    const [event] = await this.enrichEvents([updated]);
    return event;
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
    if (!userHasPlatformPermission(user, 'platform.monitoring.administer')) {
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

  private assertMonitoring(user: AuthenticatedUser, access: 'read' | 'manage') {
    if (
      !user.platform?.id ||
      !userHasPlatformPermission(user, `monitoring.${access}`)
    )
      throw new ForbiddenException({
        code: 'PLATFORM_MONITORING_PERMISSION_REQUIRED',
        message: `Platform monitoring ${access} access is required.`,
      });
  }

  private async enrichEvents<
    T extends {
      id: string;
      traceId: string;
      fingerprint?: string | null;
      firstSeenAt?: Date;
      lastSeenAt?: Date;
      occurrenceCount?: number;
      errorCode: string;
      statusCode: number;
      severity: string;
      message: string;
      method: string | null;
      path: string | null;
      module?: string | null;
      tenantId: string | null;
      userId: string | null;
      createdAt: Date;
      sourceApp?: string;
      environment?: string;
      supportStatus?: string;
      assignedTo?: string | null;
      assignedToUserId?: string | null;
      internalNote?: string | null;
      customerUpdate?: string | null;
      resolvedAt?: Date | null;
      updatedAt?: Date;
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
    const assigneeIds = [
      ...new Set(logs.flatMap((log) => log.assignedToUserId ?? [])),
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
        where: {
          id: { in: [...new Set([...platformActorIds, ...assigneeIds])] },
        },
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
      const assignedToUser = log.assignedToUserId
        ? platformUserById.get(log.assignedToUserId)
        : null;
      return {
        id: log.traceId,
        /*
         * The row id, which `id` above is not (it has always carried the trace
         * id, and the runtime keys records by it). Creating a support case from
         * an incident takes this id; passing the trace id there 404ed, so the
         * console's "Create support case" button never worked.
         */
        incidentId: log.id,
        traceId: log.traceId,
        fingerprint: log.fingerprint ?? null,
        firstSeenAt: log.firstSeenAt ?? log.createdAt,
        lastSeenAt: log.lastSeenAt ?? log.createdAt,
        occurrenceCount: log.occurrenceCount ?? 1,
        createdAt: log.createdAt,
        tenantId: log.tenantId,
        supportStatus: log.supportStatus ?? 'NEW',
        referenceNumber: log.traceId,
        timestamp: log.createdAt,
        severity: log.severity,
        // The group the console filters by, so a row labelled "Critical" is a
        // row the Critical filter returns; `severity` itself is free text.
        severityGroup: severityGroupOf(log.severity),
        sourceApp: log.sourceApp ?? getLogSourceApp(log.traceId),
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
        module: log.module ?? null,
        category: log.errorCode,
        // Redacted on read as well as on write; see `getEvent`.
        message: redactSecretsInText(log.message),
        status: log.supportStatus ?? 'NEW',
        assignedTo: log.assignedTo ?? null,
        assignedToUser: assignedToUser
          ? {
              id: assignedToUser.id,
              email: assignedToUser.email,
              fullName:
                `${assignedToUser.firstName} ${assignedToUser.lastName}`.trim(),
              role: assignedToUser.role,
            }
          : null,
        internalNote: log.internalNote ?? null,
        customerUpdate: log.customerUpdate ?? null,
        resolvedAt: log.resolvedAt ?? null,
        updatedAt: log.updatedAt ?? log.createdAt,
        statusCode: log.statusCode,
        environment: log.environment ?? process.env.NODE_ENV ?? 'development',
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

const SUPPORT_STATUSES = new Set([
  'NEW',
  'INVESTIGATING',
  'WAITING_ON_CUSTOMER',
  'FIX_IN_PROGRESS',
  'RESOLVED',
  /*
   * Recorded, never queued. Ordinary session expiry and requests for routes
   * that do not exist are answers the protocol is for, not defects — see
   * `expected-protocol-outcome.ts`. They are still searchable, because support
   * needs to answer "why was I signed out", but they were never something a
   * human should pick up and treating them as NEW put 1,588 rows in the queue
   * (BUG-1754).
   */
  NOT_AN_INCIDENT,
]);
const SUPPORT_TEAMS = new Set([
  'Customer Support',
  'Engineering',
  'Billing Support',
  'Platform Operations',
]);

function readAssignedTeam(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !SUPPORT_TEAMS.has(value))
    throw new BadRequestException('Select a configured support team.');
  return value;
}

function readSupportStatus(value: unknown) {
  if (typeof value !== 'string' || !SUPPORT_STATUSES.has(value)) {
    throw new BadRequestException('Select a valid support status.');
  }
  return value;
}

function readOptionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new BadRequestException(
      `Text must not exceed ${maxLength} characters.`,
    );
  }
  return value.trim() || null;
}
