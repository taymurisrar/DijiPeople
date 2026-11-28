import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/*
 * INVARIANT — SheetJS (`xlsx`) is only ever used to WRITE workbooks.
 *
 * `xlsx@0.18.5` carries two high advisories with no fix on npm:
 *   GHSA-4r6h-8v6p-xvw6 (prototype pollution) and
 *   GHSA-5pgg-2g8v-p4x9 (ReDoS).
 * Both are triggered by PARSING a crafted workbook. This codebase accepts
 * uploaded workbooks on authenticated endpoints (payroll and timesheet import,
 * data import), so a single `XLSX.read` anywhere would turn a tracked,
 * unreachable advisory into a reachable high on a path that takes a tenant
 * user's file.
 *
 * The disposition for those advisories (check-production-advisories.mjs, and
 * ITEM-0070) says "no read call remains". A sentence in a registry is not
 * enforcement; this test is. Parsing goes through ExcelJS —
 * ExcelExportService.parseFirstWorksheet and import-analysis.service.ts.
 *
 * It scans source text rather than the module graph on purpose: it must also
 * catch a read call in a file nothing imports yet.
 */

const SRC_ROOT = join(__dirname, '..', '..');
const ALLOWED_IMPORTER = join('common', 'excel', 'excel-export.service.ts');

const READ_SIDE_API =
  /\b(?:XLSX|xlsx|SheetJS)\s*\.\s*(?:read|readFile|readFileSync|parse|parse_xlml|stream)\b/;
const IMPORT_OF_XLSX =
  /(?:from\s+['"]xlsx['"]|require\(\s*['"]xlsx['"]\s*\)|import\(\s*['"]xlsx['"]\s*\))/;
const NAMED_READ_IMPORT =
  /import\s*\{[^}]*\b(?:read|readFile|readFileSync)\b[^}]*\}\s*from\s*['"]xlsx['"]/;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('xlsx is write-only (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9)', () => {
  const files = listSourceFiles(SRC_ROOT).map((file) => ({
    rel: relative(SRC_ROOT, file).split(sep).join('/'),
    code: stripComments(readFileSync(file, 'utf8')),
  }));

  it('scans a meaningful number of files (guards against a vacuous pass)', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(
      files.some((f) => f.rel === 'common/excel/excel-export.service.ts'),
    ).toBe(true);
  });

  it('no source file calls a SheetJS read/parse function', () => {
    const offenders = files
      .filter((f) => READ_SIDE_API.test(f.code))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('no source file imports a SheetJS read function by name', () => {
    const offenders = files
      .filter((f) => NAMED_READ_IMPORT.test(f.code))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('only the export service imports xlsx at all', () => {
    const importers = files
      .filter((f) => IMPORT_OF_XLSX.test(f.code))
      .map((f) => f.rel.replace(/\\/g, '/'));
    expect(importers).toEqual([ALLOWED_IMPORTER.split(sep).join('/')]);
  });
});
