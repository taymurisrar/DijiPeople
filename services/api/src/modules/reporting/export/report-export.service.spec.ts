import { Prisma } from '@prisma/client';
import type { ExcelExportService } from '../../../common/excel/excel-export.service';
import { splitCsvLine } from '../../../common/utils/csv.util';
import type { ReportResult } from '../execution/report-execution.service';
import { CSV_BOM } from './csv-safety';
import {
  PDF_MAX_ROWS,
  ReportExportService,
  buildExportFileName,
  type ReportExportContext,
} from './report-export.service';

function excelDouble() {
  return {
    buildWorkbookBuffer: jest
      .fn<
        ReturnType<ExcelExportService['buildWorkbookBuffer']>,
        Parameters<ExcelExportService['buildWorkbookBuffer']>
      >()
      .mockReturnValue(Buffer.from('workbook-bytes')),
  };
}

function makeService(excel = excelDouble()) {
  return {
    service: new ReportExportService(excel as never),
    excel,
  };
}

/** Asia/Qatar is UTC+3 all year, so a zone bug shows as a whole-day shift. */
const CONTEXT: ReportExportContext = {
  tenantName: 'Acme Trading',
  timezone: 'Asia/Qatar',
  locale: 'en-US',
  currency: 'QAR',
};

function makeResult(overrides: Partial<ReportResult> = {}): ReportResult {
  return {
    targetKey: 'std:headcount',
    name: 'Headcount by Department',
    description: 'Active employees',
    sourceKey: 'workforce',
    columns: [
      { key: 'name', label: 'Employee', type: 'string', format: 'plain' },
      { key: 'hiredOn', label: 'Hired', type: 'date', format: 'date' },
      {
        key: 'clockedIn',
        label: 'Clocked in',
        type: 'datetime',
        format: 'datetime',
      },
      { key: 'salary', label: 'Salary', type: 'money', format: 'currency' },
      {
        key: 'worked',
        label: 'Worked',
        type: 'duration_minutes',
        format: 'duration',
      },
      { key: 'active', label: 'Active', type: 'boolean', format: 'plain' },
    ],
    rows: [],
    total: 0,
    page: 1,
    pageSize: 50,
    caveats: [],
    generatedAt: '2026-08-24T22:30:00.000Z',
    ...overrides,
  };
}

function row(values: Record<string, unknown>) {
  return {
    id: typeof values.id === 'string' ? values.id : 'row-1',
    href: null,
    values,
  };
}

function csvLines(buffer: Buffer): string[] {
  return buffer.toString('utf8').replace(CSV_BOM, '').split('\r\n');
}

/**
 * Parsed back with the repository's own CSV reader, so the assertions prove
 * the file round-trips rather than that it matches a hand-written string.
 */
function csvRecords(buffer: Buffer): string[][] {
  return csvLines(buffer)
    .filter((line) => line.length > 0)
    .map((line) => splitCsvLine(line));
}

