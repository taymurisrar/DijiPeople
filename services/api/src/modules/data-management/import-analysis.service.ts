import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataImportMode, DataRowStatus, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AttendanceService } from '../attendance/attendance.service';
import { EmployeesService } from '../employees/employees.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  DataModuleRegistryService,
  normalizeHeader,
} from './module-registry.service';
import {
  DataModuleDescriptor,
  ImportFieldDescriptor,
} from './module-adapter.types';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type ColumnMapping = {
  sourceColumn: string;
  fieldKey: string | null;
  /** How the column was matched, shown in the mapping UI. */
  matchedBy: 'key' | 'label' | 'alias' | 'normalized' | 'manual' | 'unmatched';
};

export type RowIssue = {
  field: string | null;
  value: string | null;
  message: string;
  severity: 'ERROR' | 'WARNING';
  suggestion?: string;
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ROWS = 20_000;
const MAX_SHEETS = 25;

const ACCEPTED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'application/octet-stream',
]);

/** Row layout produced by the generated template. */
const LABEL_ROW = 1;
const KEY_ROW = 2;
const EXAMPLE_ROW = 3;
const EXAMPLE_MARKER = '#EXAMPLE';

@Injectable()
export class ImportAnalysisService {
  private readonly logger = new Logger(ImportAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly registry: DataModuleRegistryService,
    private readonly employeesService: EmployeesService,
    private readonly attendanceService: AttendanceService,
  ) {}

  /**
   * Module rules that only the owning module can answer, such as tenant
   * mandatory-field settings. Resolved once per run, then applied per row so a
   * dry run predicts exactly what execution will accept.
   */
  private async buildModuleRowValidator(
    moduleKey: string,
    tenantId: string,
    currentUser: AuthenticatedUser,
  ): Promise<
    | ((values: Record<string, string>) => RowIssue[] | Promise<RowIssue[]>)
    | null
  > {
    if (moduleKey === 'employees') {
      const settings =
        await this.employeesService.getEmployeeSettingsForTenant(tenantId);

      return (values) =>
        this.employeesService
          .collectCreateSettingsIssues(values, settings)
          .map((issue) => ({
            field: issue.field,
            value: values[issue.field] ?? null,
            message: issue.message,
            severity: 'ERROR' as const,
          }));
    }

    if (moduleKey === 'attendance') {
      // Resolving a work schedule costs a query, so each employee and date is
      // asked once. Beyond the cap the check is skipped rather than issuing
      // thousands of lookups; execution still reports those rows per row.
      const scheduleCache = new Map<
        string,
        Array<{ field: string | null; message: string }>
      >();
      const MAX_SCHEDULE_LOOKUPS = 2_000;

      return async (values) => {
        const issues: RowIssue[] = [];
        const mode = values.attendanceMode?.trim().toUpperCase();

        if (!mode) {
          issues.push({
            field: 'attendanceMode',
            value: null,
            message: 'Attendance mode is required.',
            severity: 'ERROR',
            suggestion: 'Use OFFICE, REMOTE or HYBRID.',
          });
          return issues;
        }

        // Manual entry rejects an office day with no work site, so the file is
        // checked for it rather than failing halfway through the run.
        if (mode === 'OFFICE' && !values.officeLocationId?.trim()) {
          issues.push({
            field: 'officeLocationId',
            value: null,
            message: 'Office location is required for office attendance.',
            severity: 'ERROR',
            suggestion:
              'Use an id from the Office Location reference sheet, or choose REMOTE.',
          });
        }

        const employeeId = values.employeeId?.trim();
        const date = values.date?.trim();

        if (employeeId && date) {
          const cacheKey = `${employeeId}|${date}`;
          let blockers = scheduleCache.get(cacheKey);

          if (!blockers && scheduleCache.size < MAX_SCHEDULE_LOOKUPS) {
            blockers = await this.attendanceService.describeManualEntryBlockers(
              currentUser,
              employeeId,
              date,
            );
            scheduleCache.set(cacheKey, blockers);
          }

          for (const blocker of blockers ?? []) {
            issues.push({
              field: blocker.field,
              value: blocker.field ? (values[blocker.field] ?? null) : null,
              message: blocker.message,
              severity: 'ERROR',
            });
          }
        }

        return issues;
      };
    }

    return null;
  }

