import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DataImportMode,
  DataJobStatus,
  DataRowStatus,
  Prisma,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { AttendanceService } from '../attendance/attendance.service';
import { EmployeesService } from '../employees/employees.service';
import { DataJobLeaseLostError, type JobLease } from './data-job-lease';
import { DataModuleRegistryService } from './module-registry.service';
import type { ColumnMapping, RowIssue } from './import-analysis.service';

/**
 * Writes one mapped row through the owning module.
 *
 * Rows are always routed through the module's own create/update path so that
 * permissions, tenant scoping, validation and audit behave exactly as they do
 * for a single record created by hand. An import is never a shortcut into the
 * database.
 */
type ModuleExecutor = {
  findExisting: (
    user: AuthenticatedUser,
    values: Record<string, string>,
  ) => Promise<string | null>;
  create: (
    user: AuthenticatedUser,
    values: Record<string, string>,
  ) => Promise<string>;
  update: (
    user: AuthenticatedUser,
    recordId: string,
    values: Record<string, string>,
  ) => Promise<void>;
};

const CHUNK_SIZE = 100;

@Injectable()
export class ImportExecutionService {
  private readonly logger = new Logger(ImportExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DataModuleRegistryService,
    private readonly employeesService: EmployeesService,
    private readonly attendanceService: AttendanceService,
    private readonly auditService: AuditService,
  ) {}

