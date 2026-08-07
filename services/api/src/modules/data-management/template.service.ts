import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataModuleRegistryService } from './module-registry.service';
import {
  DataModuleDescriptor,
  ImportFieldDescriptor,
} from './module-adapter.types';

/**
 * Row 2 of the Data sheet carries the stable logical key for each column and is
 * hidden. Display labels can be renamed or translated without breaking imports,
 * because the parser reads this row first and only falls back to matching the
 * visible labels when it has been removed.
 */
const KEY_ROW_NUMBER = 2;
const EXAMPLE_ROW_NUMBER = 3;

/** Marker in column A of the example row so the importer can skip it. */
const EXAMPLE_ROW_MARKER = '#EXAMPLE — delete this row before importing';

/** Reference sheets are capped so a large tenant cannot produce a huge file. */
const MAX_REFERENCE_ROWS = 500;

/**
 * Lookup models whose values can be listed on a Reference Data sheet. Each
 * entry names the Prisma delegate and the columns that identify a record, so
 * users can see exactly what to type into a lookup column.
 */
const REFERENCE_SOURCES: Record<
  string,
  { delegate: string; columns: string[] }
> = {
  Organization: { delegate: 'organization', columns: ['id', 'code', 'name'] },
  BusinessUnit: { delegate: 'businessUnit', columns: ['id', 'code', 'name'] },
  Department: { delegate: 'department', columns: ['id', 'code', 'name'] },
  Designation: { delegate: 'designation', columns: ['id', 'code', 'name'] },
  EmployeeLevel: { delegate: 'employeeLevel', columns: ['id', 'code', 'name'] },
  Location: { delegate: 'location', columns: ['id', 'code', 'name'] },
  Team: { delegate: 'team', columns: ['id', 'name'] },
  WorkSchedule: { delegate: 'workSchedule', columns: ['id', 'name'] },
  ShiftTemplate: { delegate: 'shiftTemplate', columns: ['id', 'name'] },
  HolidayCalendar: { delegate: 'holidayCalendar', columns: ['id', 'name'] },
  LeaveType: { delegate: 'leaveType', columns: ['id', 'code', 'name'] },
  RelationType: { delegate: 'relationType', columns: ['id', 'name'] },
  EmploymentType: { delegate: 'employmentType', columns: ['id', 'name'] },
};

@Injectable()
export class DataTemplateService {
  private readonly logger = new Logger(DataTemplateService.name);

  constructor(
    private readonly registry: DataModuleRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  async buildImportTemplate(tenantId: string, moduleKey: string) {
    const module = this.registry.getModule(moduleKey);
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'DijiPeople';
    workbook.created = new Date();

    this.addDataSheet(workbook, module);
    this.addInstructionsSheet(workbook, module);
    await this.addReferenceSheets(workbook, tenantId, module);

    const buffer = await workbook.xlsx.writeBuffer();

    return {
      filename: `${module.moduleKey}-import-template.xlsx`,
      buffer: Buffer.from(buffer),
    };
  }

  private addDataSheet(
    workbook: ExcelJS.Workbook,
    module: DataModuleDescriptor,
  ) {
    const sheet = workbook.addWorksheet('Data');
    const fields = module.importFields;

    // Row 1 labels, row 2 machine keys (hidden), row 3 example, data from row 4.
    const labelRow = sheet.addRow(
      fields.map((field) =>
        field.required ? `${field.label} *` : field.label,
      ),
    );
    labelRow.font = { bold: true };
    labelRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };

    const keyRow = sheet.getRow(KEY_ROW_NUMBER);
    keyRow.values = fields.map((field) => field.key);
    keyRow.hidden = true;
    keyRow.font = { size: 8, color: { argb: 'FF808080' } };
    keyRow.commit();

    const exampleRow = sheet.getRow(EXAMPLE_ROW_NUMBER);
    exampleRow.values = fields.map((field, index) =>
      index === 0
        ? EXAMPLE_ROW_MARKER
        : (field.exampleValue ?? this.placeholderFor(field)),
    );
    exampleRow.font = { italic: true, color: { argb: 'FF9CA3AF' } };
    exampleRow.commit();

    fields.forEach((field, index) => {
      const column = sheet.getColumn(index + 1);
      column.width = Math.min(Math.max(field.label.length + 4, 14), 40);
    });

    sheet.views = [{ state: 'frozen', ySplit: EXAMPLE_ROW_NUMBER }];
  }

