/**
 * Refuse to run a writing flow against anything but a disposable local stack.
 *
 * Flows M and N create candidates, leave requests, projects and documents and
 * then delete them. Pointed at a real environment by a stray `E2E_API_URL`,
 * that is production data being written and removed. The older flows guard
 * this per-file; these checks are shared so one place decides, and they are
 * pure so a unit test can prove each refusal without touching a network.
 *
 * A request is only allowed when ALL of these hold:
 *  - every URL the run will touch is loopback (localhost, 127.0.0.1, ::1);
 *  - none is a `dijipeople.com` host, whatever else it resolves to;
 *  - the database named in `E2E_DATABASE_URL` is on loopback and its name carries
 *    a test marker (`_test` or `_e2e`);
 *  - the API says it is not a production deployment.
 *
 * `E2E_ALLOW_REMOTE_WRITES` is deliberately not a thing. A CI runner's database
 * and API are loopback too, so there is no legitimate remote case to allow.
 */

export type SafetyInput = {
  urls: Record<string, string | undefined>;
  databaseUrl: string | undefined;
  apiEnvironment?: string | null;
};

export type SafetyVerdict = { safe: true } | { safe: false; reasons: string[] };

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const PRODUCTION_HOST = /(^|\.)dijipeople\.com$/i;
const TEST_DB_MARKER = /(_test|_e2e)/i;

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function assessSafety(input: SafetyInput): SafetyVerdict {
  const reasons: string[] = [];

  for (const [label, value] of Object.entries(input.urls)) {
    if (!value) continue;
    const host = hostOf(value);
    if (!host) {
      reasons.push(`${label} is not a valid URL`);
    } else if (PRODUCTION_HOST.test(host)) {
      reasons.push(`${label} points at a production host (${host})`);
    } else if (!LOOPBACK.has(host)) {
      reasons.push(`${label} is not loopback (${host})`);
    }
  }

  if (!input.databaseUrl) {
    reasons.push(
      'E2E_DATABASE_URL is unset: the run cannot prove which database it writes to',
    );
  } else {
    const host = hostOf(input.databaseUrl.replace(/^postgres(ql)?:/, 'http:'));
    const name = (() => {
      try {
        return new URL(
          input.databaseUrl.replace(/^postgres(ql)?:/, 'http:'),
        ).pathname.replace(/^\//, '');
      } catch {
        return '';
      }
    })();
    if (!host || !LOOPBACK.has(host))
      reasons.push(`the database host is not loopback (${host ?? 'unparseable'})`);
    if (!TEST_DB_MARKER.test(name))
      reasons.push(
        `the database "${name}" has no test marker (_test or _e2e) in its name`,
      );
  }

  if (/prod/i.test(input.apiEnvironment ?? '')) {
    reasons.push(
      `the API reports environment "${input.apiEnvironment}", which is production`,
    );
  }

  return reasons.length === 0 ? { safe: true } : { safe: false, reasons };
}
