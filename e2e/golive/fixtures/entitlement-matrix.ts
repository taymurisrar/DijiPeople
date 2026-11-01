/**
 * The approved entitlement matrix as the QA suite understands it (single source for ENT-030 and 23-entitlement-matrix).
 * Updated ONLY from an owner-approved requirement or the development handoff - never from observing a build.
 * RUN-006 requirements (2026-10-31): basic import/export/templates on all plans; advanced data management premium; desktop agent Enterprise or explicitly enabled Custom;
 * essential branded transactional e-mails on all plans; advanced e-mail customization Growth+; white-label Enterprise/Custom.
 */
export const STARTER_BASE = ['attendance', 'branding', 'documents', 'employees', 'leave', 'notifications', 'organization'] as const;

/** Feature keys the development handoff adds to Starter (e.g. a basic data-management key). EMPTY until Session 2 names them: an unexpected extra key must fail ENT-030, not be absorbed. */
export const APPROVED_STARTER_ADDITIONS: readonly string[] = ['data-import-export']; // owner answer Q6 (RUN-006 dispatch): the only new Starter key

/** Features a Starter tenant must NOT have (anything else a plan sells above Starter). */
export const NEVER_ON_STARTER = ['recruitment', 'onboarding', 'timesheets', 'projects', 'payroll', 'compliance', 'attendance-integrations', 'desktop-agent', 'advanced-data-management', 'email-template-customization', 'email-white-label'] as const;

/** Desktop agent: Enterprise, or a Custom plan that EXPLICITLY lists `desktop-agent`. There is no `enterprise-plus` (owner FINAL decision 2026-11-01: exactly three predefined plans). */
export const DESKTOP_AGENT_ENABLED: Record<'starter' | 'growth' | 'enterprise', boolean> = { starter: false, growth: false, enterprise: true };

/**
 * Customer-visible API probe per feature key: a tenant on a plan WITHOUT the feature must be refused (402/403); a tenant WITH it must not be plan-refused.
 * Used by the Custom-plan suites to prove a Custom plan grants exactly what it lists - nothing inherited from Enterprise.
 */
export const FEATURE_PROBES: Record<string, string> = {
  employees: '/employees?pageSize=1',
  leave: '/leave-requests/mine',
  documents: '/documents',
  projects: '/projects',
  payroll: '/payroll/runs',
  timesheets: '/timesheets/entries',
  recruitment: '/job-openings',
  onboarding: '/onboarding/templates',
};
/** Public/catalogue facts of the owner FINAL subscription architecture. */
export const EXPECTED_PREDEFINED_PLANS = ['starter', 'growth', 'enterprise'] as const;
