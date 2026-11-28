import {
  buildWorkflowDefinition,
  checksumWorkflowDefinition,
  nextFreeWorkflowKey,
  slugifyWorkflowKey,
} from './workflow-versioning';

const base = {
  eventCode: 'leave.request.approved',
  moduleKey: null,
  scopeKey: 'TENANT:t1',
  conditions: [{ field: 'a', operator: 'equals', value: 'x' }],
  actions: [
    {
      type: 'SEND_EMAIL',
      sortOrder: 1,
      isActive: true,
      configuration: { b: 1, a: 2 },
    },
    {
      type: 'SEND_EMAIL',
      sortOrder: 0,
      isActive: true,
      configuration: { recipientMode: 'SUBJECT' },
    },
  ],
};

describe('workflow versioning', () => {
  it('derives a stable, bounded key from a name', () => {
    expect(slugifyWorkflowKey('  Léave Approved: Notify HR! ')).toBe(
      'leave-approved-notify-hr',
    );
    expect(slugifyWorkflowKey('!!!')).toBe('workflow');
    expect(slugifyWorkflowKey('x'.repeat(100))).toHaveLength(64);
  });

  it('finds the next free key without exceeding 64 characters', () => {
    expect(nextFreeWorkflowKey('a', new Set())).toBe('a');
    expect(nextFreeWorkflowKey('a', new Set(['a', 'a-2']))).toBe('a-3');
    const long = 'k'.repeat(64);
    expect(
      nextFreeWorkflowKey(long, new Set([long])).length,
    ).toBeLessThanOrEqual(64);
  });

  it('checksums identically regardless of key order and action order in the input', () => {
    const reordered = {
      ...base,
      actions: [
        {
          configuration: { recipientMode: 'SUBJECT' },
          isActive: true,
          sortOrder: 0,
          type: 'SEND_EMAIL',
        },
        {
          configuration: { a: 2, b: 1 },
          isActive: true,
          sortOrder: 1,
          type: 'SEND_EMAIL',
        },
      ],
    };
    expect(checksumWorkflowDefinition(buildWorkflowDefinition(base))).toBe(
      checksumWorkflowDefinition(buildWorkflowDefinition(reordered)),
    );
  });

  it('changes the checksum when behaviour changes', () => {
    const original = checksumWorkflowDefinition(buildWorkflowDefinition(base));
    const edited = checksumWorkflowDefinition(
      buildWorkflowDefinition({
        ...base,
        conditions: [{ field: 'a', operator: 'equals', value: 'y' }],
      }),
    );
    const disabled = checksumWorkflowDefinition(
      buildWorkflowDefinition({
        ...base,
        actions: base.actions.map((a) => ({ ...a, isActive: false })),
      }),
    );
    expect(new Set([original, edited, disabled]).size).toBe(3);
  });
});
