/*
 * Which modules the assignment engine serves, and which record fields a rule
 * may match on. Both are allowlists on purpose: `conditions` is stored as free
 * JSON, and an unlisted key would silently never match (or, worse, match on a
 * field the creation path does not populate), leaving an administrator with a
 * rule that looks live and does nothing.
 *
 * Field names are the ones the creating code actually has in hand at the moment
 * of creation, because the engine runs before the row exists.
 */
export const ASSIGNMENT_MODULE_KEYS = [
  'leads',
  'customers',
  'support-cases',
] as const;

export type AssignmentModuleKey = (typeof ASSIGNMENT_MODULE_KEYS)[number];

export const ASSIGNMENT_CONDITION_FIELDS: Record<
  AssignmentModuleKey,
  readonly string[]
> = {
  leads: ['source', 'country', 'status', 'partnerId', 'industry'],
  customers: [
    'originChannel',
    'country',
    'status',
    'selectedPlanId',
    'originatingPartnerId',
    'industry',
  ],
  // `channel` is the case's intake source (INTERNAL, EMAIL, PORTAL, ...).
  'support-cases': [
    'category',
    'severity',
    'priority',
    'channel',
    'customerAccountId',
    'partnerId',
  ],
};

export function isAssignmentModuleKey(
  value: unknown,
): value is AssignmentModuleKey {
  return (
    typeof value === 'string' &&
    (ASSIGNMENT_MODULE_KEYS as readonly string[]).includes(value)
  );
}
