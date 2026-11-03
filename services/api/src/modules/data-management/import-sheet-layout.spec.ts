import * as ExcelJS from 'exceljs';
import { ImportAnalysisService } from './import-analysis.service';

/*
 * DP-QA-035 - a plain CSV (one header row, then data) was read as if its first
 * data row were the template's hidden key row, so the headers became that
 * person's values, nothing mapped and "a valid file" imported zero rows.
 */
const KNOWN = new Set(['employeeCode', 'firstName', 'lastName', 'workEmail']);

function read(rows: string[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  rows.forEach((row) => sheet.addRow(row));
  const service = Object.create(ImportAnalysisService.prototype) as unknown as {
    readSheet: (
      sheet: ExcelJS.Worksheet,
      keys: ReadonlySet<string>,
    ) => {
      headers: string[];
      rows: Array<{ rowNumber: number; values: Record<string, string> }>;
    };
  };
  return service.readSheet(sheet, KNOWN);
}

describe('import sheet layout (DP-QA-035)', () => {
  it('reads a plain CSV: header row, then every data row', () => {
    const { headers, rows } = read([
      ['employeeCode', 'firstName', 'lastName', 'workEmail'],
      ['E1', 'Ann', 'Lee', 'ann@example.test'],
      ['E2', 'Bob', 'Ray', 'bob@example.test'],
    ]);

    expect(headers).toEqual([
      'employeeCode',
      'firstName',
      'lastName',
      'workEmail',
    ]);
    expect(rows.map((r) => r.values.firstName)).toEqual(['Ann', 'Bob']);
  });

  it('reads a single-data-row CSV, the shape that used to import nothing', () => {
    const { headers, rows } = read([
      ['employeeCode', 'firstName', 'lastName', 'workEmail'],
      ['E1', 'Ann', 'Lee', 'ann@example.test'],
    ]);

    expect(headers).toContain('firstName');
    expect(rows).toHaveLength(1);
    expect(rows[0].values.workEmail).toBe('ann@example.test');
  });

  it('still honours the downloaded template: labels, hidden keys, example, data', () => {
    const { headers, rows } = read([
      ['Employee Code', 'First Name', 'Last Name', 'Work Email'],
      ['employeeCode', 'firstName', 'lastName', 'workEmail'],
      ['#EXAMPLE - delete this row', 'x', 'y', 'z'],
      ['E1', 'Ann', 'Lee', 'ann@example.test'],
    ]);

    expect(headers).toEqual([
      'employeeCode',
      'firstName',
      'lastName',
      'workEmail',
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].values.firstName).toBe('Ann');
  });
});
