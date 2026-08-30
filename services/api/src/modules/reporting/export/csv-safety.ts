/**
 * CSV cell rendering that is safe to open in Excel, Numbers and Google Sheets.
 *
 * The repository already has `common/utils/csv.util.ts`, and its `csvCell`
 * quotes correctly — but quoting is not the whole problem. A spreadsheet
 * evaluates any cell whose text begins `=`, `+`, `-`, `@`, TAB or CR as a
 * formula, and quoting does not stop that: `"=HYPERLINK(...)"` is still a
 * formula once the parser has stripped the quotes. `=cmd|'/c calc'!A0` in an
 * employee's surname is a real attack on whoever opens the export, not a
 * theoretical one, because every string in a report export is text some tenant
 * user typed — names, leave reasons, candidate notes, rejection comments.
 *
 * So this module does two things the shared helper does not: it neutralises the
 * formula prefixes, and it says explicitly which values are exempt and why.
 *
 * It deliberately does *not* replace `csv.util.ts`. That helper serves import
 * templates and module exports whose cells are machine-generated; changing its
 * output shape would change files other code already parses. This one belongs
 * to reporting, where the content is user-authored.
 */

/**
 * The UTF-8 byte order mark.
 *
 * Excel on Windows reads a BOM-less UTF-8 CSV as the system code page, so a
 * tenant with Arabic, Turkish or accented Latin data gets mojibake in every
 * cell and reports it as a data-corruption bug. The BOM costs three bytes and
 * every other consumer tolerates it.
 */
export const CSV_BOM = '\uFEFF';

/**
 * Leading characters a spreadsheet treats as the start of a formula.
 *
 * TAB and CR are here because Excel strips them while deciding, so `\t=1+1`
 * evaluates exactly as `=1+1` would.
 */
export const CSV_FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'] as const;

/** What a neutralised cell is prefixed with — a single quote, per OWASP. */
export const CSV_FORMULA_GUARD = "'";

type DecimalLike = {
  toNumber: () => number;
  toFixed: (digits?: number) => string;
  toString: () => string;
};

/**
 * `Prisma.Decimal` without importing the Prisma client into a pure utility.
 *
 * Decimal.js instances carry both `toNumber` and `toFixed`; no built-in this
 * function will otherwise meet (Date, RegExp, plain objects) carries either.
 */
function isDecimalLike(value: unknown): value is DecimalLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<DecimalLike>).toNumber === 'function' &&
    typeof (value as Partial<DecimalLike>).toFixed === 'function'
  );
}

/**
 * Whether `text` would be evaluated as a formula if a spreadsheet opened it.
 *
 * Exported so the spec can assert the rule rather than a sample of it.
 */
export function isFormulaInjection(text: string): boolean {
  return CSV_FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/**
 * Renders one value as a quoted, injection-safe CSV field.
 *
 * Numbers, booleans, bigints and Decimals are **not** formula-guarded even when
 * they stringify with a leading `-`. That is deliberate: `-5` is a negative
 * number to a spreadsheet and nothing else, and a JavaScript number cannot
 * stringify into `-1+1+cmd|'/c calc'!A0`. Prefixing them would put a stray
 * apostrophe in front of every negative amount in a payroll export and, worse,
 * turn the cell into text that will not sum.
 *
 * `Date` falls back to ISO-8601 only as a defensive last resort. Report exports
 * must not show a user a raw ISO timestamp (BUG-2010), so
 * `ReportExportService` formats date and datetime columns in the tenant's
 * timezone *before* the value reaches this function; a Date arriving here means
 * a column whose type the semantic layer did not declare.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    // An empty unquoted field is the unambiguous CSV spelling of "no value".
    return '';
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return quote(String(value));
  }

  if (typeof value === 'boolean') {
    return quote(value ? 'true' : 'false');
  }

  if (isDecimalLike(value)) {
    return quote(value.toString());
  }

  if (value instanceof Date) {
    return quote(
      Number.isNaN(value.getTime()) ? '' : value.toISOString(),
    );
  }

  const text = typeof value === 'string' ? value : safeStringify(value);

  return quote(isFormulaInjection(text) ? `${CSV_FORMULA_GUARD}${text}` : text);
}

/**
 * Joins already-escaped cells into one CSV record.
 *
 * `\r\n` because that is what RFC 4180 specifies and what Excel expects for an
 * embedded newline to survive a round trip.
 */
export function csvRow(cells: readonly string[]): string {
  return cells.join(',');
}

/** Assembles a full CSV document, BOM included, from pre-escaped rows. */
export function csvDocument(rows: ReadonlyArray<readonly string[]>): string {
  return `${CSV_BOM}${rows.map(csvRow).join('\r\n')}\r\n`;
}

function quote(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    // Circular structures reach here. A cell is not the place to fail an
    // export that is otherwise complete.
    return '';
  }
}
