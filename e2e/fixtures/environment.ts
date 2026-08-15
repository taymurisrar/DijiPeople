import { Client } from 'pg';

/**
 * What the browser suite needs from the world around it, and how it behaves
 * when that world is absent.
 *
 * The governing rule is that a missing environment must never look like a
 * product defect. A suite that fails with `ECONNREFUSED` when nobody started
 * the API teaches people to ignore it; a suite that silently passes teaches
 * them to trust it wrongly. So every prerequisite is probed up front, and an
 * unmet one produces an explicit skip naming what was missing — recorded as
 * `BROWSER_E2E = BLOCKED_INFRASTRUCTURE`, never as a pass.
 */

export type EnvironmentReport = {
  ready: boolean;
  missing: string[];
  detail: Record<string, string>;
};

/**
 * Credentials come from the environment and are never committed.
 *
 * There is no fallback password: a default would end up in the repository the
 * first time someone "just made it work", and a platform super admin is the
 * most privileged account this system has. The suite skips instead.
 */
export function platformCredentials() {
  const email = process.env.E2E_PLATFORM_ADMIN_EMAIL?.trim();
  const password = process.env.E2E_PLATFORM_ADMIN_PASSWORD;
  return email && password ? { email, password } : null;
}

/** A disposable database, or nothing. Never a developer's working database. */
export function databaseUrl() {
  const url = process.env.E2E_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) return null;
  /*
   * The same allowlist shape as scripts/assert-test-database.mjs, restated here
   * because this suite can be pointed at a staging URL by an environment
   * variable and must fail closed when it is.
   */
  const disposable = /(_test|_e2e|test_|e2e_)/i.test(url) && /localhost|127\.0\.0\.1/.test(url);
  return disposable ? url : null;
}

async function reachable(url: string, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeEnvironment(urls: {
  landing: string;
  admin: string;
  api: string;
}): Promise<EnvironmentReport> {
  const missing: string[] = [];
  const detail: Record<string, string> = {};

  const [landingUp, adminUp, apiUp] = await Promise.all([
    reachable(urls.landing),
    reachable(`${urls.admin}/login`),
    reachable(`${urls.api}/api/health`),
  ]);

  if (!landingUp) missing.push(`landing app at ${urls.landing}`);
  if (!adminUp) missing.push(`admin app at ${urls.admin}`);
  if (!apiUp) missing.push(`API at ${urls.api}`);
  detail.landing = landingUp ? 'up' : 'unreachable';
  detail.admin = adminUp ? 'up' : 'unreachable';
  detail.api = apiUp ? 'up' : 'unreachable';

  if (!platformCredentials()) {
    missing.push(
      'E2E_PLATFORM_ADMIN_EMAIL / E2E_PLATFORM_ADMIN_PASSWORD (no default exists by design)',
    );
    detail.credentials = 'absent';
  } else {
    detail.credentials = 'present';
  }

  const url = databaseUrl();
  if (!url) {
    missing.push('a disposable local database (E2E_DATABASE_URL)');
    detail.database = 'absent or not demonstrably disposable';
  } else {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query('select 1');
      detail.database = 'reachable';
    } catch (error) {
      missing.push('a reachable database');
      detail.database = error instanceof Error ? error.message : 'unreachable';
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  return { ready: missing.length === 0, missing, detail };
}

/**
 * Read-only assertions against the database, for facts a browser cannot see.
 *
 * Used to *verify* what the UI did — that a lead row exists, that exactly one
 * invoice was raised — never to perform a step the journey says a user
 * performs. Every mutation in these specs goes through the browser.
 */
export async function withDatabase<T>(
  work: (client: Client) => Promise<T>,
): Promise<T | null> {
  const url = databaseUrl();
  if (!url) return null;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Unique per run, so a failed run that skipped cleanup cannot collide. */
export const RUN_ID = `e2e${Date.now().toString(36)}`;
