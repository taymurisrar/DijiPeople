import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-1748 — the subscription record page could not name its own tenant.
 *
 * The list endpoint loaded `tenant` and `plan` and projected them; the record
 * endpoint fell through to a bare `findUnique` with no `include` at all. The
 * ids were in the payload and nothing resolved them, so a subscription showed
 * Tenant, Plan and Price as "Not set" one screen after the list had rendered
 * all three correctly.
 *
 * Two endpoints answering the same question differently is the defect, so what
 * is asserted here is that they cannot: both go through one include and one
 * projection. That is a structural claim about the source, which is why it is
 * read rather than executed — the alternative is a database.
 */

const SUPER_ADMIN = join(__dirname, 'super-admin.service.ts');
const RUNTIME = join(
  __dirname,
  '../platform-runtime/platform-runtime.service.ts',
);

describe('BUG-1748 — subscription list and record agree', () => {
  const superAdmin = readFileSync(SUPER_ADMIN, 'utf8');
  const runtime = readFileSync(RUNTIME, 'utf8');

  it('declares the relations once', () => {
    expect(superAdmin).toContain('SUBSCRIPTION_INCLUDE');
    for (const relation of ['tenant', 'plan', 'planPrice']) {
      expect([
        relation,
        new RegExp(
          `SUBSCRIPTION_INCLUDE\\s*=\\s*\\{[\\s\\S]*?\\b${relation}\\b[\\s\\S]*?\\}\\s*as const`,
        ).test(superAdmin),
      ]).toEqual([relation, true]);
    }
  });

  it('uses that one include for both the list and the single record', () => {
    const uses = superAdmin.match(
      /include:\s*SuperAdminService\.SUBSCRIPTION_INCLUDE/g,
    );
    expect(uses?.length).toBe(2);
    expect(superAdmin).toContain('async getSubscription(');
    expect(superAdmin).toContain('async listSubscriptions(');
  });

  it('projects both through the same function', () => {
    const uses = superAdmin.match(/this\.projectSubscription\(/g);
    expect(uses?.length).toBe(2);
  });

  it('the runtime record path no longer bare-fetches a subscription', () => {
    expect(runtime).toContain('this.superAdmin.getSubscription(id)');
    // The generic fallback must no longer claim subscriptions, or the fix is
    // one reordering away from being bypassed again.
    expect(runtime).not.toMatch(
      /const model\s*=\s*\r?\n?\s*key === 'subscriptions'/,
    );
  });
});

/*
 * The price label is asserted separately because it is a different failure: a
 * per-seat amount rendered as a bare number reads as the whole bill, which is
 * wrong by the seat count. 300 against 25 seats is not 300.
 */
describe('BUG-1748 — a plan price says what it is per', () => {
  const superAdmin = readFileSync(SUPER_ADMIN, 'utf8');

  it('composes a label rather than leaving the lookup unresolved', () => {
    expect(superAdmin).toContain('function describePlanPrice(');
    expect(superAdmin).toMatch(
      /label:\s*`\$\{amount\}\$\{per\}\s*\/\s*\$\{cycle\}`/,
    );
  });

  it('names the seat unit and the cadence', () => {
    expect(superAdmin).toContain("'PER_SEAT' ? ' per seat' : ''");
    expect(superAdmin).toContain("'ANNUAL' ? 'year' : 'month'");
  });
});
