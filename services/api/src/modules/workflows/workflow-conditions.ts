/*
 * Conditions decide whether a workflow acts on an event it matched.
 *
 * They are evaluated against the event context (the metadata a module passed to
 * emit, plus the record's placement), never against the database, so evaluating
 * one is cheap and cannot fail in a way that blocks the originating action.
 */

export const WORKFLOW_CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'isEmpty',
  'isNotEmpty',
  'greaterThan',
  'lessThan',
] as const;

export type WorkflowConditionOperator =
  (typeof WORKFLOW_CONDITION_OPERATORS)[number];

export type WorkflowCondition = {
  field: string;
  operator: WorkflowConditionOperator;
  value?: string | null;
};

/** Operators that ask about presence and therefore take no value. */
const VALUELESS_OPERATORS = new Set<WorkflowConditionOperator>([
  'isEmpty',
  'isNotEmpty',
]);

export function conditionNeedsValue(operator: WorkflowConditionOperator) {
  return !VALUELESS_OPERATORS.has(operator);
}

export function isWorkflowConditionOperator(
  value: string,
): value is WorkflowConditionOperator {
  return (WORKFLOW_CONDITION_OPERATORS as readonly string[]).includes(value);
}

/*
 * Reads `a.b.c` out of the context. Anything that is not a plain object part
 * way down simply yields undefined rather than throwing.
 */
function readPath(context: Record<string, unknown>, path: string): unknown {
  let current: unknown = context;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return '';
}

function evaluateOne(
  condition: WorkflowCondition,
  context: Record<string, unknown>,
) {
  const actual = readPath(context, condition.field);
  const actualText = toText(actual).trim().toLowerCase();
  const expected = (condition.value ?? '').trim().toLowerCase();

  switch (condition.operator) {
    case 'equals':
      return actualText === expected;
    case 'notEquals':
      return actualText !== expected;
    case 'contains':
      return actualText.includes(expected);
    case 'notContains':
      return !actualText.includes(expected);
    case 'isEmpty':
      return actualText.length === 0;
    case 'isNotEmpty':
      return actualText.length > 0;
    case 'greaterThan':
    case 'lessThan': {
      const left = Number(toText(actual));
      const right = Number(condition.value);
      // A non-numeric comparison is a mismatch, not a crash.
      if (Number.isNaN(left) || Number.isNaN(right)) return false;
      return condition.operator === 'greaterThan' ? left > right : left < right;
    }
    default:
      return false;
  }
}

/**
 * All conditions must hold. An empty or malformed list means "always run",
 * which matches how the builder presents a workflow with no conditions.
 */
export function evaluateWorkflowConditions(
  conditions: unknown,
  context: Record<string, unknown>,
) {
  if (!Array.isArray(conditions) || !conditions.length) return true;

  return conditions.every((entry) => {
    if (!entry || typeof entry !== 'object') return true;
    const candidate = entry as Partial<WorkflowCondition>;
    if (
      typeof candidate.field !== 'string' ||
      typeof candidate.operator !== 'string' ||
      !isWorkflowConditionOperator(candidate.operator)
    ) {
      return true;
    }
    return evaluateOne(
      {
        field: candidate.field,
        operator: candidate.operator,
        value: candidate.value ?? null,
      },
      context,
    );
  });
}