  private addInstructionsSheet(
    workbook: ExcelJS.Workbook,
    module: DataModuleDescriptor,
  ) {
    const sheet = workbook.addWorksheet('Instructions');

    sheet.addRow([`${module.label} — column reference`]).font = {
      bold: true,
      size: 12,
    };
    sheet.addRow([
      'The example row is ignored on import. Delete it or leave it in place.',
    ]);
    sheet.addRow([]);

    const header = sheet.addRow([
      'Display name',
      'Column key',
      'Required',
      'Data type',
      'Expected format',
      'Maximum length',
      'Allowed values',
      'Lookup matching',
      'Example',
      'Validation notes',
    ]);
    header.font = { bold: true };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };

    for (const field of module.importFields) {
      sheet.addRow([
        field.label,
        field.key,
        field.required ? 'Required' : 'Optional',
        field.type,
        field.expectedFormat ?? '',
        field.maxLength ?? '',
        (field.allowedValues ?? []).join(', '),
        field.lookupModel
          ? `Matched against ${field.lookupModel} by ${(field.lookupMatchKeys ?? []).join(', ')}`
          : '',
        field.exampleValue ?? '',
        field.validationNotes ?? '',
      ]);
    }

    if (module.excludedFields.length > 0) {
      sheet.addRow([]);
      sheet.addRow(['Fields that cannot be imported']).font = { bold: true };
      sheet.addRow(['Column key', 'Reason']).font = { bold: true };

      for (const excluded of module.excludedFields) {
        sheet.addRow([excluded.key, excluded.reason]);
      }
    }

    sheet.columns.forEach((column, index) => {
      column.width = index === 0 || index === 1 ? 30 : 26;
    });
  }

  /**
   * One sheet per lookup model referenced by the module, listing the tenant's
   * actual values. Without this a user has to guess what a lookup column will
   * accept, which is the most common cause of failed rows.
   */
  private async addReferenceSheets(
    workbook: ExcelJS.Workbook,
    tenantId: string,
    module: DataModuleDescriptor,
  ) {
    const models = [
      ...new Set(
        module.importFields
          .map((field) => field.lookupModel)
          .filter((model): model is string => Boolean(model)),
      ),
    ];

    for (const model of models) {
      const source = REFERENCE_SOURCES[model];
      if (!source) continue;

      const rows = await this.readReferenceRows(tenantId, source);
      if (!rows) continue;

      const sheet = workbook.addWorksheet(this.sheetName(`Ref ${model}`));
      const header = sheet.addRow(source.columns);
      header.font = { bold: true };
      header.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };

      for (const row of rows) {
        sheet.addRow(source.columns.map((column) => row[column] ?? ''));
      }

      if (rows.length === MAX_REFERENCE_ROWS) {
        sheet.addRow([]);
        sheet.addRow([
          `Showing the first ${MAX_REFERENCE_ROWS} records. Use the ${model} screen for the full list.`,
        ]);
      }

      sheet.columns.forEach((column) => {
        column.width = 38;
      });
    }
  }

  private async readReferenceRows(
    tenantId: string,
    source: { delegate: string; columns: string[] },
  ): Promise<Array<Record<string, unknown>> | null> {
    const delegate = (
      this.prisma as unknown as Record<
        string,
        {
          findMany?: (args: unknown) => Promise<Array<Record<string, unknown>>>;
        }
      >
    )[source.delegate];

    if (!delegate?.findMany) {
      this.logger.warn(
        `Reference data skipped: no Prisma delegate named "${source.delegate}".`,
      );
      return null;
    }

    const select = Object.fromEntries(
      source.columns.map((column) => [column, true]),
    );

    /*
     * Lookups come in two shapes: tenant-owned (tenantId is required) and
     * global catalogues such as RelationType (tenantId is nullable). Matching
     * `tenantId: null` against a non-nullable column is a Prisma error, so the
     * broader query is attempted first and narrowed on failure rather than
     * assuming either shape.
     */
    const attempts: Array<Record<string, unknown>> = [
      { OR: [{ tenantId }, { tenantId: null }] },
      { tenantId },
    ];

    for (const where of attempts) {
      try {
        return await delegate.findMany({
          where,
          select,
          take: MAX_REFERENCE_ROWS,
        });
      } catch {
        continue;
      }
    }

    this.logger.warn(
      `Reference data skipped for "${source.delegate}": no compatible tenant filter.`,
    );
    return null;
  }

  private placeholderFor(field: ImportFieldDescriptor) {
    if (field.lookupModel) return `<${field.lookupModel} id, code, or name>`;
    if (field.allowedValues?.length) return field.allowedValues[0];
    return '';
  }

  /** Excel limits sheet names to 31 characters and forbids several symbols. */
  private sheetName(value: string) {
    return value.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
  }
}
