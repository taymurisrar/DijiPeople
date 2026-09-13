import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  isAvailableEvent,
  isRetiredEventCode,
  NOTIFICATION_EVENT_CATALOG,
} from './notification-events.catalog';
import {
  EVENTS_WITHOUT_EMITTER,
  NOTIFICATION_EVENT_DELIVERY,
  resolveEventModuleKey,
} from './notification-event-delivery';

/**
 * ITEM-0180 — the delivery declarations are statements about call sites, so
 * they are checked against the call sites.
 *
 * The events page hides an event, or a channel, on the strength of
 * `NOTIFICATION_EVENT_DELIVERY`. A declaration that outlives its emitter puts a
 * toggle wired to nothing back on the page (declared-but-unwired-step); an
 * event nobody placed in either list vanishes from it silently. Before this,
 * `availability: ACTIVE` was the only signal, and it called claims, loans,
 * timesheets and six payroll events live when nothing delivered them.
 *
 * Source-level on purpose: the question is "does a call site exist", which no
 * amount of executing the service can answer. Plain `includes` only — a
 * newline-literal regex matches nothing on a CRLF checkout.
 */

const MODULES_ROOT = join(__dirname, '..');

/*
 * Files that name event codes without sending them: the catalog and this
 * declaration describe events, the payroll notification service declares
 * a type union of every payroll code it *could* be called with, and the
 * system template copy (BUG-3500) is authored content keyed by `eventCode` —
 * a DRAFT template for an event nothing sends is still copy, not a call site.
 */
const NON_EMITTING_FILES = new Set([
  'notifications/notification-events.catalog.ts',
  'notifications/notification-event-delivery.ts',
  'notifications/system-email-templates.copy.ts',
  'payroll/payroll-notification.service.ts',
]);

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) return [];
    return [path];
  });
}

const SOURCES = listSourceFiles(MODULES_ROOT)
  .map((path) => ({
    file: relative(MODULES_ROOT, path).split(sep).join('/'),
    text: readFileSync(path, 'utf8'),
  }))
  .filter((source) => !NON_EMITTING_FILES.has(source.file));

const LIVE_CATALOG = NOTIFICATION_EVENT_CATALOG.filter(
  (event) => !isRetiredEventCode(event.code) && isAvailableEvent(event),
);

/*
 * An occurrence of the quoted code shortly after something that sends a
 * notification. Used for the negative check, where a bare string match would
 * trip on unrelated uses — `'PAYROLL_PROCESSED'` is also a timesheet status.
 */
function emitterShapedOccurrences(text: string, code: string) {
  const needle = `'${code}'`;
  const hits: number[] = [];
  let index = text.indexOf(needle);
  while (index !== -1) {
    const before = text.slice(Math.max(0, index - 300), index);
    if (
      /eventCode|eventKey|notifyPayroll|\.dispatch\(|\.emit\(|sendTemplateEmail/.test(
        before,
      )
    ) {
      hits.push(index);
    }
    index = text.indexOf(needle, index + needle.length);
  }
  return hits;
}

describe('notification event delivery declarations (ITEM-0180)', () => {
  it('places every live catalog event in exactly one of the two lists', () => {
    const misplaced = LIVE_CATALOG.map((event) => ({
      code: event.code,
      placements:
        Number(event.code in NOTIFICATION_EVENT_DELIVERY) +
        Number(EVENTS_WITHOUT_EMITTER.has(event.code)),
    })).filter((entry) => entry.placements !== 1);

    expect(misplaced).toEqual([]);
  });

  it('declares nothing for a code that is retired, unavailable or not in the catalog', () => {
    const live = new Set(LIVE_CATALOG.map((event) => event.code));
    const stray = [
      ...Object.keys(NOTIFICATION_EVENT_DELIVERY),
      ...EVENTS_WITHOUT_EMITTER,
    ].filter((code) => !live.has(code));

    expect(stray).toEqual([]);
  });

  it('resolves every live catalog event to a page module', () => {
    const ungrouped = LIVE_CATALOG.filter(
      (event) => resolveEventModuleKey(event.code) === null,
    ).map((event) => event.code);

    expect(ungrouped).toEqual([]);
  });

  it('finds a call site for every declared emitter, in the module the rule is keyed on', () => {
    const missing: string[] = [];
    for (const [code, delivery] of Object.entries(
      NOTIFICATION_EVENT_DELIVERY,
    )) {
      const files = SOURCES.filter((source) =>
        source.text.includes(`'${code}'`),
      );
      if (!files.length) {
        missing.push(`${code}: no source names it`);
        continue;
      }

      const inApp = delivery.inApp;
      if (
        inApp?.via === 'RULE' &&
        !files.some((source) =>
          source.text.includes(`moduleKey: '${inApp.moduleKey}'`),
        )
      ) {
        // emit() only matches a rule on the exact moduleKey it is called
        // with, so a declaration naming the wrong one hides a working event.
        missing.push(`${code}: no emitter uses moduleKey '${inApp.moduleKey}'`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('finds no sending call site for an event declared as having no emitter', () => {
    const wired = [...EVENTS_WITHOUT_EMITTER].flatMap((code) =>
      SOURCES.filter(
        (source) => emitterShapedOccurrences(source.text, code).length > 0,
      ).map((source) => `${code} in ${source.file}`),
    );

    expect(wired).toEqual([]);
  });

  it('proves the negative check can fail', () => {
    // A check that can never fire proves nothing; this is the shape it exists
    // to catch.
    const wiredLater = `await this.notifyPayroll(user, 'PAYROLL_CALCULATION_FAILED', {});`;
    expect(
      emitterShapedOccurrences(wiredLater, 'PAYROLL_CALCULATION_FAILED'),
    ).toHaveLength(1);
    expect(
      emitterShapedOccurrences(
        `const statuses = ['APPROVED', 'PAYROLL_PROCESSED'];`,
        'PAYROLL_PROCESSED',
      ),
    ).toHaveLength(0);
  });
});
