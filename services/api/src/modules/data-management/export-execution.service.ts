import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataJobStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { csvCell, type CsvFile } from '../../common/utils/csv.util';
import { SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { buildScopedAccessWhere } from '../../common/security/rbac-query-scope';
import { AttendanceService } from '../attendance/attendance.service';
import { EmployeesService } from '../employees/employees.service';
import { DataModuleRegistryService } from './module-registry.service';

/** Entity each module is scoped by, so an export never widens visibility. */
const MODULE_ENTITY_KEYS: Record<string, string> = {
  employees: ENTITY_KEYS.EMPLOYEES,
  attendance: ENTITY_KEYS.ATTENDANCE,
  leaves: ENTITY_KEYS.LEAVE_REQUESTS,
};

/** Prisma delegate name for a model, e.g. AttendanceEntry -> attendanceEntry. */
function delegateName(modelName: string) {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

/** Picks something human readable from an included relation. */
function relationLabel(value: unknown): string {
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  const parts = [record.firstName, record.lastName].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );

  if (parts.length) return parts.join(' ');

  for (const key of ['name', 'label', 'title', 'code', 'employeeCode']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate) return candidate;
  }

  return '';
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return relationLabel(value);
  return String(value);
}

/**
 * Produces a module's export file.
 *
 * Each module exports through its own service, so the file contains exactly the
 * rows that user could already list: tenant isolation, permissions and field
 * scoping are inherited rather than re-implemented here.
 */
type ExportProducer = (
  user: AuthenticatedUser,
  filters: Record<string, unknown>,
) => Promise<CsvFile>;

@Injectable()
export class ExportExecutionService {
  private readonly logger = new Logger(ExportExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly registry: DataModuleRegistryService,
    private readonly employeesService: EmployeesService,
    private readonly attendanceService: AttendanceService,
  ) {}

  private producers(): Record<string, ExportProducer> {
    return {
      employees: (user, filters) =>
        this.employeesService.exportEmployees(user, {
          page: 1,
          pageSize: 10000,
          ...filters,
        } as never),
      // Attendance returns its own shape, so it is normalised here rather than
      // changing a contract other callers already depend on.
      attendance: async (user, filters) => {
        const result = await this.attendanceService.exportAttendance(user, {
          page: 1,
          pageSize: 10000,
          ...filters,
        } as never);

        return {
          filename: result.fileName,
          buffer: Buffer.from(result.csv, 'utf8'),
        };
      },
    };
  }

  /** Queues an export; the worker produces the file. */
  async queueExport(
    currentUser: AuthenticatedUser,
    moduleKey: string,
    filters: Record<string, unknown> = {},
  ) {
    const module = this.registry.getModule(moduleKey);

    if (!module.supportsExport) {
      throw new BadRequestException(
        `${module.label} does not support export yet.`,
      );
    }

    if (!this.producers()[moduleKey]) {
      throw new BadRequestException(
        `${module.label} does not support background export yet.`,
      );
    }

    // Same module and filters within the same minute resolve to one job, so a
    // double click does not queue the work twice.
    const idempotencyKey = createHash('sha256')
      .update(moduleKey)
      .update(JSON.stringify(filters))
      .update(currentUser.userId)
      .update(String(Math.floor(Date.now() / 60_000)))
      .digest('hex');

    const job = await this.prisma.dataJob.upsert({
      where: {
        tenantId_kind_idempotencyKey: {
          tenantId: currentUser.tenantId,
          kind: 'EXPORT',
          idempotencyKey,
        },
      },
      create: {
        tenantId: currentUser.tenantId,
        kind: 'EXPORT',
        moduleKey,
        status: DataJobStatus.QUEUED,
        idempotencyKey,
        name: `${module.label} export`,
        optionsJson: filters as never,
        submittedByUserId: currentUser.userId,
      },
      update: {},
      select: { id: true },
    });

    return this.getExportSummary(currentUser, job.id);
  }