  /**
   * Uploads a workbook, maps its columns and validates every row without
   * writing a single record.
   *
   * Nothing here touches module data: the job is recorded as VALIDATE_ONLY so a
   * user can prove a file is clean before anyone runs it for real.
   */
  async analyseUpload(
    currentUser: AuthenticatedUser,
    moduleKey: string,
    file: UploadedFile | undefined,
    options: { sheetName?: string; importMode?: DataImportMode } = {},
  ) {
    const module = this.registry.getModule(moduleKey);

    if (!module.supportsImport) {
      throw new BadRequestException(
        `${module.label} does not support import yet.`,
      );
    }

    const validated = this.assertUpload(file);
    const workbook = await this.readWorkbook(validated);
    const sheet = this.selectSheet(workbook, options.sheetName);
    const { headers, rows } = this.readSheet(sheet);

    if (headers.length === 0) {
      throw new BadRequestException(
        'The selected sheet has no header row. Use the downloaded template as a starting point.',
      );
    }

    const mappings = this.autoMap(headers, module);
    const moduleValidator = await this.buildModuleRowValidator(
      moduleKey,
      currentUser.tenantId,
      currentUser,
    );

    const issuesByRow: RowIssue[][] = [];

    for (const row of rows) {
      const issues = this.validateRow(row, mappings, module);

      if (moduleValidator) {
        const mapped = this.mapRowToFields(row.values, mappings);
        // Only add rules the field-level pass has not already reported.
        for (const issue of await moduleValidator(mapped)) {
          if (!issues.some((existing) => existing.field === issue.field)) {
            issues.push(issue);
          }
        }
      }

      issuesByRow.push(issues);
    }

    // Idempotency: the same file, module and sheet resolve to one job so a
    // double submit cannot create duplicate work.
    const idempotencyKey = createHash('sha256')
      .update(validated.buffer)
      .update(moduleKey)
      .update(sheet.name)
      .digest('hex');

    const stored = await this.storage.saveFile({
      buffer: validated.buffer,
      originalFileName: validated.originalname,
      subdirectory: `data-imports/${currentUser.tenantId}`,
    });

    const validRows = issuesByRow.filter(
      (issues) => !issues.some((issue) => issue.severity === 'ERROR'),
    ).length;

    const job = await this.prisma.dataJob.upsert({
      where: {
        tenantId_kind_idempotencyKey: {
          tenantId: currentUser.tenantId,
          kind: 'IMPORT',
          idempotencyKey,
        },
      },
      create: {
        tenantId: currentUser.tenantId,
        kind: 'IMPORT',
        moduleKey,
        status: validRows === rows.length ? 'READY' : 'VALIDATION_FAILED',
        importMode: options.importMode ?? DataImportMode.VALIDATE_ONLY,
        idempotencyKey,
        name: `${module.label} import — ${validated.originalname}`,
        fileName: validated.originalname,
        sourceFileKey: stored.storageKey,
        sheetName: sheet.name,
        mappingJson: mappings as unknown as Prisma.InputJsonValue,
        totalRows: rows.length,
        validRows,
        failedRows: rows.length - validRows,
        submittedByUserId: currentUser.userId,
      },
      update: {
        status: validRows === rows.length ? 'READY' : 'VALIDATION_FAILED',
        sheetName: sheet.name,
        mappingJson: mappings as unknown as Prisma.InputJsonValue,
        totalRows: rows.length,
        validRows,
        failedRows: rows.length - validRows,
      },
      select: { id: true },
    });

    // Replace previous analysis so a re-upload of the same file is not additive.
    await this.prisma.dataJobRow.deleteMany({ where: { jobId: job.id } });
    await this.prisma.dataJobRow.createMany({
      data: rows.map((row, index) => {
        const issues = issuesByRow[index];
        const hasError = issues.some((issue) => issue.severity === 'ERROR');

        return {
          tenantId: currentUser.tenantId,
          jobId: job.id,
          rowNumber: row.rowNumber,
          status: hasError ? DataRowStatus.INVALID : DataRowStatus.VALID,
          sourceJson: row.values as unknown as Prisma.InputJsonValue,
          issuesJson: issues as unknown as Prisma.InputJsonValue,
        };
      }),
    });

    return this.getJob(currentUser, job.id);
  }

