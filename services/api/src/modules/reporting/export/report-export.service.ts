import { Injectable, Logger } from '@nestjs/common';
import type { ReportExportFormat } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { AppError } from '../../../common/errors/app-error';
import {
  ExcelExportService,
  type ExcelCellValue,
} from '../../../common/excel/excel-export.service';
import type {
  ReportResult,
  ReportResultColumn,
} from '../execution/report-execution.service';
import { csvDocument, escapeCsvCell } from './csv-safety';

/**
 * The formatting a tenant sees on screen, restated for the server.
 *
 * `apps/web/lib/formatting-context.ts` is the client-side authority and there
 * is no server equivalent, so an export rendered from raw values silently
 * disagrees with the screen it was exported from: the list shows
 * "24 Aug 2026, 3:15 pm" and the CSV shows "2026-08-24T10:15:00.000Z". That is
 * BUG-2010 exactly, and it is not cosmetic — the ISO string is in **UTC**, so a
 * tenant in Asia/Qatar reading a clock-in time off an export reads a time three
 * hours earlier than the one the product showed them.
 *
 * Every field is optional except `timezone`, because a timezone that falls back
 * to the server's is the defect this type exists to prevent: it must be an
 * explicit decision by the caller, taken from tenant settings.
 */
export interface ReportExportContext {
  /** Shown on the PDF cover line. Never used to build a file path. */
  tenantName?: string;
  /** IANA zone from tenant settings — **not** the server's. Required. */
  timezone: string;
  /** BCP-47 tag from tenant settings. Defaults to `en-US`. */
  locale?: string;
  /** ISO 4217 code for `money` columns. Omitted renders a plain number. */
  currency?: string;
  /** Mirrors the web app's `dateFormat` setting; unset means a medium date. */
  dateFormat?: string;
  timeFormat?: '12h' | '24h';
  /** The reporting period, for the PDF header. */
  period?: {
    from?: string | Date | null;
    to?: string | Date | null;
    label?: string | null;
  };
}

export interface ReportExportFile {
  buffer: Buffer;
  contentType: string;
  /** Without the dot, e.g. `csv`. */
  extension: string;
  /** Header-safe; see {@link buildExportFileName}. */
  fileName: string;
  /** Rows actually written into the file. */
  rowCount: number;
  /** True when the format could not carry every row — PDF only. */
  truncated: boolean;
}

/**
 * How many rows a PDF may contain.
 *
 * A PDF is a document somebody reads, not a data set somebody processes. Fifty
 * thousand rows is roughly 1,700 pages that nobody opens and a render that ties
 * up the API for minutes. CSV and XLSX carry the full export
 * (`MAX_EXPORT_ROWS`); PDF stops here and *says so on the page*.
 */
export const PDF_MAX_ROWS = 2_000;

const DEFAULT_LOCALE = 'en-US';
const MAX_FILE_NAME_SLUG = 80;

const CONTENT_TYPES: Record<ReportExportFormat, string> = {
  CSV: 'text/csv; charset=utf-8',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PDF: 'application/pdf',
};

const EXTENSIONS: Record<ReportExportFormat, string> = {
  CSV: 'csv',
  XLSX: 'xlsx',
  PDF: 'pdf',
};

/** The PDF, decided before any drawing happens, so it can be asserted on. */
export interface ReportPdfModel {
  title: string;
  contextLine: string;
  periodLine: string | null;
  generatedLine: string;
  /** Non-null exactly when rows were dropped. Rendered in the document. */
  truncationNotice: string | null;
  headers: string[];
  rows: string[][];
  totalRows: number;
  caveats: string[];
}

/**
 * Renders a `ReportResult` into a downloadable file.
 *
 * Stateless and storage-free on purpose: this class turns a result into bytes
 * and nothing else. Persisting those bytes, tracking the run and enforcing
 * retention is `ReportArtifactService`, so a caller that only wants to stream
 * a small export back inline never touches the database or the disk.
 */
