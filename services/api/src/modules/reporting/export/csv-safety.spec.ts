import { Prisma } from '@prisma/client';
import {
  CSV_BOM,
  CSV_FORMULA_PREFIXES,
  csvDocument,
  escapeCsvCell,
  isFormulaInjection,
} from './csv-safety';

/** Strips the surrounding quotes so assertions read as the cell's content. */
function unquote(cell: string): string {
  return cell.replace(/^"|"$/g, '').replace(/""/g, '"');
}

describe('escapeCsvCell — formula injection', () => {
  it.each(CSV_FORMULA_PREFIXES)('neutralises a cell beginning %j', (prefix) => {
    const escaped = escapeCsvCell(`${prefix}HYPERLINK("http://evil","x")`);

    expect(escaped.startsWith(`"'${prefix}`)).toBe(true);
    expect(isFormulaInjection(unquote(escaped))).toBe(false);
  });

  it('neutralises the DDE command-execution payload', () => {
    // The canonical Excel/Sheets CSV-injection string.
    expect(escapeCsvCell(`=cmd|'/c calc'!A0`)).toBe(`"'=cmd|'/c calc'!A0"`);
  });

  it('neutralises a payload hidden behind a leading tab', () => {
    // Excel strips control characters before deciding whether it is a formula.
    expect(escapeCsvCell('\t=1+1')).toBe(`"'\t=1+1"`);
  });

  it('leaves an ordinary tenant-authored string untouched', () => {
    expect(escapeCsvCell("O'Brien & Sons")).toBe(`"O'Brien & Sons"`);
  });

  it('does not guard a negative number, which cannot carry a formula', () => {
    // Prefixing would put a stray apostrophe in front of every negative
    // payroll amount and turn the cell into text that will not sum.
    expect(escapeCsvCell(-1250.5)).toBe('"-1250.5"');
  });

  it('does not guard a negative Decimal either', () => {
    expect(escapeCsvCell(new Prisma.Decimal('-42.75'))).toBe('"-42.75"');
  });

  it('still guards a string that merely looks numeric but is not', () => {
    expect(escapeCsvCell("-1+1+cmd|' /c calc'!A0")).toBe(
      `"'-1+1+cmd|' /c calc'!A0"`,
    );
  });
});

describe('escapeCsvCell — value kinds', () => {
  it('renders null as an empty field', () => {
    expect(escapeCsvCell(null)).toBe('');
  });

  it('renders undefined as an empty field', () => {
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('renders a Date as ISO-8601 as a defensive fallback', () => {
    expect(escapeCsvCell(new Date('2026-08-24T10:15:00.000Z'))).toBe(
      '"2026-08-24T10:15:00.000Z"',
    );
  });

  it('renders an invalid Date as empty rather than "Invalid Date"', () => {
    expect(escapeCsvCell(new Date('not-a-date'))).toBe('""');
  });

  it('renders a Prisma.Decimal through toString, not toNumber', () => {
    // Number() would lose precision on a value this long; toString does not.
    expect(escapeCsvCell(new Prisma.Decimal('12345678901234.99'))).toBe(
      '"12345678901234.99"',
    );
  });

  it('renders booleans', () => {
    expect(escapeCsvCell(true)).toBe('"true"');
    expect(escapeCsvCell(false)).toBe('"false"');
  });

  it('renders numbers and bigints', () => {
    expect(escapeCsvCell(42)).toBe('"42"');
    expect(escapeCsvCell(0)).toBe('"0"');
    expect(escapeCsvCell(BigInt('9007199254740993'))).toBe(
      '"9007199254740993"',
    );
  });

  it('doubles embedded quotes so the field round-trips', () => {
    const escaped = escapeCsvCell('She said "hello"');

    expect(escaped).toBe('"She said ""hello"""');
    expect(unquote(escaped)).toBe('She said "hello"');
  });

  it('keeps an embedded newline inside the quoted field', () => {
    const escaped = escapeCsvCell('line one\nline two');

    expect(escaped).toBe('"line one\nline two"');
    expect(unquote(escaped)).toBe('line one\nline two');
  });

  it('keeps an embedded comma from splitting the row', () => {
    expect(escapeCsvCell('Doe, Jane')).toBe('"Doe, Jane"');
  });

  it('serialises an object rather than emitting [object Object]', () => {
    expect(escapeCsvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('survives a circular structure instead of failing the export', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(escapeCsvCell(circular)).toBe('""');
  });
});

describe('csvDocument', () => {
  it('prefixes the UTF-8 BOM so Excel reads non-ASCII data correctly', () => {
    const document = csvDocument([[escapeCsvCell('Naïve Ünicode')]]);

    expect(document.startsWith(CSV_BOM)).toBe(true);
    expect(Buffer.from(document, 'utf8').subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    );
  });

  it('joins cells with commas and rows with CRLF', () => {
    const document = csvDocument([
      [escapeCsvCell('Name'), escapeCsvCell('Amount')],
      [escapeCsvCell('Jane'), escapeCsvCell(10)],
    ]);

    expect(document).toBe(`${CSV_BOM}"Name","Amount"\r\n"Jane","10"\r\n`);
  });
});
