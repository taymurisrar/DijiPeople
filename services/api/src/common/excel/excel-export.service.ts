import { Injectable } from '@nestjs/common';
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
            e: { r: Math.max(sheet.rows.length, 1), c: sheet.columns.length - 1 },
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

  parseFirstWorksheet(buffer: Buffer): ExcelParsedRow[] {
    const workbook = XLSX.read(buffer, {
      cellDates: true,
      type: 'buffer',
    });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return [];
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date>>(
      worksheet,
      {
        blankrows: false,
        defval: '',
        header: 1,
        raw: false,
      },
    );
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
