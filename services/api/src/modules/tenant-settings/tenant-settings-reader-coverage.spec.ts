import fs from 'node:fs';
import path from 'node:path';
import {
  INERT_TENANT_SETTING_KEYS,
  INERT_KEYS_WITH_PENDING_UI_REMOVAL,
} from './tenant-settings-dispositions';
import { DEFAULT_TENANT_SETTINGS } from './tenant-settings.catalog';

/**
 * BUG-1974 — the structural guard.
 *
 * The catalog declared 591 keys. 246 had no reader anywhere in the monorepo and
 * 230 of those were rendered as live, editable controls: an administrator
 * changed one, it was validated, stored, cached, audited and echoed back, the
 * screen said saved, the value survived a reload — and nothing ever read it.
 *
 * Nothing failed when a key gained a control without gaining a reader, which is
 * why the set could only grow. This is the check that stops it, and it is the
 * durable half of the fix; the cleanup is the perishable half.
 *
 * It fails in four directions on purpose:
 *
 *   1. a declared key that nothing reads and that is not listed as inert
 *   2. a key listed as inert that something now reads — the list must not rot
 *   3. an editable control for an inert key
 *   4. an inert entry naming a key the catalog no longer declares
 *
 * (2) and (4) matter as much as (1). An allow-list that is never checked back
 * against reality becomes a place to hide new instances of the defect, which is
 * exactly what the settings catalog itself had become.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const CATALOG =
  'services/api/src/modules/tenant-settings/tenant-settings.catalog.ts';
const DISPOSITIONS =
  'services/api/src/modules/tenant-settings/tenant-settings-dispositions.ts';
const SETTINGS_UI_DIR = 'apps/web/app/(authenticated)/settings/_lib';
const UI_FILES = [
  `${SETTINGS_UI_DIR}/settings-page-config.ts`,
  `${SETTINGS_UI_DIR}/organization-settings-config.ts`,
];

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  'coverage',
  'out',
  'bin',
  'obj',
]);

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.cs',
  '.sql',
  '.prisma',
]);

const NUL = String.fromCharCode(0);

function listCodeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      listCodeFiles(full, acc);
      continue;
    }
    if (!CODE_EXTENSIONS.has(path.extname(entry.name))) continue;
    acc.push(full);
  }
  return acc;
}

/**
 * A file that mentions a key without honouring it is not a reader.
 *
 * The catalog declares the keys; the dispositions file lists the dead ones by
 * name, so counting it would make every inert key look alive; the two settings
 * UI config files are the *controls*, which is the surface under suspicion
 * rather than evidence of a reader; specs, `e2e/` and documentation describe
 * rather than implement.
 */
function isReaderCandidate(relative: string): boolean {
  const unix = relative.split(path.sep).join('/');
  if (unix === CATALOG || unix === DISPOSITIONS) return false;
  if (unix.startsWith(`${SETTINGS_UI_DIR}/`)) return false;
  if (unix.startsWith('e2e/') || unix.startsWith('docs/')) return false;
  if (/\.(spec|test)\.tsx?$/.test(unix)) return false;
  return true;
}

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/** Every identifier appearing in a file that could honour a setting. */
function buildReaderIndex(): Set<string> {
  const found = new Set<string>();
  for (const full of listCodeFiles(REPO_ROOT)) {
    const relative = path.relative(REPO_ROOT, full);
    if (!isReaderCandidate(relative)) continue;
    let text: string;
    try {
      if (fs.statSync(full).size > 4_000_000) continue;
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    // Skip anything that decoded as binary rather than source.
    if (text.includes(NUL)) continue;
    IDENTIFIER.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IDENTIFIER.exec(text))) found.add(match[0]);
  }
  return found;
}

/**
 * The `(category, key)` pairs rendered as editable controls.
 *
 * A pair test rather than a token test, because keys share names across
 * categories — the same confusion that produced BUG-1977. The two factory
 * helpers are read explicitly: a parser that only understands object literals
 * misses `timesheetField(...)` and `payrollValidationField(...)`, and would have
 * reported most of the timesheets and payroll surface as having no control.
 */
