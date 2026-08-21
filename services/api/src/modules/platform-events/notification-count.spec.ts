import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NOTIFICATION_SCAN_LIMIT } from './platform-events.service';

const source = readFileSync(
  join(__dirname, 'platform-events.service.ts'),
  'utf8',
);

/**
 * The unread count must not depend on the page size.
 *
 * The badge polls with `limit=1`; opening the popover asks for six. The scan was
 * `take: limit * 20`, so the same reader was counted over twenty events and
 * then over a hundred and twenty — no badge on sign-in, a count the moment the
 * bell was clicked. Reported exactly that way.
 *
 * The comment above the return claimed the count was computed "over everything
 * in the window, not over the page". It excluded the page *slice*; the window
 * itself was the page size times twenty. The code read as correct to anybody
 * who read the comment first, which is why this asserts the query rather than
 * the prose.
 *
 * Structural, because the alternative is a Prisma client and ninety days of
 * fixture events to assert one multiplication that should not exist.
 */
/**
 * Comments are stripped first.
 *
 * The comment explaining what `take: limit * 20` used to be contains the very
 * string this asserts is absent — so a scan of the raw source reports the fix
 * as the bug. `z-layers.spec.ts` learned the same lesson; it is worth stating
 * twice, because a structural assertion over source will meet it every time.
 */
function stripComments(input: string) {
  return input.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('notification unread count', () => {
  const notifications = stripComments(
    source.slice(
      source.indexOf('async notifications('),
      source.indexOf('async markNotificationsRead('),
    ),
  );

  it('scans a fixed number of events, never a multiple of the page size', () => {
    expect(notifications).toContain('take: NOTIFICATION_SCAN_LIMIT');
    expect(notifications).not.toMatch(/take:\s*limit\s*\*/);
  });

  it('still slices the page from the scan, so `limit` means something', () => {
    // The page size must keep bounding the payload; only the *count* is freed
    // from it. Dropping the slice would send hundreds of rows to a badge.
    expect(notifications).toContain('items.slice(0, limit)');
  });

  it('scans far enough for the notifiable subset to be found', () => {
    /*
     * Most platform events are not notifiable — sign-ins, saved views, exports
     * — so a narrow scan finds nothing and reports zero unread with confidence.
     * The old effective width for the badge was twenty.
     */
    expect(NOTIFICATION_SCAN_LIMIT).toBeGreaterThanOrEqual(500);
  });

  it('reports when the scan was truncated, rather than implying a total', () => {
    /*
     * "Notifiable" is a rule over the event code and result evaluated in
     * TypeScript, so it cannot be a database `count` and the scan must be
     * bounded. Being bounded is fine; being bounded silently is not — the badge
     * renders `99+` for a truncated scan rather than an exact number nothing
     * stands behind.
     */
    expect(notifications).toContain('scanTruncated');
    expect(notifications).toContain('rows.length >= NOTIFICATION_SCAN_LIMIT');
  });

  it('bounds the window by time as well as by row count', () => {
    // Both bounds matter: the time window keeps this one indexed range scan,
    // and the row cap keeps a busy platform from paying for all of it.
    expect(notifications).toContain('occurredAt: { gte: since }');
  });
});