  async getJob(currentUser: AuthenticatedUser, jobId: string) {
    const job = await this.prisma.dataJob.findFirst({
      where: { id: jobId, tenantId: currentUser.tenantId },
      include: {
        rows: {
          where: { status: DataRowStatus.INVALID },
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

    const module = this.registry.getModule(job.moduleKey);
    const mappings = (job.mappingJson ?? []) as unknown as ColumnMapping[];
    const mappedKeys = new Set(
      mappings.map((mapping) => mapping.fieldKey).filter(Boolean),
    );

    return {
      id: job.id,
      moduleKey: job.moduleKey,
      status: job.status,
      importMode: job.importMode,
      fileName: job.fileName,
      sheetName: job.sheetName,
      totalRows: job.totalRows,
      validRows: job.validRows,
      failedRows: job.failedRows,
      mappings,
      unmappedRequiredFields: module.importFields
        .filter((field) => field.required && !mappedKeys.has(field.key))
        .map((field) => ({ key: field.key, label: field.label })),
      unknownColumns: mappings
        .filter((mapping) => !mapping.fieldKey)
        .map((mapping) => mapping.sourceColumn),
      invalidRows: job.rows.map((row) => ({
        rowNumber: row.rowNumber,
        issues: (row.issuesJson ?? []) as unknown as RowIssue[],
      })),
    };
  }

  private assertUpload(file: UploadedFile | undefined) {
    if (!file) {
      throw new BadRequestException('A file is required to start an import.');
    }

    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException(
        `File exceeds the ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB limit.`,
      );
    }

    const name = file.originalname.toLowerCase();
    const hasAcceptedExtension =
      name.endsWith('.xlsx') || name.endsWith('.csv');

    if (!hasAcceptedExtension || !ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Only .xlsx and .csv files are supported for import.',
      );
    }

    return file;
  }

  private async readWorkbook(file: UploadedFile) {
    const workbook = new ExcelJS.Workbook();

    try {
      if (file.originalname.toLowerCase().endsWith('.csv')) {
        const sheet = workbook.addWorksheet('Data');
        for (const line of file.buffer.toString('utf8').split(/\r?\n/)) {
          if (line.trim()) sheet.addRow(splitCsvLine(line));
        }
      } else {
        await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
      }
    } catch {
      throw new BadRequestException(
        'The file could not be read. Confirm it is a valid .xlsx or .csv workbook.',
      );
    }

    if (workbook.worksheets.length === 0) {
      throw new BadRequestException('The workbook contains no sheets.');
    }

    if (workbook.worksheets.length > MAX_SHEETS) {
      throw new BadRequestException(
        `The workbook has more than ${MAX_SHEETS} sheets, which is not accepted.`,
      );
    }

    return workbook;
  }

  private selectSheet(workbook: ExcelJS.Workbook, sheetName?: string) {
    if (sheetName) {
      const requested = workbook.getWorksheet(sheetName);
      if (!requested) {
        throw new BadRequestException(
          `Sheet "${sheetName}" was not found in the workbook.`,
        );
      }
      return requested;
    }

    // Default to the template's Data sheet when present.
    return workbook.getWorksheet('Data') ?? workbook.worksheets[0];
  }

  /**
   * Reads headers and data rows, honouring the template layout.
   *
   * The hidden key row is preferred over the visible labels so renaming or
   * translating a header cannot break the file. The example row is skipped.
   */
  private readSheet(sheet: ExcelJS.Worksheet) {
    const labelRow = sheet.getRow(LABEL_ROW);
    const keyRow = sheet.getRow(KEY_ROW);

    const labels = readRowStrings(labelRow);
    const keys = readRowStrings(keyRow);
    const keyRowLooksLikeKeys =
      keys.length > 0 &&
      keys.filter(Boolean).length >= labels.filter(Boolean).length;

    const headers = keyRowLooksLikeKeys ? keys : labels;
    const firstDataRow = keyRowLooksLikeKeys ? EXAMPLE_ROW : KEY_ROW;

    const rows: Array<{ rowNumber: number; values: Record<string, string> }> =
      [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < firstDataRow) return;
      if (rows.length >= MAX_ROWS) return;

      const cells = readRowStrings(row);
      if (cells.every((cell) => !cell)) return;
      if (String(cells[0] ?? '').startsWith(EXAMPLE_MARKER)) return;

      const values: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) values[header] = cells[index] ?? '';
      });