  private executors(): Record<string, ModuleExecutor> {
    return {
      employees: {
        findExisting: async (user, values) => {
          const code = values.employeeCode?.trim();
          const email = values.workEmail?.trim();

          if (!code && !email) return null;

          const match = await this.prisma.employee.findFirst({
            where: {
              tenantId: user.tenantId,
              isDeleted: false,
              OR: [
                ...(code ? [{ employeeCode: code }] : []),
                ...(email ? [{ email }] : []),
              ],
            },
            select: { id: true },
          });

          return match?.id ?? null;
        },
        create: async (user, values) => {
          const created = await this.employeesService.create(
            user,
            this.toEmployeeDto(values) as never,
          );
          return (created as { id: string }).id;
        },
        update: async (user, recordId, values) => {
          await this.employeesService.update(
            user,
            recordId,
            this.toEmployeeDto(values) as never,
          );
        },
      },
      attendance: {
        // One entry per employee per day, which is what the module itself
        // enforces, so a re-run updates rather than duplicating a day.
        findExisting: async (user, values) => {
          const employeeId = values.employeeId?.trim();
          const date = values.date?.trim();

          if (!employeeId || !date) return null;

          const day = new Date(date);
          if (Number.isNaN(day.getTime())) return null;

          const nextDay = new Date(day);
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);

          const match = await this.prisma.attendanceEntry.findFirst({
            where: {
              tenantId: user.tenantId,
              employeeId,
              date: { gte: day, lt: nextDay },
            },
            select: { id: true },
          });

          return match?.id ?? null;
        },
        create: async (user, values) => {
          const created = await this.attendanceService.createManualEntry(
            user,
            this.toAttendanceDto(values) as never,
          );
          const record =
            (created as { item?: { id: string }; id?: string }).item ??
            (created as { id: string });
          return record.id;
        },
        update: async (user, recordId, values) => {
          await this.attendanceService.updateManualEntry(
            user,
            recordId,
            this.toAttendanceDto(values) as never,
          );
        },
      },
    };
  }

  /**
   * Manual attendance requires a reason for the adjustment, which is not a
   * column in the file. Recording the import as the reason keeps the audit
   * trail honest about where the entry came from.
   */
  private toAttendanceDto(values: Record<string, string>) {
    const dto: Record<string, string> = {};

    for (const [key, value] of Object.entries(values)) {
      const trimmed = value?.trim();
      if (trimmed) dto[key] = trimmed;
    }

    dto.adjustmentReason ||= 'Imported from a data management file';

    return dto;
  }

  /** Drops blanks so an absent column never clears an existing value. */
  private toEmployeeDto(values: Record<string, string>) {
    const dto: Record<string, string> = {};

    for (const [key, value] of Object.entries(values)) {
      const trimmed = value?.trim();
      if (trimmed) dto[key] = trimmed;
    }

    return dto;
  }

  /**
   * Puts a validated job on the queue for the background worker.
   *
   * Large files cannot finish inside an HTTP request, so the caller gets an
   * immediate acknowledgement and polls for progress.
   */
  async queueJob(currentUser: AuthenticatedUser, jobId: string) {
    const job = await this.prisma.dataJob.findFirst({
      where: { id: jobId, tenantId: currentUser.tenantId, kind: 'IMPORT' },
      select: { id: true, status: true, importMode: true },
    });

    if (!job) {
      throw new BadRequestException(
        'Import job was not found for this tenant.',
      );
    }

    if (job.importMode === DataImportMode.VALIDATE_ONLY) {
      throw new BadRequestException(
        'This job was created for validation only. Start a new import to write records.',
      );
    }

    if (job.status !== DataJobStatus.READY) {
      throw new BadRequestException(
        `An import in state ${job.status} cannot be queued.`,
      );
    }

    await this.prisma.dataJob.update({
      where: { id: job.id },
      data: { status: DataJobStatus.QUEUED, cancelledAt: null },
    });

    return this.getExecutionSummary(currentUser, job.id);
  }

  /**
   * Runs a previously analysed job.
   *
   * Only rows that passed validation are attempted; invalid rows keep the
   * issues recorded at analysis time so the error report stays complete.
   */
  async executeJob(
    currentUser: AuthenticatedUser,
    jobId: string,
    options: { alreadyClaimed?: boolean; lease?: JobLease } = {},
  ) {
    const job = await this.prisma.dataJob.findFirst({
      where: { id: jobId, tenantId: currentUser.tenantId, kind: 'IMPORT' },
    });

    if (!job) {
      throw new BadRequestException(
        'Import job was not found for this tenant.',
      );
    }

    if (job.importMode === DataImportMode.VALIDATE_ONLY) {
      throw new BadRequestException(
        'This job was created for validation only. Start a new import to write records.',
      );
    }

    if (
      !options.alreadyClaimed &&
      job.status !== DataJobStatus.READY &&
      job.status !== DataJobStatus.QUEUED
    ) {
      throw new BadRequestException(
        `An import in state ${job.status} cannot be executed.`,
      );
    }

    const executor = this.executors()[job.moduleKey];

    if (!executor) {
      throw new BadRequestException(
        `${job.moduleKey} does not support import execution yet.`,
      );
    }

    const mappings = (job.mappingJson ?? []) as unknown as ColumnMapping[];
    const mode = job.importMode ?? DataImportMode.CREATE_ONLY;

    // Counters are derived from the rows, not zeroed: on a first run every row
    // is VALID/INVALID so this yields zeros, and on a RESUME after a worker died
    // it carries forward the rows that were already applied instead of erasing
    // them (BUG-recovery, SESSION-0136). `failedRows` is the rows rejected at
    // analysis (INVALID) plus those that failed while being applied.
    const grouped = await this.prisma.dataJobRow.groupBy({
      by: ['status'],
      where: { jobId: job.id },
      _count: { _all: true },
    });
    const rowsIn = (status: DataRowStatus) =>
      grouped.find((g) => g.status === status)?._count._all ?? 0;
    const invalidAtAnalysis = rowsIn(DataRowStatus.INVALID);
    const counts = {
      created: rowsIn(DataRowStatus.CREATED),
      updated: rowsIn(DataRowStatus.UPDATED),
      skipped: rowsIn(DataRowStatus.SKIPPED),
      failed: rowsIn(DataRowStatus.FAILED),
    };
    let processed =
      counts.created + counts.updated + counts.skipped + counts.failed;

    await this.prisma.dataJob.update({
      where: { id: job.id },
      data: {
        status: DataJobStatus.PROCESSING,
        startedAt: job.startedAt ?? new Date(),
        processedRows: processed,
        createdRows: counts.created,
        updatedRows: counts.updated,
        skippedRows: counts.skipped,
        failedRows: invalidAtAnalysis + counts.failed,
        progressPercent:
          job.totalRows > 0
            ? Math.min(100, Math.round((processed / job.totalRows) * 100))
            : 0,
      },
    });

    let cancelled = false;

    for (;;) {
      const rows = await this.prisma.dataJobRow.findMany({
        where: { jobId: job.id, status: DataRowStatus.VALID },
        orderBy: { rowNumber: 'asc' },
        take: CHUNK_SIZE,
      });

      if (rows.length === 0) break;

      await options.lease?.ensureHeld();

      // Cancellation is honoured between chunks so a long import can be
      // stopped without leaving a row half written.
      const current = await this.prisma.dataJob.findUnique({
        where: { id: job.id },
        select: { cancelledAt: true },
      });

      if (current?.cancelledAt) {
        cancelled = true;
        break;
      }

      // Checkpoint BEFORE applying anything. Rows are applied strictly in
      // rowNumber order, one at a time, and each leaves IN_PROGRESS as soon as it
      // is applied — so after a crash the lowest IN_PROGRESS row is the only one
      // whose outcome is unknown (see DataJobRecoveryService).
      const marked = await this.prisma.dataJobRow.updateMany({
        where: {
          id: { in: rows.map((row) => row.id) },
          status: DataRowStatus.VALID,
        },
        data: { status: DataRowStatus.IN_PROGRESS },
      });
      if (marked.count !== rows.length) {
        throw new Error(
          'Import rows changed while this job was running; stopping to avoid applying a row twice.',
        );
      }

      for (const row of rows) {
        await options.lease?.ensureHeld();
        const source = (row.sourceJson ?? {}) as Record<string, string>;
        const values = this.applyMapping(source, mappings);

        try {
          const existingId = await executor.findExisting(currentUser, values);
          const outcome = await this.applyRow(
            executor,
            currentUser,
            mode,
            values,
            existingId,
          );

          counts[outcome.counter] += 1;
          await this.settleRow(job.id, {
            where: { id: row.id, status: DataRowStatus.IN_PROGRESS },
            data: {
              status: outcome.status,
              recordId: outcome.recordId,
              mappedJson: values as unknown as Prisma.InputJsonValue,
              issuesJson: outcome.note
                ? ([
                    {
                      field: null,
                      value: null,
                      message: outcome.note,
                      severity: 'WARNING',
                    } satisfies RowIssue,
                  ] as unknown as Prisma.InputJsonValue)
                : undefined,
            },
          });
        } catch (error) {
          // Losing ownership is not a row failure: stop, write nothing more.
          if (error instanceof DataJobLeaseLostError) throw error;
          counts.failed += 1;
          await this.settleRow(job.id, {
            where: { id: row.id, status: DataRowStatus.IN_PROGRESS },
            data: {
              status: DataRowStatus.FAILED,
              mappedJson: values as unknown as Prisma.InputJsonValue,
              issuesJson: [
                {
                  field: null,
                  value: null,
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Row could not be imported.',
                  severity: 'ERROR',
                } satisfies RowIssue,
              ] as unknown as Prisma.InputJsonValue,
            },
          });
        }

        processed += 1;
      }

      await options.lease?.ensureHeld();
      await this.prisma.dataJob.update({
        where: { id: job.id },
        data: {
          processedRows: processed,
          createdRows: counts.created,
          updatedRows: counts.updated,
          skippedRows: counts.skipped,
          failedRows: invalidAtAnalysis + counts.failed,
          progressPercent:
            job.totalRows > 0
              ? Math.min(100, Math.round((processed / job.totalRows) * 100))
              : 100,
        },
      });
    }

    const status = cancelled
      ? DataJobStatus.CANCELLED
      : counts.failed > 0
        ? DataJobStatus.PARTIALLY_COMPLETED
        : DataJobStatus.COMPLETED;

    // A worker paused past its lease must not stamp a final status (or write
    // the audit entry below) over the job another worker now owns.
    await options.lease?.ensureHeld();
    await this.prisma.dataJob.update({
      where: { id: job.id },
      data: { status, completedAt: new Date() },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'DATA_IMPORT_EXECUTED',
      entityType: 'DataJob',
      entityId: job.id,
      beforeSnapshot: null,
      afterSnapshot: {
        moduleKey: job.moduleKey,
        importMode: mode,
        status,
        ...counts,
      },
      sourceModule: 'data-management',
    });

    this.logger.log(
      `Import ${job.id} (${job.moduleKey}) finished as ${status}: ` +
        `${counts.created} created, ${counts.updated} updated, ` +
        `${counts.skipped} skipped, ${counts.failed} failed`,
    );

    return this.getExecutionSummary(currentUser, job.id);
  }

  /**
   * Writes a row's outcome only while the row is still IN_PROGRESS. If recovery
   * has parked it (or reset it) in the meantime, this run no longer owns the row
   * and must stop rather than overwrite what recovery decided.
   */
  private async settleRow(
    jobId: string,
    args: Prisma.DataJobRowUpdateManyArgs,
  ) {
    const result = await this.prisma.dataJobRow.updateMany(args);
    if (result.count !== 1) throw new DataJobLeaseLostError(jobId);
  }

  private async applyRow(
    executor: ModuleExecutor,
    user: AuthenticatedUser,
    mode: DataImportMode,
    values: Record<string, string>,
    existingId: string | null,
  ): Promise<{
    status: DataRowStatus;
    counter: 'created' | 'updated' | 'skipped';
    recordId: string | null;
    note?: string;
  }> {
    if (existingId && mode === DataImportMode.CREATE_ONLY) {
      return {
        status: DataRowStatus.SKIPPED,
        counter: 'skipped',
        recordId: existingId,
        note: 'A matching record already exists and this import only creates.',
      };
    }

    if (!existingId && mode === DataImportMode.UPDATE_ONLY) {
      return {
        status: DataRowStatus.SKIPPED,
        counter: 'skipped',
        recordId: null,
        note: 'No matching record was found and this import only updates.',
      };
    }

    if (existingId) {
      await executor.update(user, existingId, values);
      return {
        status: DataRowStatus.UPDATED,
        counter: 'updated',
        recordId: existingId,
      };
    }

    const created = await executor.create(user, values);
    return {
      status: DataRowStatus.CREATED,
      counter: 'created',
      recordId: created,
    };
  }

  /** Turns source-column values into field-keyed values using the saved mapping. */
  private applyMapping(
    source: Record<string, string>,
    mappings: readonly ColumnMapping[],
  ) {
    const values: Record<string, string> = {};

    for (const mapping of mappings) {
      if (!mapping.fieldKey) continue;

      const raw = source[mapping.sourceColumn];
      if (raw !== undefined) values[mapping.fieldKey] = raw;
    }

    return values;
  }

  async getExecutionSummary(currentUser: AuthenticatedUser, jobId: string) {
    const job = await this.prisma.dataJob.findFirst({
      where: { id: jobId, tenantId: currentUser.tenantId },
      include: {
        rows: {
          where: {
            status: { in: [DataRowStatus.FAILED, DataRowStatus.INVALID] },
          },
          orderBy: { rowNumber: 'asc' },
          take: 200,
        },
      },
    });

    if (!job) {
      throw new BadRequestException(
        'Import job was not found for this tenant.',
      );
    }

    return {
      id: job.id,
      moduleKey: job.moduleKey,
      status: job.status,
      importMode: job.importMode,
      fileName: job.fileName,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      createdRows: job.createdRows,
      updatedRows: job.updatedRows,
      skippedRows: job.skippedRows,
      failedRows: job.failedRows,
      progressPercent: job.progressPercent,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      failedRowDetails: job.rows.map((row) => ({
        rowNumber: row.rowNumber,
        issues: (row.issuesJson ?? []) as unknown as RowIssue[],
      })),
    };
  }

  /**
   * A workbook of every row that did not import, with its original values and
   * the reason. The user fixes this file and uploads it again rather than
   * hunting for failures in the original.
   */
  async buildErrorWorkbook(currentUser: AuthenticatedUser, jobId: string) {
    const job = await this.prisma.dataJob.findFirst({
      where: { id: jobId, tenantId: currentUser.tenantId },
      include: {
        rows: {
          where: {
            status: { in: [DataRowStatus.FAILED, DataRowStatus.INVALID] },
          },
          orderBy: { rowNumber: 'asc' },
        },
      },
    });

    if (!job) {
      throw new BadRequestException(
        'Import job was not found for this tenant.',
      );
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Errors');

    // Every source column is preserved so the file can be corrected and
    // re-uploaded directly.
    const sourceColumns = Array.from(
      new Set(
        job.rows.flatMap((row) =>
          Object.keys((row.sourceJson ?? {}) as Record<string, string>),
        ),
      ),
    );

    sheet.addRow(['Row', 'Problem', ...sourceColumns]);
    sheet.getRow(1).font = { bold: true };

    for (const row of job.rows) {
      const source = (row.sourceJson ?? {}) as Record<string, string>;
      const issues = (row.issuesJson ?? []) as unknown as RowIssue[];
      const problem = issues
        .map((issue) =>
          issue.field ? `${issue.field}: ${issue.message}` : issue.message,
        )
        .join(' | ');

      sheet.addRow([
        row.rowNumber,
        problem,
        ...sourceColumns.map((column) => source[column] ?? ''),
      ]);
    }

    sheet.columns.forEach((column) => {
      column.width = 24;
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const safeName = (job.fileName ?? 'import')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-');

    return {
      buffer,
      filename: `${safeName}-errors.xlsx`,
      rowCount: job.rows.length,
    };
  }

  async cancelJob(currentUser: AuthenticatedUser, jobId: string) {
    const job = await this.prisma.dataJob.findFirst({
      where: { id: jobId, tenantId: currentUser.tenantId },
      select: { id: true, status: true },
    });

    if (!job) {
      throw new BadRequestException(
        'Import job was not found for this tenant.',
      );
    }

    const settled: DataJobStatus[] = [
      DataJobStatus.COMPLETED,
      DataJobStatus.PARTIALLY_COMPLETED,
      DataJobStatus.CANCELLED,
      DataJobStatus.FAILED,
    ];

    if (settled.includes(job.status)) {
      throw new BadRequestException(
        `An import in state ${job.status} can no longer be cancelled.`,
      );
    }

    await this.prisma.dataJob.update({
      where: { id: job.id },
      data: { cancelledAt: new Date() },
    });

    return this.getExecutionSummary(currentUser, jobId);
  }

  /** Import history for the tenant, newest first. */
  async listJobs(currentUser: AuthenticatedUser, moduleKey?: string) {
    const jobs = await this.prisma.dataJob.findMany({
      where: {
        tenantId: currentUser.tenantId,
        ...(moduleKey ? { moduleKey } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        submittedByUser: { select: { firstName: true, lastName: true } },
      },
    });

    return jobs.map((job) => ({
      id: job.id,
      moduleKey: job.moduleKey,
      kind: job.kind,
      status: job.status,
      importMode: job.importMode,
      fileName: job.fileName,
      totalRows: job.totalRows,
      createdRows: job.createdRows,
      updatedRows: job.updatedRows,
      skippedRows: job.skippedRows,
      failedRows: job.failedRows,
      progressPercent: job.progressPercent,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      submittedBy: job.submittedByUser
        ? `${job.submittedByUser.firstName} ${job.submittedByUser.lastName}`.trim()
        : null,
    }));
  }
}