  /**
   * Exports every field the module exposes, including relation labels.
   *
   * The module's own list export is a curated set for reading on screen; a data
   * export is for moving the record elsewhere, so it carries the full field set
   * the import template accepts plus the related record each lookup points at.
   */
  private async buildCompleteExport(
    user: AuthenticatedUser,
    moduleKey: string,
  ): Promise<CsvFile> {
    const module = this.registry.getModule(moduleKey);
    const entityKey = MODULE_ENTITY_KEYS[moduleKey];

    if (!entityKey) {
      throw new BadRequestException(
        `${module.label} has no security scope configured for export.`,
      );
    }

    const delegate = (
      this.prisma as unknown as Record<
        string,
        {
          findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
        }
      >
    )[delegateName(module.modelName)];

    if (!delegate) {
      throw new BadRequestException(
        `${module.label} cannot be exported: no data source.`,
      );
    }

    // Relations are included so a lookup column shows a name, not an opaque id.
    const include: Record<string, boolean> = {};

    for (const relation of this.registry.relationPropertiesFor(
      module.modelName,
    )) {
      include[relation] = true;
    }

    const rows = await delegate.findMany({
      where: {
        AND: [
          { tenantId: user.tenantId },
          buildScopedAccessWhere(user, entityKey, SecurityPrivilege.READ, {
            organizationIdField: null,
            userIdField: 'userId',
          }),
        ],
      },
      ...(Object.keys(include).length ? { include } : {}),
      take: 10_000,
    });

    const columns = module.importFields.map((field) => field.key);
    const relationColumns = Object.keys(include);
    const header = [
      ...columns,
      ...relationColumns.map((key) => `${key} (name)`),
    ];

    const lines = [header.map(csvCell).join(',')];

    for (const row of rows) {
      const values = [
        ...columns.map((key) => cellText(row[key])),
        ...relationColumns.map((key) => relationLabel(row[key])),
      ];

      lines.push(values.map(csvCell).join(','));
    }

    return {
      filename: `${moduleKey}-export.csv`,
      buffer: Buffer.from(lines.join(String.fromCharCode(10)), 'utf8'),
    };
  }

  /** Runs a claimed export job and stores the resulting file. */
  async runExport(currentUser: AuthenticatedUser, jobId: string) {
    const job = await this.prisma.dataJob.findFirst({
      where: { id: jobId, tenantId: currentUser.tenantId, kind: 'EXPORT' },
    });

    if (!job) {
      throw new BadRequestException(
        'Export job was not found for this tenant.',
      );
    }

    const producer = this.producers()[job.moduleKey];

    if (!producer) {
      throw new BadRequestException(
        `${job.moduleKey} does not support background export yet.`,
      );
    }

    const filters = (job.optionsJson ?? {}) as Record<string, unknown>;

    // A complete export is the default; the module's own writer is used only
    // when a caller asked for the on-screen column set.
    const file =
      filters.curated === true
        ? await producer(currentUser, filters)
        : await this.buildCompleteExport(currentUser, job.moduleKey);

    const stored = await this.storage.saveFile({
      buffer: file.buffer,
      originalFileName: file.filename,
      subdirectory: `data-exports/${currentUser.tenantId}`,
    });

    // Header row excluded from the count the user sees.
    const rowCount = Math.max(
      0,
      file.buffer.toString('utf8').trim().split(/\r?\n/).length - 1,
    );

    await this.prisma.dataJob.update({
      where: { id: job.id },
      data: {
        status: DataJobStatus.COMPLETED,
        resultFileKey: stored.storageKey,
        fileName: file.filename,
        totalRows: rowCount,
        processedRows: rowCount,
        progressPercent: 100,
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `Export ${job.id} (${job.moduleKey}) produced ${rowCount} row(s)`,
    );

    return this.getExportSummary(currentUser, job.id);
  }

  async getExportSummary(currentUser: AuthenticatedUser, jobId: string) {
    const job = await this.prisma.dataJob.findFirst({
      where: { id: jobId, tenantId: currentUser.tenantId, kind: 'EXPORT' },
    });

    if (!job) {
      throw new BadRequestException(
        'Export job was not found for this tenant.',
      );
    }

    return {
      id: job.id,
      moduleKey: job.moduleKey,
      status: job.status,
      fileName: job.fileName,
      totalRows: job.totalRows,
      progressPercent: job.progressPercent,
      failureReason: job.failureReason,
      isDownloadable:
        job.status === DataJobStatus.COMPLETED && Boolean(job.resultFileKey),
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  }

  /** Opens the stored export file for streaming back to the user. */
  async openExportFile(currentUser: AuthenticatedUser, jobId: string) {
    const job = await this.prisma.dataJob.findFirst({
      where: { id: jobId, tenantId: currentUser.tenantId, kind: 'EXPORT' },
      select: { resultFileKey: true, fileName: true, status: true },
    });

    if (!job) {
      throw new BadRequestException(
        'Export job was not found for this tenant.',
      );
    }

    if (job.status !== DataJobStatus.COMPLETED || !job.resultFileKey) {
      throw new BadRequestException(
        'This export is not ready to download yet.',
      );
    }

    const stored = await this.storage.openFile(job.resultFileKey);

    return {
      stream: stored.stream,
      filename: job.fileName ?? 'export.csv',
      size: stored.size,
    };
  }
}