function collectEditableUiPairs(): Set<string> {
  const pairs = new Set<string>();
  for (const relative of UI_FILES) {
    const source = fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
    const literal =
      /category:\s*["']([\w$]+)["'],\s*(?:\r?\n)?\s*key:\s*["']([\w$]+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = literal.exec(source))) {
      pairs.add(`${match[1]}.${match[2]}`);
    }
    for (const call of source.matchAll(
      /\btimesheetField\(\s*["']([\w$]+)["']/g,
    )) {
      pairs.add(`timesheets.${call[1]}`);
    }
    for (const call of source.matchAll(
      /\bpayrollValidationField\(\s*["']([\w$]+)["']/g,
    )) {
      pairs.add(`payroll.${call[1]}`);
    }
  }
  return pairs;
}

const catalogPairs: string[] = [];
for (const [category, keys] of Object.entries(DEFAULT_TENANT_SETTINGS)) {
  for (const key of Object.keys(keys)) catalogPairs.push(`${category}.${key}`);
}

let readerIndex: Set<string>;
let editableUiPairs: Set<string>;

beforeAll(() => {
  readerIndex = buildReaderIndex();
  editableUiPairs = collectEditableUiPairs();
});

const keyOf = (pair: string) => pair.slice(pair.indexOf('.') + 1);

describe('tenant settings catalog reader coverage', () => {
  it('finds a corpus to scan at all', () => {
    // An empty index would make every assertion below pass vacuously, which is
    // the failure mode a check like this dies of.
    expect(readerIndex.size).toBeGreaterThan(10_000);
    expect(editableUiPairs.size).toBeGreaterThan(100);
    expect(catalogPairs.length).toBeGreaterThan(500);
  });

  it('every declared key is either read in production code or declared inert', () => {
    const undeclared = catalogPairs.filter(
      (pair) =>
        !readerIndex.has(keyOf(pair)) &&
        !Object.prototype.hasOwnProperty.call(INERT_TENANT_SETTING_KEYS, pair),
    );

    expect(undeclared).toEqual([]);
  });

  it('no key declared inert is actually read', () => {
    // Keeps the allow-list honest. When someone writes the reader, this fails
    // and tells them to delete the line — which is how a key comes back to life
    // and how its control returns.
    const nowRead = Object.keys(INERT_TENANT_SETTING_KEYS).filter((pair) =>
      readerIndex.has(keyOf(pair)),
    );

    expect(nowRead).toEqual([]);
  });

  it('no inert key is rendered as an editable control', () => {
    const pendingRemoval = new Set(INERT_KEYS_WITH_PENDING_UI_REMOVAL);
    const stillEditable = Object.keys(INERT_TENANT_SETTING_KEYS).filter(
      (pair) => editableUiPairs.has(pair) && !pendingRemoval.has(pair),
    );

    expect(stillEditable).toEqual([]);
  });

  it('the only controls left over an inert key are the deferred attendance ones', () => {
    /*
     * The temporary exemption, pinned so it cannot quietly widen. These belong
     * to the concurrent attendance settings work (BUG-1978, BUG-1979, BUG-1980,
     * BUG-1981, BUG-2091). When that lands the list empties and this becomes an
     * assertion that nothing is exempt.
     */
    for (const pair of INERT_KEYS_WITH_PENDING_UI_REMOVAL) {
      expect(pair.startsWith('attendance.')).toBe(true);
      expect(INERT_TENANT_SETTING_KEYS[pair]).toBe('DEFERRED_ATTENDANCE_WORK');
    }
  });

  it('every inert entry names a key the catalog still declares', () => {
    // A stale entry is worse than no entry: it silently exempts nothing while
    // reading as though a decision had been recorded.
    const catalogSet = new Set(catalogPairs);
    const stale = Object.keys(INERT_TENANT_SETTING_KEYS).filter(
      (pair) => !catalogSet.has(pair),
    );

    expect(stale).toEqual([]);
  });
});