      rows.push({ rowNumber, values });
    });

    return { headers: headers.filter(Boolean), rows };
  }

  /** Matches source columns to fields by key, label, alias, then normalised form. */
  private autoMap(
    headers: string[],
    module: DataModuleDescriptor,
  ): ColumnMapping[] {
    const byKey = new Map(module.importFields.map((f) => [f.key, f]));
    const byLabel = new Map(
      module.importFields.map((f) => [f.label.toLowerCase(), f]),
    );
    const byNormalized = new Map<string, ImportFieldDescriptor>();

    for (const field of module.importFields) {
      for (const alias of field.aliases ?? []) {
        byNormalized.set(normalizeHeader(alias), field);
      }
    }

    const used = new Set<string>();

    return headers.map((header) => {
      const cleaned = header.replace(/\*$/, '').trim();

      const candidates: Array<
        [ColumnMapping['matchedBy'], ImportFieldDescriptor | undefined]
      > = [
        ['key', byKey.get(cleaned)],
        ['label', byLabel.get(cleaned.toLowerCase())],
        ['normalized', byNormalized.get(normalizeHeader(cleaned))],
      ];

      for (const [matchedBy, field] of candidates) {
        // A field already claimed by an earlier column is not reused, so
        // duplicate source columns surface instead of silently overwriting.
        if (field && !used.has(field.key)) {
          used.add(field.key);
          return { sourceColumn: header, fieldKey: field.key, matchedBy };
        }
      }

      return { sourceColumn: header, fieldKey: null, matchedBy: 'unmatched' };
    });
  }

  /** Source-column values keyed by field, using the resolved mapping. */
  private mapRowToFields(
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

  private validateRow(
    row: { rowNumber: number; values: Record<string, string> },
    mappings: ColumnMapping[],
    module: DataModuleDescriptor,
  ): RowIssue[] {
    const issues: RowIssue[] = [];
    const fieldByKey = new Map(module.importFields.map((f) => [f.key, f]));
    const seen = new Map<string, string>();

    for (const mapping of mappings) {
      if (!mapping.fieldKey) continue;

      const field = fieldByKey.get(mapping.fieldKey);
      if (!field) continue;

      const raw = (row.values[mapping.sourceColumn] ?? '').trim();
      seen.set(field.key, raw);

      if (!raw) continue;

      const issue = this.validateValue(field, raw);
      if (issue) issues.push(issue);
    }

    for (const field of module.importFields) {
      if (!field.required) continue;

      if (!seen.get(field.key)) {
        issues.push({
          field: field.key,
          value: null,
          message: `${field.label} is required.`,
          severity: 'ERROR',
          suggestion: field.expectedFormat
            ? `Expected ${field.expectedFormat}.`
            : undefined,
        });
      }
    }

    return issues;
  }

  private validateValue(
    field: ImportFieldDescriptor,
    raw: string,
  ): RowIssue | null {
    const fail = (message: string, suggestion?: string): RowIssue => ({
      field: field.key,
      value: raw,
      message,
      severity: 'ERROR',
      suggestion,
    });

    switch (field.type) {
      case 'number':
        return Number.isFinite(Number(raw))
          ? null
          : fail(`${field.label} must be a number.`);

      case 'boolean':
        return /^(true|false|yes|no|1|0)$/i.test(raw)
          ? null
          : fail(`${field.label} must be TRUE or FALSE.`);

      case 'date':
      case 'dateTime':
        return Number.isNaN(new Date(raw).getTime())
          ? fail(
              `${field.label} is not a valid date.`,
              `Use ${field.expectedFormat ?? 'YYYY-MM-DD'}.`,
            )
          : null;

      case 'enum':
        return (field.allowedValues ?? []).some(
          (allowed) => allowed.toLowerCase() === raw.toLowerCase(),
        )
          ? null
          : fail(
              `${field.label} must be one of the allowed values.`,
              `Allowed: ${(field.allowedValues ?? []).join(', ')}.`,
            );

      default:
        if (
          /email/i.test(field.key) &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
        ) {
          return fail(`${field.label} is not a valid email address.`);
        }
        return null;
    }
  }
}

function readRowStrings(row: ExcelJS.Row): string[] {
  const values = Array.isArray(row.values) ? row.values.slice(1) : [];

  return values.map((value) => cellToString(value).trim());
}

/**
 * Flattens an ExcelJS cell into text.
 *
 * Cells are not always primitives: rich text, hyperlinks and formulas arrive as
 * objects, and a bare String() on those yields "[object Object]", which would
 * silently import garbage.
 */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === 'object') {
    const candidate = value as {
      text?: unknown;
      result?: unknown;
      hyperlink?: unknown;
      richText?: Array<{ text?: unknown }>;
    };

    if (Array.isArray(candidate.richText)) {
      return candidate.richText.map((part) => cellToString(part.text)).join('');
    }
    if (candidate.text !== undefined) return cellToString(candidate.text);
    // A formula cell contributes its computed result, never the expression.
    if (candidate.result !== undefined) return cellToString(candidate.result);
    if (candidate.hyperlink !== undefined) {
      return cellToString(candidate.hyperlink);
    }
    return '';
  }

  return '';
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}
