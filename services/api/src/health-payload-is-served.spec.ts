import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const MAIN = normalized(join(__dirname, 'main.ts'));

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * BUG-0904 — the health field that shipped and did nothing.
 *
 * `AppService.getHealth()` was extended to report `outboxWorker.enabled`, so
 * that a deployment silently not draining its outbox could be detected from
 * outside. `app.service.spec.ts` passed, `app.controller.spec.ts` passed, CI
 * passed, the release deployed — and `GET /api/health` did not contain the
 * field.
 *
 * `main.ts` registers express handlers for `/`, `/api` and `/api/health`
 * *before* Nest's router, so `AppController` never answers those three paths in
 * production. Both specs asserted a code path nothing reaches.
 *
 * The lesson this file exists to hold: a health payload has two producers, and
 * the one under test was not the one being served. So the assertions here are
 * about the handler that actually answers.
 */
describe('BUG-0904 — the served health payload reports the outbox worker', () => {
  const code = codeOnly(MAIN);

  it('builds the express payload from the worker, not only the env', () => {
    expect(code).toContain(
      'outboxWorker: { enabled: outboxWorker.isEnabled() }',
    );
  });

  it('resolves the worker from the container', () => {
    /*
     * Rather than reading `OUTBOX_WORKER_ENABLED` here a second time. The
     * question is what the running process decided, and a second reading of
     * the same variable can drift from the first — which is the whole shape of
     * the drift this field exists to expose.
     */
    expect(code).toContain('app.get(OutboxWorkerService');
  });

  it('serves the same payload from every path it answers', () => {
    // All three bypass Nest, so all three have to carry it.
    for (const route of ["'/'", "'/api'", "'/api/health'"]) {
      expect([route, code.includes(`expressApp.get(${route}`)]).toEqual([
        route,
        true,
      ]);
    }
    const calls = code.match(/res\.json\(healthPayload\(\)\)/g) ?? [];
    expect(calls).toHaveLength(3);
  });

  it('keeps the runtime payload it always carried', () => {
    // The field is additive. Losing commit or status to gain outboxWorker
    // would break the release records that read them.
    expect(code).toContain('...getRuntimeHealthPayload(process.env)');
  });

  /*
   * The guard against the actual mistake. `AppController` is fine and its spec
   * is fine; what was missing was any assertion that the code under test is the
   * code being served. If these express routes are ever removed so Nest answers
   * them, this fails and points at the reason.
   */
  it('records that these paths bypass the Nest controller', () => {
    expect(MAIN).toMatch(
      /answer before Nest's router|bypass|AppController` is\s*\n\s*\* not what serves/,
    );
  });
});
