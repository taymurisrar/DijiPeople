/*
 * Which list views each platform module can actually honour, and what they mean.
 *
 * Every module built through the registry's `simple()` helper used to be given
 * the same three tabs — All, Active, My Records — regardless of whether the
 * underlying model could support them. "Active" filtered on a hardcoded
 * ACTIVE/TRIALING/PAID set that matches almost none of these models, and
 * "My Records" was read by nothing at all, so all three tabs returned identical
 * rows. Tabs that look like filters and behave like decoration are worse than
 * no tabs, so the rules live here, once, and both the admin registry and the
 * API read them.
 *
 * `active` names the open or in-flight subset, which is rarely the literal
 * string "ACTIVE" — an outstanding invoice and a pending commission are the
 * useful default. Modules whose status is free text, or which have no owner
 * column, simply omit the view rather than offering an empty one.
 *
 * Status values are checked against the generated schema manifest by
 * platform-runtime-views.test.js, so a renamed enum member fails the build
 * instead of silently emptying a tab.
 */

/**
 * @typedef {{ label: string, field: string, values?: unknown[] }} RuntimeViewRule
 * @typedef {{ active?: RuntimeViewRule, 'my-records'?: RuntimeViewRule }} RuntimeViewRules
 */

const ASSIGNED_TO_ME = { label: 'Assigned to me', field: 'assignedToUserId' };
const CREATED_BY_ME = { label: 'Created by me', field: 'createdById' };

/*
 * Leads, partners, contracts, support cases and monitoring incidents are
 * absent on purpose: each declares its own views in the registry and handles
 * those keys itself, so a rule here would be read by nothing while implying
 * otherwise.
 *
 * @type {Record<string, RuntimeViewRules>}
 */
const PLATFORM_MODULE_VIEW_RULES = {
  'partner-inquiries': {
    active: {
      label: 'Open',
      field: 'status',
      values: ['NEW', 'QUALIFYING', 'QUALIFIED'],
    },
    'my-records': ASSIGNED_TO_ME,
  },
  'partner-onboarding': {
    active: {
      label: 'In progress',
      field: 'status',
      values: [
        'INVITED',
        'IN_PROGRESS',
        'SUBMITTED',
        'UNDER_REVIEW',
        'CHANGES_REQUESTED',
      ],
    },
    /* No owner column on PartnerOnboarding, so no personal view. */
  },
  customers: {
    active: { label: 'Active', field: 'status', values: ['ACTIVE'] },
    'my-records': ASSIGNED_TO_ME,
  },
  'customer-onboarding': {
    active: {
      label: 'In progress',
      field: 'status',
      values: [
        'IN_PROGRESS',
        'AWAITING_CUSTOMER_INPUT',
        'PENDING_PAYMENT',
        'READY_FOR_TENANT_CREATION',
      ],
    },
    'my-records': { label: 'Assigned to me', field: 'onboardingOwnerUserId' },
  },
  tenants: {
    active: { label: 'Active', field: 'status', values: ['ACTIVE'] },
    'my-records': CREATED_BY_ME,
  },
  subscriptions: {
    active: {
      label: 'Active',
      field: 'status',
      values: ['ACTIVE', 'TRIALING'],
    },
    'my-records': CREATED_BY_ME,
  },
  plans: {
    active: { label: 'Active', field: 'isActive', values: [true] },
    'my-records': CREATED_BY_ME,
  },
  invoices: {
    active: {
      label: 'Outstanding',
      field: 'status',
      values: ['ISSUED', 'OVERDUE', 'PAYMENT_FAILED'],
    },
    'my-records': CREATED_BY_ME,
  },
  payments: {
    active: { label: 'Pending', field: 'status', values: ['PENDING'] },
    'my-records': CREATED_BY_ME,
  },
  commissions: {
    active: {
      label: 'Payable',
      field: 'status',
      values: ['PENDING', 'APPROVED', 'PAYABLE'],
    },
    /* Commission rows belong to a partner, not to a platform user. */
  },
  'contract-templates': {
    active: { label: 'Active', field: 'isActive', values: [true] },
    'my-records': CREATED_BY_ME,
  },
  'signature-requests': {
    active: {
      label: 'Awaiting signature',
      field: 'status',
      values: ['SENT', 'VIEWED', 'PARTIALLY_SIGNED'],
    },
    'my-records': CREATED_BY_ME,
  },
};

/** View keys a module can honour, always led by "all". */
function listRuntimeViewKeys(moduleKey) {
  const rules = PLATFORM_MODULE_VIEW_RULES[moduleKey] || {};
  return ['all', ...['active', 'my-records'].filter((key) => rules[key])];
}

/** The rule behind a view, or null for "all" and for unsupported views. */
function resolveRuntimeViewRule(moduleKey, viewKey) {
  if (!viewKey || viewKey === 'all') return null;
  return (PLATFORM_MODULE_VIEW_RULES[moduleKey] || {})[viewKey] || null;
}

function runtimeViewLabel(moduleKey, viewKey) {
  if (viewKey === 'all') return 'All';
  return resolveRuntimeViewRule(moduleKey, viewKey)?.label || null;
}

module.exports = {
  PLATFORM_MODULE_VIEW_RULES,
  listRuntimeViewKeys,
  resolveRuntimeViewRule,
  runtimeViewLabel,
};
