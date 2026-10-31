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

/** Desktop agent: Enterprise, or Custom only when explicitly enabled. Open: Enterprise+ (Q2). */
export const DESKTOP_AGENT_ENABLED: Record<'starter' | 'growth' | 'enterprise', boolean> = { starter: false, growth: false, enterprise: true };
