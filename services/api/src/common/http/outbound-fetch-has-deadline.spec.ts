import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { STRIPE_REQUEST_TIMEOUT_MS } from '../../modules/billing/services/stripe-billing.service';

/**
 * BUG-3199. An outbound `fetch` with no deadline holds a request thread, and
 * usually a database connection, for as long as the remote end chooses. The
 * single-instance API has no room for that, so every `fetch(` in production code
 * must carry an abort signal. This reads the source, so a call added later fails
 * here instead of in an outage.
 *
 * It looks for `signal` within the call's argument list, which is how every
 * existing deadline is written (`AbortSignal.timeout(...)` or a controller's
 * signal). A call that genuinely needs none must be listed with a reason.
 */
const SRC = join(__dirname, '..', '..');
const ALLOWED_WITHOUT_SIGNAL: Readonly<Record<string, string>> = {};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (
      path.endsWith('.ts') &&
      !path.endsWith('.spec.ts') &&
      !path.endsWith('.d.ts')
    ) {
      out.push(path);
    }
  }
  return out;
}

/** The text of the call starting at `start` (the "(" after `fetch`). */
function callText(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

describe('outbound fetch deadlines (BUG-3199)', () => {
  it('every fetch() call in production code carries an abort signal', () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const file of sourceFiles(SRC)) {
      // Comments are blanked (line breaks kept) so prose that mentions
      // `fetch()` is not mistaken for a call; `://` in URLs is left alone.
      const source = readFileSync(file, 'utf8').replace(
        /\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm,
        (comment) => comment.replace(/[^\n]/g, ' '),
      );
      const pattern = /(?<![.\w])fetch\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        seen += 1;
        const call = callText(source, match.index + match[0].length - 1);
        const where = `${relative(SRC, file)}:${
          source.slice(0, match.index).split('\n').length
        }`;
        if (!/signal/.test(call) && !ALLOWED_WITHOUT_SIGNAL[where]) {
          offenders.push(where);
        }
      }
    }
    // The scan must actually find the calls it is meant to guard.
    expect(seen).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('the Stripe client has a bounded request deadline', () => {
    expect(STRIPE_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    expect(STRIPE_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});
