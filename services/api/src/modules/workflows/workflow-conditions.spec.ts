import {
  evaluateWorkflowConditions,
  findMalformedWorkflowCondition,
  validateWorkflowConditionList,
} from './workflow-conditions';

/*
 * Conditions decide whether a tenant's workflow acts. The important property is
 * that a badly written one fails CLOSED (the rule does not fire) rather than
 * throwing inside the business action that triggered it.
 */

const CONTEXT = {
  leaveTypeName: 'Annual Leave',
  totalDays: 5,
  employee: { department: 'Engineering' },
  reason: '',
};

describe('workflow conditions', () => {
  it('runs the workflow when there are no conditions', () => {
    expect(evaluateWorkflowConditions([], CONTEXT)).toBe(true);
    expect(evaluateWorkflowConditions(null, CONTEXT)).toBe(true);
    expect(evaluateWorkflowConditions(undefined, CONTEXT)).toBe(true);
  });

  it('requires every condition to hold', () => {
    expect(
      evaluateWorkflowConditions(
        [
          { field: 'leaveTypeName', operator: 'equals', value: 'Annual Leave' },
          { field: 'totalDays', operator: 'greaterThan', value: '3' },
        ],
        CONTEXT,
      ),
    ).toBe(true);

    expect(
      evaluateWorkflowConditions(
        [
          { field: 'leaveTypeName', operator: 'equals', value: 'Annual Leave' },
          { field: 'totalDays', operator: 'greaterThan', value: '10' },
        ],
        CONTEXT,
      ),
    ).toBe(false);
  });

  it('reads nested fields with dotted paths', () => {
    expect(
      evaluateWorkflowConditions(
        [
          {
            field: 'employee.department',
            operator: 'equals',
            value: 'engineering',
          },
        ],
        CONTEXT,
      ),
    ).toBe(true);
  });

  it('treats a missing field as empty rather than throwing', () => {
    expect(
      evaluateWorkflowConditions(
        [{ field: 'nothing.here.at.all', operator: 'isEmpty' }],
        CONTEXT,
      ),
    ).toBe(true);

    expect(
      evaluateWorkflowConditions(
        [{ field: 'nothing.here', operator: 'isNotEmpty' }],
        CONTEXT,
      ),
    ).toBe(false);
  });

  it('does not treat a non-numeric comparison as a match', () => {
    expect(
      evaluateWorkflowConditions(
        [{ field: 'leaveTypeName', operator: 'greaterThan', value: '3' }],
        CONTEXT,
      ),
    ).toBe(false);
  });

  it('fails closed on malformed entries and says why', () => {
    const bad = [
      null,
      'not an object',
      { field: 'leaveTypeName' },
      { field: 'leaveTypeName', operator: 'notAnOperator', value: 'x' },
      { field: '', operator: 'equals', value: 'x' },
    ];
    for (const entry of bad) {
      expect(evaluateWorkflowConditions([entry], CONTEXT)).toBe(false);
      expect(findMalformedWorkflowCondition([entry])).not.toBeNull();
    }
    // One bad entry poisons the list even when the others would match.
    expect(
      evaluateWorkflowConditions(
        [{ field: 'leaveTypeName', operator: 'isNotEmpty' }, null],
        CONTEXT,
      ),
    ).toBe(false);
    expect(evaluateWorkflowConditions('x', CONTEXT)).toBe(false);
    expect(findMalformedWorkflowCondition('x')).toBe(
      'Conditions are not a list.',
    );
    expect(findMalformedWorkflowCondition([])).toBeNull();
    expect(findMalformedWorkflowCondition(null)).toBeNull();
  });

  it('does not read through the prototype chain', () => {
    expect(
      evaluateWorkflowConditions(
        [{ field: 'constructor.name', operator: 'isNotEmpty' }],
        CONTEXT,
      ),
    ).toBe(false);
  });

  it('negated operators do not match when the value is absent', () => {
    expect(
      evaluateWorkflowConditions(
        [{ field: 'reason', operator: 'notContains', value: 'urgent' }],
        CONTEXT,
      ),
    ).toBe(true);

    expect(
      evaluateWorkflowConditions(
        [
          {
            field: 'leaveTypeName',
            operator: 'notEquals',
            value: 'Sick Leave',
          },
        ],
        CONTEXT,
      ),
    ).toBe(true);
  });
});

describe('authoring-time validation (WP-03, A03)', () => {
  const ok = {
    field: 'employee.department',
    operator: 'equals',
    value: 'Sales',
  };

  it('accepts well typed conditions', () => {
    expect(
      validateWorkflowConditionList([
        ok,
        { field: 'totalDays', operator: 'greaterThan', value: '3.5' },
        { field: 'reason', operator: 'isEmpty' },
      ]),
    ).toEqual([]);
  });

  it.each([
    ['a path with a space', { ...ok, field: 'a b' }, /not a valid field path/],
    [
      'a path with a bracket',
      { ...ok, field: 'a[0]' },
      /not a valid field path/,
    ],
    [
      'a prototype segment',
      { ...ok, field: 'employee.constructor.name' },
      /not an allowed field path/,
    ],
    ['__proto__', { ...ok, field: '__proto__' }, /not an allowed field path/],
    ['a comparison with no value', { ...ok, value: '' }, /needs a value/],
    [
      'a numeric comparison against text',
      { field: 'x', operator: 'lessThan', value: 'abc' },
      /needs a number/,
    ],
    [
      'a presence test carrying a value',
      { field: 'x', operator: 'isEmpty', value: 'oops' },
      /takes no value/,
    ],
  ])('rejects %s', (_name, condition, message) => {
    const problems = validateWorkflowConditionList([condition]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(message);
  });

  it('reports a structurally broken list as one problem', () => {
    expect(validateWorkflowConditionList('nope')).toEqual([
      'Conditions are not a list.',
    ]);
    expect(validateWorkflowConditionList([null])).toHaveLength(1);
  });
});
