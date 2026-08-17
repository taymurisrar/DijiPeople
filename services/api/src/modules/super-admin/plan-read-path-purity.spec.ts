import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * REGRESSION — BUG-0030: reads must not initialise commercial state.
 *
 * `SuperAdminService.listPlans()` called `ensureDefaultPlans()`, which after
 * Wave 1 also created Markets and PlanPrices. Opening the Admin Plans screen
 * therefore wrote commercial configuration, and in production the insert hit
 * the partial unique index on PlanPrice and returned 409 to a `GET`.
 *
 * The behavioural proof lives in `test/commercial-bootstrap.e2e-spec.ts`, which
 * runs against real PostgreSQL. This suite is the cheap structural guard that
 * runs on every push: it reads the service source and asserts the read methods
 * contain no bootstrap call.
 *
 * Reading source text is unusual and deliberate. The alternative — mocking the
 * repository and asserting "create was not called" — passes just as happily
 * when someone moves the hidden write one layer deeper into a helper, which is
 * the specific mistake this defect invites. Naming the read methods and
 * checking what they may call catches the relocation too.
 */
describe('plan read paths are free of commercial writes', () => {
  const servicePath = join(__dirname, 'super-admin.service.ts');
  const source = readFileSync(servicePath, 'utf8');

  /** The body of a method, from its signature to the next top-level method. */
  function methodBody(name: string) {
    const signature = new RegExp(`\\n  (?:async )?${name}\\s*\\(`);
    const match = signature.exec(source);
    if (!match)
      throw new Error(`Method ${name} not found in super-admin.service.ts`);

    const start = match.index;
    // Next method at the same indentation level.
    const next =
      /\n {2}(?:private |public |protected )?(?:async )?[a-zA-Z]\w*\s*\(/g;
    next.lastIndex = start + match[0].length;
    const following = next.exec(source);

    return source.slice(start, following ? following.index : source.length);
  }

  const READ_METHODS = ['listPlans', 'getPlanDetail'];

  // Anything that would mutate persistent commercial state.
  const FORBIDDEN = [
    'ensureDefaultPlans',
    'ensureDefaultMarkets',
    'ensureAuthoritativePlanPrices',
    'bootstrapCommercialDefaults',
    'planPrice.create',
    'planPrice.update',
    'planPrice.upsert',
    'market.create',
    'plansRepository.create',
    'plansRepository.update',
  ];

  it.each(READ_METHODS)('%s calls no bootstrap or write', (method) => {
    const body = methodBody(method);

    for (const forbidden of FORBIDDEN) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('the ensure* methods that ran on the read path no longer exist', () => {
    // They moved to commercial-bootstrap.ts. Leaving them here, unused, would
    // invite a future caller to reattach one to a read path.
    expect(source).not.toContain('private async ensureDefaultPlans');
    expect(source).not.toContain('private async ensureDefaultMarkets');
    expect(source).not.toContain('private async ensureAuthoritativePlanPrices');
  });

  it('the plan write paths do not bootstrap either', () => {
    // Running a bootstrap inside a user's create/update is the same hidden
    // write one step along: an operator renaming a plan should not cause
    // markets and prices to appear.
    for (const method of ['createPlan', 'updatePlan']) {
      expect(methodBody(method)).not.toContain('ensureDefaultPlans');
    }
  });

  it('bootstrap is reachable only through an explicitly named method', () => {
    // One deliberate entry point, so "what can initialise commercial data" has
    // a single answer that grep can confirm.
    const occurrences = source.split('bootstrapCommercialDefaults').length - 1;
    // The import, the method declaration, and the call inside it.
    expect(occurrences).toBe(3);
  });
});