describe('ReportExportService — CSV', () => {
  it('writes a UTF-8 BOM so Excel does not mangle non-ASCII data', async () => {
    const { service } = makeService();

    const file = await service.buildFile(makeResult(), 'CSV', CONTEXT);

    expect(file.buffer.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(file.contentType).toBe('text/csv; charset=utf-8');
    expect(file.extension).toBe('csv');
    expect(file.truncated).toBe(false);
  });

  it('uses the column labels, in order, as the header row', async () => {
    const { service } = makeService();

    const file = await service.buildFile(makeResult(), 'CSV', CONTEXT);

    expect(csvRecords(file.buffer)[0]).toEqual([
      'Employee',
      'Hired',
      'Clocked in',
      'Salary',
      'Worked',
      'Active',
    ]);
  });

  it('neutralises a formula a tenant user typed into an employee name', async () => {
    const { service } = makeService();
    const result = makeResult({
      rows: [row({ name: "=cmd|'/c calc'!A0", active: true })],
    });

    const file = await service.buildFile(result, 'CSV', CONTEXT);

    expect(csvRecords(file.buffer)[1][0]).toBe("'=cmd|'/c calc'!A0");
  });

  it('round-trips embedded quotes and newlines without breaking the row', async () => {
    const { service } = makeService();
    const result = makeResult({
      rows: [row({ name: 'Reason: "sick"\nfollow-up pending', active: false })],
    });

    const file = await service.buildFile(result, 'CSV', CONTEXT);
    const body = file.buffer.toString('utf8');

    expect(body).toContain('"Reason: ""sick""\nfollow-up pending"');
    // The record separator is CRLF, so the embedded LF cannot end the row.
    expect(csvLines(file.buffer)).toHaveLength(3);
  });

  it('renders a datetime in the tenant timezone, never as a raw ISO string', async () => {
    const { service } = makeService();
    const result = makeResult({
      rows: [row({ clockedIn: '2026-08-24T22:30:00.000Z' })],
    });

    const cell = csvRecords(
      (await service.buildFile(result, 'CSV', CONTEXT)).buffer,
    )[1][2];

    // 22:30 UTC is 01:30 the NEXT day in Asia/Qatar (UTC+3).
    expect(cell).toMatch(/^Aug 25, 2026, 1:30\s?AM$/);
    expect(cell).not.toContain('T22:30');
    expect(cell).not.toContain('Z');
  });

  it('renders a calendar date without shifting it into a timezone', async () => {
    const { service } = makeService();
    const result = makeResult({ rows: [row({ hiredOn: '2026-08-24' })] });

    const cell = csvRecords(
      (await service.buildFile(result, 'CSV', CONTEXT)).buffer,
    )[1][1];

    expect(cell).toBe('Aug 24, 2026');
  });

  it('honours the tenant dateFormat setting the way the screen does', async () => {
    const { service } = makeService();
    const result = makeResult({ rows: [row({ hiredOn: '2026-08-24' })] });

    const cell = csvRecords(
      (
        await service.buildFile(result, 'CSV', {
          ...CONTEXT,
          dateFormat: 'dd/MM/yyyy',
        })
      ).buffer,
    )[1][1];

    expect(cell).toBe('24/08/2026');
  });

  it('formats money, duration and boolean columns for a reader', async () => {
    const { service } = makeService();
    const result = makeResult({
      rows: [
        row({
          salary: new Prisma.Decimal('12500.5'),
          worked: 505,
          active: true,
        }),
      ],
    });

    const cells = csvRecords(
      (await service.buildFile(result, 'CSV', CONTEXT)).buffer,
    )[1];

    expect(cells[3]).toContain('QAR');
    expect(cells[3]).toContain('12,500.50');
    expect(cells[4]).toBe('8h 25m');
    expect(cells[5]).toBe('Yes');
  });

  it('leaves an empty cell empty rather than printing null', async () => {
    const { service } = makeService();
    const result = makeResult({ rows: [row({ name: null, active: null })] });

    const buffer = (await service.buildFile(result, 'CSV', CONTEXT)).buffer;

    // Every field is quoted, including the empty ones, so a reader never has
    // to guess whether an unquoted gap was an empty string or a lost value.
    expect(csvLines(buffer)[1]).toBe('"","","","","",""');
    expect(csvRecords(buffer)[1]).toEqual(['', '', '', '', '', '']);
  });
});

describe('ReportExportService — XLSX', () => {
  it('delegates to ExcelExportService instead of reimplementing a writer', async () => {
    const { service, excel } = makeService();
    const result = makeResult({ rows: [row({ name: 'Jane' })] });

    const file = await service.buildFile(result, 'XLSX', CONTEXT);

    expect(excel.buildWorkbookBuffer).toHaveBeenCalledTimes(1);
    expect(file.buffer).toEqual(Buffer.from('workbook-bytes'));
    expect(file.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('passes the column labels as sheet headers keyed by column key', async () => {
    const { service, excel } = makeService();

    await service.buildFile(makeResult(), 'XLSX', CONTEXT);

    const [definition] = excel.buildWorkbookBuffer.mock.calls[0];
    expect(definition.sheets).toHaveLength(1);
    expect(
      definition.sheets[0].columns?.map((column) => column.header),
    ).toEqual([
      'Employee',
      'Hired',
      'Clocked in',
      'Salary',
      'Worked',
      'Active',
    ]);
    expect(definition.sheets[0].columns?.map((column) => column.key)).toEqual([
      'name',
      'hiredOn',
      'clockedIn',
      'salary',
      'worked',
      'active',
    ]);
  });

  it('keeps numeric columns numeric so a spreadsheet can sum them', async () => {
    const { service, excel } = makeService();
    const result = makeResult({
      rows: [row({ salary: new Prisma.Decimal('12500.5'), worked: 505 })],
    });

    await service.buildFile(result, 'XLSX', CONTEXT);

    const [definition] = excel.buildWorkbookBuffer.mock.calls[0];
    expect(definition.sheets[0].rows[0].salary).toBe(12500.5);
    expect(definition.sheets[0].rows[0].worked).toBe(505);
  });

  it('still writes dates as tenant-formatted text, never a raw ISO string', async () => {
    const { service, excel } = makeService();
    const result = makeResult({
      rows: [row({ clockedIn: '2026-08-24T22:30:00.000Z' })],
    });

    await service.buildFile(result, 'XLSX', CONTEXT);

    const [definition] = excel.buildWorkbookBuffer.mock.calls[0];
    expect(String(definition.sheets[0].rows[0].clockedIn)).toMatch(
      /^Aug 25, 2026, 1:30\s?AM$/,
    );
  });

  it('trims a long report name to a worksheet name Excel accepts', async () => {
    const { service, excel } = makeService();

    await service.buildFile(
      makeResult({ name: 'Attendance / Exceptions [2026]: full year detail' }),
      'XLSX',
      CONTEXT,
    );

    const [definition] = excel.buildWorkbookBuffer.mock.calls[0];
    const name = definition.sheets[0].name;
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[:\\/?*[\]]/);
  });
});

describe('ReportExportService — PDF', () => {
  function manyRows(count: number) {
    return Array.from({ length: count }, (_, index) =>
      row({ id: `row-${index}`, name: `Employee ${index}` }),
    );
  }

  it('announces truncation on the page rather than dropping rows silently', () => {
    const { service } = makeService();

    const model = service.buildPdfModel(
      makeResult({ rows: manyRows(PDF_MAX_ROWS + 345) }),
      CONTEXT,
    );

    expect(model.rows).toHaveLength(PDF_MAX_ROWS);
    expect(model.totalRows).toBe(PDF_MAX_ROWS + 345);
    expect(model.truncationNotice).toBe(
      'Showing the first 2,000 of 2,345 rows. Export as CSV or Excel for the complete data set.',
    );
  });

  it('does not claim truncation when every row fits', () => {
    const { service } = makeService();

    const model = service.buildPdfModel(
      makeResult({ rows: manyRows(PDF_MAX_ROWS) }),
      CONTEXT,
    );

    expect(model.rows).toHaveLength(PDF_MAX_ROWS);
    expect(model.truncationNotice).toBeNull();
  });

  it('states the tenant, period and generated time in the tenant timezone', () => {
    const { service } = makeService();

    const model = service.buildPdfModel(makeResult(), {
      ...CONTEXT,
      period: {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T00:00:00.000Z',
      },
    });

    expect(model.contextLine).toBe('Acme Trading — Active employees');
    expect(model.periodLine).toBe('Period: Aug 1, 2026 – Aug 31, 2026');
    expect(model.generatedLine).toMatch(
      /^Generated Aug 25, 2026, 1:30\s?AM \(Asia\/Qatar\)$/,
    );
  });

  it('reports truncation on the returned file, not only inside the document', async () => {
    const { service } = makeService();

    const file = await service.buildFile(
      makeResult({ rows: manyRows(PDF_MAX_ROWS + 1) }),
      'PDF',
      CONTEXT,
    );

    expect(file.truncated).toBe(true);
    expect(file.rowCount).toBe(PDF_MAX_ROWS);
    expect(file.contentType).toBe('application/pdf');
    expect(file.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }, 60_000);

  it('renders a small report to a real PDF document', async () => {
    const { service } = makeService();

    const file = await service.buildFile(
      makeResult({ rows: manyRows(3) }),
      'PDF',
      CONTEXT,
    );

    expect(file.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(file.buffer.byteLength).toBeGreaterThan(500);
    expect(file.truncated).toBe(false);
  }, 30_000);

  it('renders an empty report without failing', async () => {
    const { service } = makeService();

    const file = await service.buildFile(makeResult(), 'PDF', CONTEXT);

    expect(file.rowCount).toBe(0);
    expect(file.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }, 30_000);
});

describe('buildExportFileName', () => {
  const generatedAt = new Date('2026-08-24T22:30:00.000Z');

  it('slugs the report name and stamps the tenant-local date', () => {
    expect(
      buildExportFileName(
        'Headcount by Department',
        'CSV',
        generatedAt,
        'Asia/Qatar',
      ),
    ).toBe('headcount-by-department-2026-08-25.csv');
  });

  it('strips every character that could escape a Content-Disposition header', () => {
    const hostile = 'Report "quoted"\\ \r\n ../../etc/passwd; name=x';

    const fileName = buildExportFileName(hostile, 'XLSX', generatedAt, 'UTC');

    expect(fileName).not.toMatch(/["'\\/\r\n;]/);
    expect(fileName).not.toContain('..');
    expect(fileName).toBe('report-quoted-etc-passwd-name-x-2026-08-24.xlsx');
  });

  it('falls back to a usable name when the report name has no usable characters', () => {
    expect(buildExportFileName('«»', 'PDF', generatedAt, 'UTC')).toBe(
      'report-2026-08-24.pdf',
    );
  });

  it('caps the slug so the filename cannot grow unbounded', () => {
    const fileName = buildExportFileName(
      'a'.repeat(400),
      'CSV',
      generatedAt,
      'UTC',
    );

    expect(fileName.length).toBeLessThanOrEqual(96);
  });

  it('falls back to UTC when the tenant timezone is not a real IANA zone', () => {
    expect(
      buildExportFileName('Report', 'CSV', generatedAt, 'Not/A_Zone'),
    ).toBe('report-2026-08-24.csv');
  });

  it('is returned on the built file', async () => {
    const { service } = makeService();

    const file = await service.buildFile(makeResult(), 'CSV', CONTEXT);

    expect(file.fileName).toBe('headcount-by-department-2026-08-25.csv');
  });
});
