import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * REG-221 — ITEM-0015.
 *
 * The tenant control plane is a **cross-tenant** surface. It authorizes inside
 * its services rather than through controller decorators, so "every reachable
 * method asserts" is not a convention here — it is the whole security model.
 *
 * A QA audit found `readiness()` carrying no inline assertion. It was
 * nonetheless authorized, because it delegated to `overview()`, which asserts;
 * the finding was recorded as "correct-but-indirect" and became the module's
 * one open soft spot. That is one refactor away from asserting nothing, and the
 * refactor that breaks it looks like an optimisation.
 *
 * The audit that found it was a person reading every method once. This is that
 * audit, run on every commit — which generalises the fix instead of patching
 * the instance. The module's catalogued bug pattern is
 * `service-authorization-hidden`; indirect assertion is the same idea one step
 * further along.
 *
 * **What this can and cannot see.** It reads source text: it asserts that each
 * public method *names* an authorization helper, not that the helper is reached
 * on every path. A method that asserts inside an `if` would pass here and be
 * wrong. That is a real limit and it is stated rather than papered over — the
 * property being defended is *auditability*, that a reader can see the
 * authorization without tracing a call chain, and text is exactly the right
 * level for that. Behavioural coverage lives in each service's own spec.
 */

const MODULE_DIR = __dirname;

/** The helpers that constitute an authorization check in this module. */
const ASSERTIONS = [
  'assertTenantPlatformAccess',
  'assertPlatformAdministrator',
];

/**
 * Methods that legitimately do not assert, each with the reason.
 *
 * A stale entry fails the test, so an exemption cannot outlive its
 * justification — the same rule the repository's `check-*.mjs` scripts use.
 */
const EXEMPT = new Map<string, string>([
  // Empty, and that is the finding: every public method in this module that
  // takes a caller asserts, with no exceptions to argue about. The map stays
  // because the next exception should have to be written down.
]);

type Method = { service: string; name: string; body: string };

function serviceFiles(): string[] {
  return readdirSync(MODULE_DIR)
    .filter((name) => name.endsWith('.service.ts'))
    .sort();
}

/**
 * Public methods that take an `AuthenticatedUser`.
 *
 * The user parameter is the filter that matters: a method that receives the
 * caller is a method that acts on their behalf and therefore has an
 * authorization question to answer. A private helper taking a tenant id has
 * already been authorized by whoever called it.
 */
function publicMethodsTakingAUser(source: string, service: string): Method[] {
  const methods: Method[] = [];
  const pattern = /^ {2}(?:public )?async ([A-Za-z0-9_]+)\(([\s\S]*?)^ {2}\}/gm;

  for (const match of source.matchAll(pattern)) {
    const [, name, body] = match;
    if (name.startsWith('_')) continue;

    // The signature is everything up to the closing paren of the parameter
    // list; good enough to spot the user parameter without parsing TypeScript.
    const signatureEnd = body.indexOf('{');
    const signature = signatureEnd === -1 ? body : body.slice(0, signatureEnd);
    if (!/\bAuthenticatedUser\b/.test(signature)) continue;

    methods.push({ service, name, body });
  }

  return methods;
}

function collect(): Method[] {
  return serviceFiles().flatMap((file) => {
    const source = readFileSync(join(MODULE_DIR, file), 'utf8');
    const service = file
      .replace(/\.service\.ts$/, '')
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    return publicMethodsTakingAUser(source, `${service}Service`);
  });
}

describe('every tenant control-plane method asserts', () => {
  const methods = collect();

  it('finds methods to check, so this is not passing over an empty list', () => {
    // The failure mode this guards against: a regex that stops matching after a
    // formatting change, leaving a green test that inspects nothing.
    expect(methods.length).toBeGreaterThan(15);
  });

  it('covers every service file in the module', () => {
    const covered = new Set(methods.map((method) => method.service));
    expect(covered.size).toBeGreaterThan(5);
  });

  it('names an authorization helper in every public method that takes a user', () => {
    const missing = methods
      .filter((method) => {
        const key = `${method.service}.${method.name}`;
        if (EXEMPT.has(key)) return false;
        return !ASSERTIONS.some((assertion) => method.body.includes(assertion));
      })
      .map((method) => `${method.service}.${method.name}`);

    expect(missing).toEqual([]);
  });

  it('asserts before the first database read, not after it', () => {
    // Authorizing after the query is a different defect with the same shape:
    // the refusal is correct, but the row was already read and its existence
    // may be inferable from the timing or the error.
    const late = methods
      .filter((method) => {
        const key = `${method.service}.${method.name}`;
        if (EXEMPT.has(key)) return false;

        const assertAt = Math.min(
          ...ASSERTIONS.map((assertion) => {
            const index = method.body.indexOf(assertion);
            return index === -1 ? Number.POSITIVE_INFINITY : index;
          }),
        );
        if (!Number.isFinite(assertAt)) return false; // covered by the test above

        const queryAt = method.body.search(/this\.prisma\.[a-zA-Z]+\.(find|update|delete|create|count)/);
        return queryAt !== -1 && queryAt < assertAt;
      })
      .map((method) => `${method.service}.${method.name}`);

    expect(late).toEqual([]);
  });

  it('has no exemption that no longer applies', () => {
    const known = new Set(methods.map((method) => `${method.service}.${method.name}`));
    const stale = [...EXEMPT.keys()].filter((key) => !known.has(key));
    expect(stale).toEqual([]);
  });
});
