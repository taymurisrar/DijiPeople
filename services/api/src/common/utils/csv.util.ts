/**
 * Shared CSV helpers for module export and template endpoints.
 *
 * Export is a cross-cutting capability rather than an employee feature, so the
 * formatting lives here and every module produces byte-identical output: the
 * same quoting, the same date handling, the same trailing newline.
 */
export type CsvFile = {
  filename: string;
  buffer: Buffer;
};

/**
 * Renders rows as CSV using the first row's keys as the header.
 *
 * `columns` pins the header order and set explicitly, which matters when rows
 * are built dynamically or a caller exports a chosen subset of columns.
 */
export function toCsv(
  rows: Array<Record<string, unknown>>,
  columns?: readonly string[],
) {
  const headers = columns ?? (rows.length > 0 ? Object.keys(rows[0]) : []);

  if (headers.length === 0) {
    return '';
  }

  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header])).join(','),
    ),
  ];

  return `${lines.join('\n')}\n`;
}

export function csvCell(value: unknown) {
  const text =
    value === null || value === undefined
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : JSON.stringify(value);

  return `"${text.replace(/"/g, '""')}"`;
}

/** Header-only CSV used by the "download import template" action. */
export function buildCsvTemplate(
  filename: string,
  columns: readonly string[],
): CsvFile {
  return {
    filename,
    buffer: Buffer.from(`${columns.join(',')}\n`, 'utf8'),
  };
}

export function buildCsvFile(
  filename: string,
  rows: Array<Record<string, unknown>>,
  columns?: readonly string[],
): CsvFile {
  return {
    filename,
    buffer: Buffer.from(toCsv(rows, columns), 'utf8'),
  };
}

export type ParsedCsvRow = {
  /** 1-based line number in the uploaded file, so errors point at the real row. */
  rowNumber: number;
  values: Record<string, string>;
};

export type CsvImportRowError = {
  row: number;
  message: string;
};

export type CsvImportResult = {
  totalRows: number;
  successCount: number;
  failureCount: number;
  errors: CsvImportRowError[];
};

const CSV_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
];

/**
 * Rejects anything that is not a CSV upload.
 *
 * Browsers report CSV under several content types and sometimes as
 * application/octet-stream, so the extension is accepted as a fallback.
 */
export function assertCsvUpload(
  file: { mimetype: string; originalname: string; buffer: Buffer } | undefined,
  entityLabel: string,
) {
  if (!file) {
    throw new Error(`CSV file is required for ${entityLabel} import.`);
  }

  if (
    !CSV_MIME_TYPES.includes(file.mimetype) &&
    !file.originalname.toLowerCase().endsWith('.csv')
  ) {
    throw new Error(`${entityLabel} import supports CSV files only.`);
  }

  return file;
}

/** Parses CSV content into header-keyed rows, preserving real line numbers. */
export function parseCsvRows(
  content: string,
  entityLabel: string,
): ParsedCsvRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error(
      `${entityLabel} CSV must include a header row and at least one data row.`,
    );
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    const record: Record<string, string> = {};

    headers.forEach((header, headerIndex) => {
      record[header] = values[headerIndex]?.trim() ?? '';
    });

    // +2 because line 1 is the header and arrays are zero-based.
    return { rowNumber: index + 2, values: record };
  });
}

/** Splits one CSV line, honouring quoted fields and escaped double quotes. */
export function splitCsvLine(line: string) {
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

/** Formats a date as YYYY-MM-DD, the format the import templates expect. */
export function csvDate(value: Date | string | null | undefined) {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
