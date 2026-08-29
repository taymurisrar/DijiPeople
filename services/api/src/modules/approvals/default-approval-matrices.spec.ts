import { DEFAULT_APPROVAL_MATRICES } from './default-approval-matrices';

/**
 * ITEM-0113 — a seeded chain a new tenant cannot satisfy is worse than no chain.
 *
 * Every matched step in an approval chain must bind to an active approver or the
 * whole submission is refused (BUG-1968). The shipped seed gave every tenant two
 * active leave steps — `LINE_MANAGER`, then `ROLE(hr)` — and a newly provisioned
 * tenant satisfies neither: nobody has a reporting manager, and nobody holds
 * `hr`. Leave was blocked on day one for every customer, by default rather than
 * by misconfiguration, and nothing could have told us: the seed had no test
 * because the constant lived in a file no spec could import.
 *
 * What this file pins is the property, not the current contents: **a seeded
 * chain's active steps must be bindable on a tenant that has just been
 * provisioned and has done nothing else.**
 *
 * Only one approver type qualifies. `LINE_MANAGER` needs a reporting hierarchy,
 * which provisioning does not create. `ROLE(hr)`, or any other role, needs
 * somebody in it. `system-admin` is the single role `provisionTenantForCustomer`
 * assigns — to the tenant owner, throwing if it cannot — so it is the only role
 * a chain may rely on without the administrator doing something first.
 */

/*
 * Roles provisioning guarantees a member for. Keep this list honest rather than
 * convenient: adding a role here that provisioning does not actually populate
 * would make this test pass and leave the defect in place, which is exactly the
 * failure it exists to catch.
 */
const ROLES_PROVISIONING_GUARANTEES = new Set(['system-admin']);

type Step = (typeof DEFAULT_APPROVAL_MATRICES)[number]['steps'][number];

function isActive(step: Step) {
  return step.isActive ?? true;
}

function bindableOnAFreshTenant(step: Step) {
  if (step.approverType !== 'ROLE') return false;
  return Boolean(
    step.roleKey && ROLES_PROVISIONING_GUARANTEES.has(step.roleKey),
  );
}

describe('ITEM-0113 — the seeded approval chains', () => {
  it('seeds a chain for each module that has one', () => {
    // Guards the guard: an empty constant would make every assertion below vacuous.
    expect(DEFAULT_APPROVAL_MATRICES.length).toBeGreaterThan(0);
    expect(
      DEFAULT_APPROVAL_MATRICES.every((matrix) => matrix.steps.length > 0),
    ).toBe(true);
  });

  it.each(DEFAULT_APPROVAL_MATRICES.map((m) => [m.moduleKey, m] as const))(
    '%s has at least one active step that binds on a fresh tenant',
    (_moduleKey, matrix) => {
      const active = matrix.steps.filter(isActive);
      expect(active.length).toBeGreaterThan(0);
      expect(active.some(bindableOnAFreshTenant)).toBe(true);
    },
  );

  it.each(
    DEFAULT_APPROVAL_MATRICES.flatMap((m) =>
      m.steps
        .filter(isActive)
        .map((s) => [`${m.moduleKey}: ${s.name}`, s] as const),
    ),
  )('%s is bindable, because every active step must be', (_label, step) => {
    /*
     * The load-bearing assertion, and stricter than the one above on purpose.
     * "At least one active step binds" is not enough: **every** matched step
     * must bind or the submission is refused, so a single unbindable active
     * step blocks the chain no matter what sits beside it. That is precisely
     * what the old seed got wrong — sequence 1 was satisfiable in principle and
     * sequence 2 was not, and the whole thing was dead.
     */
    expect(bindableOnAFreshTenant(step)).toBe(true);
  });

  it('keeps the richer chain as an inactive template rather than dropping it', () => {
    /*
     * The line-manager chain is good guidance and shipping nothing would leave
     * an administrator with a blank Approval Matrices screen. It is seeded
     * inactive so it is visible and switched on once reporting lines exist.
     */
    const templates = DEFAULT_APPROVAL_MATRICES.flatMap((m) =>
      m.steps.filter((s) => !isActive(s)),
    );
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some((s) => s.approverType === 'LINE_MANAGER')).toBe(true);
    expect(templates.some((s) => s.roleKey === 'hr')).toBe(true);
  });
});
