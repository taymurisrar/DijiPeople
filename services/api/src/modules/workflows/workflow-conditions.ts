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
    // Never walk the prototype chain: a path like "constructor.name" must not
    // read engine internals into a condition.
    if (
      segment === '__proto__' ||
      segment === 'constructor' ||
      segment === 'prototype'
    ) {
      return undefined;
    }
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

/*
 * Returns why a stored condition list cannot be trusted, or null when every
 * entry is well formed. Structural only: a value-less comparison is a valid
 * (if odd) rule, an unknown operator or a non-object entry is not.
 */
export function findMalformedWorkflowCondition(
  conditions: unknown,
): string | null {
  if (conditions === null || conditions === undefined) return null;
  if (!Array.isArray(conditions)) return 'Conditions are not a list.';

  for (const [index, entry] of conditions.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return `Condition ${index + 1} is not an object.`;
    }
    const candidate = entry as Partial<WorkflowCondition>;
    if (typeof candidate.field !== 'string' || !candidate.field.trim()) {
      return `Condition ${index + 1} has no field.`;
    }
    if (
      typeof candidate.operator !== 'string' ||
      !isWorkflowConditionOperator(candidate.operator)
    ) {
      return `Condition ${index + 1} has an unknown operator.`;
    }
  }
  return null;
}

const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const BLOCKED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
const NUMERIC_OPERATORS = new Set<WorkflowConditionOperator>([
  'greaterThan',
  'lessThan',
]);

/**
 * Authoring-time checks, stricter than what the evaluator tolerates: a path that
 * is not a plain dotted identifier (or walks the prototype chain), a comparison
 * with no value, a numeric comparison against text, or a presence test that
 * carries a value. Returns one message per problem; empty means the list is
 * well typed. DP-MASTER/WP-03 (A03).
 */
export function validateWorkflowConditionList(conditions: unknown): string[] {
  const structural = findMalformedWorkflowCondition(conditions);
  if (structural) return [structural];
  if (!Array.isArray(conditions)) return [];

  const problems: string[] = [];
  conditions.forEach((entry, index) => {
    const condition = entry as WorkflowCondition;
    const label = `Condition ${index + 1}`;
    const field = condition.field.trim();
    if (!FIELD_PATH.test(field)) {
      problems.push(`${label}: "${field}" is not a valid field path.`);
    } else if (
      field.split('.').some((segment) => BLOCKED_SEGMENTS.has(segment))
    ) {
      problems.push(`${label}: "${field}" is not an allowed field path.`);
    }

    const value = condition.value;
    const hasValue =
      value !== undefined && value !== null && String(value).trim() !== '';
    if (!conditionNeedsValue(condition.operator)) {
      if (hasValue) {
        problems.push(`${label}: "${condition.operator}" takes no value.`);
      }
    } else if (!hasValue) {
      problems.push(`${label}: "${condition.operator}" needs a value.`);
    } else if (
      NUMERIC_OPERATORS.has(condition.operator) &&
      !Number.isFinite(Number(String(value).trim()))
    ) {
      problems.push(
        `${label}: "${condition.operator}" needs a number, not "${String(value)}".`,
      );
    }
  });
  return problems;
}

/**
 * All conditions must hold. No conditions means "always run", which matches how
 * the builder presents a workflow with none. A malformed list FAILS CLOSED: a
 * rule that cannot be read must not fire, because the rule an author meant to
 * restrict ("only for Sick Leave") would otherwise send to everyone. Callers
 * that need to tell the author why use findMalformedWorkflowCondition.
 */
export function evaluateWorkflowConditions(
  conditions: unknown,
  context: Record<string, unknown>,
) {
  if (conditions === null || conditions === undefined) return true;
  if (findMalformedWorkflowCondition(conditions)) return false;
  const list = conditions as WorkflowCondition[];
  if (!list.length) return true;

  return list.every((entry) =>
    evaluateOne(
      {
        field: entry.field,
        operator: entry.operator,
        value: entry.value ?? null,
      },
      context,
    ),
  );
}
