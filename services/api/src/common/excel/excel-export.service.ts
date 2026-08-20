import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

export type ExcelCellValue = string | number | boolean | Date | null;

export type ExcelSheetDefinition = {
  name: string;
  rows: Record<string, ExcelCellValue>[];
  columns?: ReadonlyArray<{ key: string; header: string; width?: number }>;
  hidden?: boolean;
};

export type ExcelWorkbookDefinition = {
  sheets: ExcelSheetDefinition[];
};

export type ExcelParsedRow = {
  rowNumber: number;
  values: Record<string, string>;
};

@Injectable()
export class ExcelExportService {
  buildWorkbookBuffer(definition: ExcelWorkbookDefinition): Buffer {
    const workbook = XLSX.utils.book_new();

    for (const sheet of definition.sheets) {
      const headers = sheet.columns?.map((column) => column.key);
      const worksheet = XLSX.utils.json_to_sheet(sheet.rows, {
        header: headers,
        skipHeader: false,
      });

      if (sheet.columns?.length) {
        for (const [index, column] of sheet.columns.entries()) {
          const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
          if (worksheet[cellAddress]) {
            worksheet[cellAddress].v = column.header;
          }
        }

        worksheet['!cols'] = sheet.columns.map((column) => ({
          wch: column.width ?? Math.max(column.header.length + 2, 14),
        }));
        worksheet['!autofilter'] = {
          ref: XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: {
              r: Math.max(sheet.rows.length, 1),
              c: sheet.columns.length - 1,
            },
          }),
        };
      }

      worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);

      if (sheet.hidden) {
        const workbookSheet = workbook.Workbook?.Sheets?.find(
          (item) => item.name === sheet.name,
        );
        if (workbookSheet) {
          workbookSheet.Hidden = 1;
        }
      }
    }

    return XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer',
    }) as Buffer;
  }

  /**
   * Read an uploaded workbook.
   *
   * **Parsed with ExcelJS, not SheetJS, and that is a security decision.**
   * `xlsx` carries two unfixed high-severity advisories — prototype pollution
   * (GHSA-4r6h-8v6p-xvw6) and a ReDoS (GHSA-5pgg-2g8v-p4x9) — and both are
   * about *parsing*. npm reports no fix because the registry copy of `xlsx` is
   * abandoned; SheetJS publishes elsewhere now.
   *
   * This method is reachable from two authenticated upload endpoints — payroll
   * import and timesheet import — so "no fix available" would have meant
   * shipping a reachable high into production on a path that accepts a file
   * from a tenant user. ExcelJS was already a dependency, and
   * `import-analysis.service.ts` already used it for exactly this job, so the
   * untrusted-input path now goes through the library that is maintained.
   *
   * Writing still uses SheetJS below. That direction consumes only data this
   * application produced, and neither advisory applies to it.
   */
  async parseFirstWorksheet(buffer: Buffer): Promise<ExcelParsedRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return [];
    }

    /*
     * ExcelJS rows and columns are 1-indexed, and row 1 is the header — which
     * is what SheetJS's `header: 1` produced. Cells are stringified the same
     * way below, so callers see no change in shape.
     */
    const matrix: Array<Array<string | number | boolean | Date>> = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: Array<string | number | boolean | Date> = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = cellToPrimitive(cell.value);
      });
      matrix.push(cells);
    });

    const [rawHeaders, ...rows] = matrix;
    const headers = (rawHeaders ?? []).map((header) => String(header).trim());

    return rows
      .map((row, index) => {
        const values: Record<string, string> = {};
        headers.forEach((header, headerIndex) => {
          values[header] = String(row[headerIndex] ?? '').trim();
        });
        return {
          rowNumber: index + 2,
          values,
        };
      })
      .filter((row) =>
        Object.values(row.values).some((value) => value.trim().length > 0),
      );
  }
}

/**
 * One ExcelJS cell value, flattened to what the row mapper expects.
 *
 * ExcelJS returns rich objects where SheetJS returned primitives: a formula
 * cell is `{ formula, result }`, a hyperlink is `{ text, hyperlink }`, and rich
 * text is `{ richText: [...] }`. Passing those to `String()` yields
 * `[object Object]`, which would land in an imported payroll row and look like
 * a value somebody typed.
 */
function cellToPrimitive(
  value: ExcelJS.CellValue,
): string | number | boolean | Date {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) {
      const result = (value as { result?: unknown }).result;
      /*
       * A formula cell carries its last computed result. Taking the formula
       * string instead would import "=SUM(A1:A9)" as a payroll amount.
       */
      if (result instanceof Date) return result;
      if (
        typeof result === 'string' ||
        typeof result === 'number' ||
        typeof result === 'boolean'
      ) {
        return result;
      }
      return '';
    }
    return '';
  }
  return value as string | number | boolean;
}
