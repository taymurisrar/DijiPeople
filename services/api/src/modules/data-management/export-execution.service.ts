import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataJobStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import type { CsvFile } from '../../common/utils/csv.util';
import { AttendanceService } from '../attendance/attendance.service';
import { EmployeesService } from '../employees/employees.service';
import { DataModuleRegistryService } from './module-registry.service';

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
    const file = await producer(currentUser, filters);

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