@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);

  constructor(private readonly excel: ExcelExportService) {}

  async buildFile(
    result: ReportResult,
    format: ReportExportFormat,
    context: ReportExportContext,
  ): Promise<ReportExportFile> {
    const generatedAt = parseDate(result.generatedAt) ?? new Date();
    const fileName = buildExportFileName(
      result.name,
      format,
      generatedAt,
      context.timezone,
    );

    try {
      switch (format) {
        case 'CSV':
          return {
            buffer: this.buildCsv(result, context),
            contentType: CONTENT_TYPES.CSV,
            extension: EXTENSIONS.CSV,
            fileName,
            rowCount: result.rows.length,
            truncated: false,
          };
        case 'XLSX':
          return {
            buffer: this.buildXlsx(result, context),
            contentType: CONTENT_TYPES.XLSX,
            extension: EXTENSIONS.XLSX,
            fileName,
            rowCount: result.rows.length,
            truncated: false,
          };
        case 'PDF': {
          const model = this.buildPdfModel(result, context);
          return {
            buffer: await this.renderPdf(model),
            contentType: CONTENT_TYPES.PDF,
            extension: EXTENSIONS.PDF,
            fileName,
            rowCount: model.rows.length,
            truncated: model.truncationNotice !== null,
          };
        }
        default:
          throw new AppError('REPORT_EXPORT_FAILED', {
            message: `Unsupported export format: ${String(format)}`,
            details: { format },
          });
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(
        `Failed to render ${format} export for ${result.targetKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new AppError('REPORT_EXPORT_FAILED', {
        message: 'The export file could not be rendered.',
        details: { format, targetKey: result.targetKey },
        cause: error,
      });
    }
  }

  // --- CSV -----------------------------------------------------------------

  /**
   * CSV, BOM-prefixed and formula-guarded.
   *
   * Cells carry the *formatted* value rather than the raw one, because a CSV is
   * the export a person opens and compares against the screen. XLSX keeps
   * numbers numeric instead — see `buildXlsx`.
   */
  private buildCsv(result: ReportResult, context: ReportExportContext): Buffer {
    const header = result.columns.map((column) => escapeCsvCell(column.label));
    const rows = result.rows.map((row) =>
      result.columns.map((column) =>
        escapeCsvCell(this.formatCell(row.values[column.key], column, context)),
      ),
    );

    return Buffer.from(csvDocument([header, ...rows]), 'utf8');
  }

  // --- XLSX ----------------------------------------------------------------

  /**
   * XLSX, through the workbook writer this repository already owns.
   *
   * No new dependency and no direct `xlsx` import: `ExcelExportService` is the
   * one place SheetJS is used, and keeping it that way is what makes the
   * "writing is fine, parsing is not" boundary in that file enforceable
   * (ITEM-0048 — two unfixed advisories, both in the parser).
   *
   * Numeric columns stay numeric here while CSV and PDF get formatted text. A
   * spreadsheet exists to be summed and pivoted, and "1,234.50" as a string
   * cannot be. Dates are still written as formatted text in the tenant's
   * timezone, because a serialised date carries no zone at all and Excel would
   * re-render it in the reader's.
   */
  private buildXlsx(
    result: ReportResult,
    context: ReportExportContext,
  ): Buffer {
    const columns = result.columns.map((column) => ({
      key: column.key,
      header: column.label,
      width: Math.min(Math.max(column.label.length + 4, 14), 48),
    }));

    const rows = result.rows.map((row) => {
      const record: Record<string, ExcelCellValue> = {};
      for (const column of result.columns) {
        record[column.key] = this.toExcelCell(
          row.values[column.key],
          column,
          context,
        );
      }
      return record;
    });

    return this.excel.buildWorkbookBuffer({
      sheets: [{ name: sheetName(result.name), rows, columns }],
    });
  }

  private toExcelCell(
    value: unknown,
    column: ReportResultColumn,
    context: ReportExportContext,
  ): ExcelCellValue {
    if (value === null || value === undefined) return null;

    const kind = effectiveKind(column);
    if (
      kind === 'number' ||
      kind === 'integer' ||
      kind === 'money' ||
      kind === 'percent' ||
      kind === 'duration_minutes'
    ) {
      const numeric = toNumber(value);
      if (numeric !== null) return numeric;
    }
    if (typeof value === 'boolean') return value;

    return this.formatCell(value, column, context);
  }

  // --- PDF -----------------------------------------------------------------

  /**
   * The PDF's content, separated from its drawing.
   *
   * Made a method of its own so the truncation notice is testable as a string.
   * Asserting it against the rendered bytes is not possible — pdfkit deflates
   * its content streams — and a truncation that is only *believed* to be
   * announced is the silent-truncation defect this cap exists to avoid.
   */
  buildPdfModel(
    result: ReportResult,
    context: ReportExportContext,
  ): ReportPdfModel {
    const total = result.rows.length;
    const visible = result.rows.slice(0, PDF_MAX_ROWS);
    const locale = resolveLocale(context);

    return {
      title: result.name,
      contextLine: [context.tenantName, result.description]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join(' — '),
      periodLine: this.periodLine(context),
      generatedLine: `Generated ${this.formatDateTime(
        parseDate(result.generatedAt) ?? new Date(),
        context,
      )} (${context.timezone})`,
      truncationNotice:
        total > visible.length
          ? `Showing the first ${visible.length.toLocaleString(
              locale,
            )} of ${total.toLocaleString(
              locale,
            )} rows. Export as CSV or Excel for the complete data set.`
          : null,
      headers: result.columns.map((column) => column.label),
      rows: visible.map((row) =>
        result.columns.map((column) =>
          this.formatCell(row.values[column.key], column, context),
        ),
      ),
      totalRows: total,
      caveats: result.caveats ?? [],
    };
  }

  private periodLine(context: ReportExportContext): string | null {
    const period = context.period;
    if (!period) return null;
    if (period.label) return `Period: ${period.label}`;

    const from = parseDate(period.from);
    const to = parseDate(period.to);
    if (!from && !to) return null;

    const rendered = [from, to]
      .map((value) => (value ? this.formatDate(value, context) : '…'))
      .join(' – ');
    return `Period: ${rendered}`;
  }

  /**
   * Draws the model onto a landscape A4 document.
   *
   * Buffered pages, because "Page 3 of 11" cannot be written until the last
   * page exists. Modelled on `contracts.service.ts`'s `createPdf`: collect
   * `data` chunks, resolve `Buffer.concat` on `end`.
   */
  private renderPdf(model: ReportPdfModel): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const margin = 36;
      const document = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: margin, bottom: margin, left: margin, right: margin },
        bufferPages: true,
        info: { Title: model.title },
      });

      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('error', reject);
      document.on('end', () => resolve(Buffer.concat(chunks)));

      const usableWidth = document.page.width - margin * 2;
      const columnCount = Math.max(model.headers.length, 1);
      const columnWidth = usableWidth / columnCount;
      const rowHeight = 14;
      const bottomLimit = document.page.height - margin - 18;

      document
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(model.title, margin, margin, { width: usableWidth });

      document.font('Helvetica').fontSize(9).fillColor('#444444');
      for (const line of [
        model.contextLine,
        model.periodLine,
        model.generatedLine,
      ]) {
        if (line) document.text(line, { width: usableWidth });
      }
      if (model.truncationNotice) {
        document
          .fillColor('#8a4b00')
          .font('Helvetica-Bold')
          .text(model.truncationNotice, { width: usableWidth })
          .font('Helvetica');
      }
      for (const caveat of model.caveats) {
        document.fillColor('#666666').text(`Note: ${caveat}`, {
          width: usableWidth,
        });
      }
      document.fillColor('#000000').moveDown(0.6);

      const drawHeaderRow = (y: number) => {
        document.font('Helvetica-Bold').fontSize(8).fillColor('#000000');
        model.headers.forEach((header, index) => {
          document.text(header, margin + index * columnWidth, y, {
            width: columnWidth - 6,
            height: rowHeight,
            ellipsis: true,
            lineBreak: false,
          });
        });
        const lineY = y + rowHeight - 3;
        document
          .moveTo(margin, lineY)
          .lineTo(margin + usableWidth, lineY)
          .strokeColor('#999999')
          .lineWidth(0.5)
          .stroke();
        return y + rowHeight;
      };

      let y = drawHeaderRow(document.y);

      for (const row of model.rows) {
        if (y + rowHeight > bottomLimit) {
          document.addPage();
          y = drawHeaderRow(margin);
        }
        document.font('Helvetica').fontSize(8).fillColor('#222222');
        row.forEach((cell, index) => {
          document.text(cell, margin + index * columnWidth, y, {
            width: columnWidth - 6,
            height: rowHeight,
            ellipsis: true,
            lineBreak: false,
          });
        });
        y += rowHeight;
      }

      if (model.rows.length === 0) {
        document
          .font('Helvetica-Oblique')
          .fontSize(9)
          .fillColor('#666666')
          .text('This report returned no rows.', margin, y + 6, {
            width: usableWidth,
          });
      }

      const range = document.bufferedPageRange();
      for (let index = 0; index < range.count; index += 1) {
        document.switchToPage(range.start + index);
        /*
         * pdfkit starts a new page when text would cross the bottom margin, so
         * a footer written at the very bottom would add a page per page,
         * forever. Dropping the margin for the write is the documented way out.
         */
        document.page.margins.bottom = 0;
        document
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#666666')
          .text(
            `Page ${index + 1} of ${range.count}`,
            margin,
            document.page.height - margin + 4,
            { width: usableWidth, align: 'right', lineBreak: false },
          );
      }

      document.flushPages();
      document.end();
    });
  }

  // --- value formatting ----------------------------------------------------

  /**
   * One value, rendered the way the tenant's screen renders it.
   *
   * Mirrors `apps/web/lib/formatting-context.ts` deliberately rather than
   * inventing a second convention: same medium-date default, same configurable
   * `dateFormat`, same 12/24-hour switch, same `Intl` locale resolution.
   */
  formatCell(
    value: unknown,
    column: ReportResultColumn,
    context: ReportExportContext,
  ): string {
    if (value === null || value === undefined) return '';

    switch (effectiveKind(column)) {
      case 'date': {
        const date = parseDate(value);
        /*
         * Rendered in UTC, not the tenant's zone, and that is not an oversight.
         * A `date` column has no time of day: Prisma returns `@db.Date` as
         * midnight UTC, and shifting midnight into a zone behind UTC moves a
         * hire date, a leave date or a payroll period one day backwards. A
         * calendar date is the same date everywhere.
         */
        return date ? this.formatDate(date, context, 'UTC') : asText(value);
      }
      case 'datetime': {
        const date = parseDate(value);
        return date ? this.formatDateTime(date, context) : asText(value);
      }
      case 'money': {
        const numeric = toNumber(value);
        if (numeric === null) return asText(value);
        const currency = normalizeCurrency(context.currency);
        return currency
          ? new Intl.NumberFormat(resolveLocale(context), {
              style: 'currency',
              currency,
            }).format(numeric)
          : new Intl.NumberFormat(resolveLocale(context), {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(numeric);
      }
      case 'percent': {
        const numeric = toNumber(value);
        return numeric === null
          ? asText(value)
          : `${new Intl.NumberFormat(resolveLocale(context), {
              maximumFractionDigits: 2,
            }).format(numeric)}%`;
      }
      case 'duration_minutes': {
        const numeric = toNumber(value);
        return numeric === null ? asText(value) : formatDuration(numeric);
      }
      case 'integer': {
        const numeric = toNumber(value);
        return numeric === null
          ? asText(value)
          : new Intl.NumberFormat(resolveLocale(context), {
              maximumFractionDigits: 0,
            }).format(numeric);
      }
      case 'number': {
        const numeric = toNumber(value);
        return numeric === null
          ? asText(value)
          : new Intl.NumberFormat(resolveLocale(context)).format(numeric);
      }
      case 'boolean':
        return toBoolean(value) ? 'Yes' : 'No';
      default:
        if (value instanceof Date) return this.formatDateTime(value, context);
        return asText(value);
    }
  }

  /**
   * A date, in the **tenant's** timezone rather than the server's.
   *
   * `timeZone` is overridable for calendar dates, which carry no zone at all.
   */
  formatDate(
    date: Date,
    context: ReportExportContext,
    timeZone: string = context.timezone,
  ): string {
    const locale = resolveLocale(context);

    if (!context.dateFormat) {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeZone,
      }).format(date);
    }

    const parts = new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: context.dateFormat === 'dd-MMM-yyyy' ? 'short' : '2-digit',
      year: 'numeric',
      timeZone,
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    const day = values.day ?? '';
    const month = values.month ?? '';
    const year = values.year ?? '';

    switch (context.dateFormat) {
      case 'MM/dd/yyyy':
        return `${month}/${day}/${year}`;
      case 'dd/MM/yyyy':
        return `${day}/${month}/${year}`;
      case 'yyyy-MM-dd':
        return `${year}-${month}-${day}`;
      case 'dd-MMM-yyyy':
        return `${day}-${month}-${year}`;
      default:
        return new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeZone,
        }).format(date);
    }
  }

  formatDateTime(date: Date, context: ReportExportContext): string {
    const time = new Intl.DateTimeFormat(resolveLocale(context), {
      timeStyle: 'short',
      timeZone: context.timezone,
      hour12:
        context.timeFormat === '24h'
          ? false
          : context.timeFormat === '12h'
            ? true
            : undefined,
    }).format(date);

    return `${this.formatDate(date, context)}, ${time}`;
  }
}

/**
 * A download filename that cannot escape a `Content-Disposition` header.
 *
 * The report name is tenant-authored, so it can contain a double quote, a
 * backslash, a CR/LF pair or `../` — respectively breaking out of the quoted
 * filename, escaping the next character, splitting the response header, and
 * (once it reaches `StorageService`) pointing at another directory. The slug is
 * an allow-list rather than a deny-list: everything outside `[a-z0-9]` becomes
 * a hyphen, so there is nothing left to enumerate.
 */
export function buildExportFileName(
  reportName: string,
  format: ReportExportFormat,
  generatedAt: Date = new Date(),
  timezone = 'UTC',
): string {
  const slug =
    reportName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_FILE_NAME_SLUG)
      .replace(/-+$/g, '') || 'report';

  return `${slug}-${isoDateIn(generatedAt, timezone)}.${EXTENSIONS[format]}`;
}

/** `YYYY-MM-DD` on the tenant's calendar, not the server's. */
function isoDateIn(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    }).format(date);
  } catch {
    // An unknown IANA zone must not fail an export; UTC is the honest fallback.
    return date.toISOString().slice(0, 10);
  }
}

/**
 * A worksheet name Excel will accept.
 *
 * Excel rejects `: \ / ? * [ ]` and anything over 31 characters, and silently
 * corrupts the file rather than reporting it.
 */
function sheetName(reportName: string): string {
  const cleaned = reportName.replace(/[:\\/?*[\]]/g, ' ').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 31) : 'Report';
}

/** `column.format` overrides `column.type` when the semantic layer sets one. */
function effectiveKind(column: ReportResultColumn): string {
  switch (column.format) {
    case 'currency':
      return 'money';
    case 'percent':
      return 'percent';
    case 'duration':
      return 'duration_minutes';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    default:
      return column.type;
  }
}

function resolveLocale(context: ReportExportContext): string {
  return context.locale && context.locale.trim().length > 0
    ? context.locale
    : DEFAULT_LOCALE;
}

function normalizeCurrency(currency?: string): string | null {
  return currency && /^[A-Za-z]{3}$/.test(currency)
    ? currency.toUpperCase()
    : null;
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Numbers, numeric strings and `Prisma.Decimal` alike. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    if (value.trim().length === 0) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', 'yes', '1', 'y'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.round(Math.abs(minutes));
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  if (hours === 0) return `${sign}${remainder}m`;
  return `${sign}${hours}h ${remainder}m`;
}

/**
 * Any value as text, without letting an object become '[object Object]'.
 *
 * Only reached when a column's declared type and its actual value disagree —
 * a numeric column carrying a string, say. Showing the raw content beats
 * showing a placeholder that hides which column is misdeclared.
 */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return stringifyUnknown(value);
}

function stringifyUnknown(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}
