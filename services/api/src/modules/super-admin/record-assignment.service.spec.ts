import { RecordAssignmentService } from './record-assignment.service';

type Rule = {
  id: string;
  moduleKey: string;
  isActive: boolean;
  priority: number;
  createdAt: Date;
  conditions: Record<string, unknown>;
  strategy: 'SPECIFIC_USER' | 'TEAM_ROUND_ROBIN' | 'USER_ROUND_ROBIN';
  targetUserId: string | null;
  targetTeamId: string | null;
  candidateUserIds: string[];
  roundRobinCursor: number;
  matchCount: number;
  lastFailureReason?: string | null;
  lastAssignedUserId?: string | null;
};

function rule(partial: Partial<Rule> & { id: string }): Rule {
  return {
    moduleKey: 'leads',
    isActive: true,
    priority: 100,
    createdAt: new Date('2026-01-01'),
    conditions: {},
    strategy: 'SPECIFIC_USER',
    targetUserId: null,
    targetTeamId: null,
    candidateUserIds: [],
    roundRobinCursor: 0,
    matchCount: 0,
    ...partial,
  };
}

/** An in-memory stand-in for the prisma client, with an atomic increment. */
function build(
  rules: Rule[],
  options: { activeUsers?: string[]; teamMembers?: string[] } = {},
) {
  const activeUsers = new Set(options.activeUsers ?? []);
  const db = {
    recordAssignmentRule: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        rules
          .filter(
            (r) =>
              r.moduleKey === where.moduleKey && r.isActive === where.isActive,
          )
          .sort(
            (a, b) =>
              b.priority - a.priority ||
              a.createdAt.getTime() - b.createdAt.getTime(),
          ),
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const target = rules.find((r) => r.id === where.id)!;
          for (const [key, value] of Object.entries(data)) {
            if (value && typeof value === 'object' && 'increment' in value) {
              (target as Record<string, unknown>)[key] =
                ((target as Record<string, number>)[key] ?? 0) +
                (value as { increment: number }).increment;
            } else {
              (target as Record<string, unknown>)[key] = value;
            }
          }
          return { ...target };
        },
      ),
      findUnique: jest.fn(),
    },
    platformUser: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        activeUsers.has(where.id) ? { id: where.id } : null,
      ),
      findMany: jest.fn(
        async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.filter((id) => activeUsers.has(id)).map((id) => ({ id })),
      ),
    },
    platformTeam: {
      findUnique: jest.fn(async () => ({ isActive: true, archivedAt: null })),
    },
    platformTeamMember: {
      findMany: jest.fn(async () =>
        (options.teamMembers ?? []).map((platformUserId) => ({
          platformUserId,
        })),
      ),
    },
  };
  const audit = { log: jest.fn() };
  const service = new RecordAssignmentService(db as never, audit as never);
  return { service, db, audit, rules };
}

describe('RecordAssignmentService', () => {
  it('returns null when no rule exists', async () => {
    const { service } = build([]);
    await expect(
      service.assignOnCreate('leads', { source: 'Website' }, undefined),
    ).resolves.toBeNull();
  });

  it('ignores modules the engine does not serve', async () => {
    const { service, db } = build([]);
    await expect(service.assignOnCreate('employees', {})).resolves.toBeNull();
    expect(db.recordAssignmentRule.findMany).not.toHaveBeenCalled();
  });

  it('prefers the higher priority rule when both match', async () => {
    const { service } = build(
      [
        rule({ id: 'low', priority: 10, targetUserId: 'u-low' }),
        rule({ id: 'high', priority: 90, targetUserId: 'u-high' }),
      ],
      { activeUsers: ['u-low', 'u-high'] },
    );
    const result = await service.assignOnCreate('leads', { source: 'Website' });
    expect(result).toEqual({ userId: 'u-high', ruleId: 'high' });
  });

  it('only matches a rule whose conditions all equal the record', async () => {
    const { service } = build(
      [
        rule({
          id: 'qa',
          priority: 90,
          conditions: { source: 'website', country: 'QA' },
          targetUserId: 'u-qa',
        }),
        rule({ id: 'any', priority: 10, targetUserId: 'u-any' }),
      ],
      { activeUsers: ['u-qa', 'u-any'] },
    );
    // Case-insensitive on the value, and every condition must hold.
    await expect(
      service.assignOnCreate('leads', { source: 'Website', country: 'QA' }),
    ).resolves.toMatchObject({ ruleId: 'qa' });
    await expect(
      service.assignOnCreate('leads', { source: 'Website', country: 'PK' }),
    ).resolves.toMatchObject({ ruleId: 'any' });
  });

  it('never matches a condition on a field outside the allowlist', async () => {
    const { service } = build(
      [
        rule({
          id: 'bad',
          conditions: { passwordHash: 'x' },
          targetUserId: 'u',
        }),
      ],
      { activeUsers: ['u'] },
    );
    await expect(
      service.assignOnCreate('leads', { passwordHash: 'x' }),
    ).resolves.toBeNull();
  });

  it('falls through when the target user is inactive and records the failure', async () => {
    const { service, rules } = build(
      [
        rule({ id: 'gone', priority: 90, targetUserId: 'u-off' }),
        rule({ id: 'fallback', priority: 10, targetUserId: 'u-on' }),
      ],
      { activeUsers: ['u-on'] },
    );
    const result = await service.assignOnCreate('leads', {});
    expect(result).toMatchObject({ userId: 'u-on', ruleId: 'fallback' });
    expect(rules[0].lastFailureReason).toMatch(/not active/);
    expect(rules[0].matchCount).toBe(0);
  });

  it('shares work fairly across sequential USER_ROUND_ROBIN calls', async () => {
    const { service, rules } = build(
      [
        rule({
          id: 'rr',
          strategy: 'USER_ROUND_ROBIN',
          candidateUserIds: ['a', 'b', 'c'],
        }),
      ],
      { activeUsers: ['a', 'b', 'c'] },
    );
    const picks: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const result = await service.assignOnCreate('leads', {});
      picks.push(result!.userId!);
    }
    expect(picks).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
    expect(rules[0].matchCount).toBe(6);
  });

  it('skips inactive candidates in the rotation', async () => {
    const { service } = build(
      [
        rule({
          id: 'rr',
          strategy: 'USER_ROUND_ROBIN',
          candidateUserIds: ['a', 'gone', 'c'],
        }),
      ],
      { activeUsers: ['a', 'c'] },
    );
    const picks = [];
    for (let i = 0; i < 4; i += 1) {
      picks.push((await service.assignOnCreate('leads', {}))!.userId);
    }
    expect(picks).toEqual(['a', 'c', 'a', 'c']);
  });

  it('gives concurrent callers distinct picks from the returned cursor', async () => {
    const { service } = build(
      [
        rule({
          id: 'rr',
          strategy: 'USER_ROUND_ROBIN',
          candidateUserIds: ['a', 'b', 'c'],
        }),
      ],
      { activeUsers: ['a', 'b', 'c'] },
    );
    const results = await Promise.all([
      service.assignOnCreate('leads', {}),
      service.assignOnCreate('leads', {}),
      service.assignOnCreate('leads', {}),
    ]);
    expect(new Set(results.map((r) => r!.userId)).size).toBe(3);
  });

  it('returns the team for TEAM_ROUND_ROBIN and rotates its members', async () => {
    const { service } = build(
      [
        rule({
          id: 'team',
          moduleKey: 'support-cases',
          strategy: 'TEAM_ROUND_ROBIN',
          targetTeamId: 'team-1',
        }),
      ],
      { teamMembers: ['m1', 'm2'] },
    );
    const first = await service.assignOnCreate('support-cases', {});
    const second = await service.assignOnCreate('support-cases', {});
    expect(first).toEqual({ userId: 'm1', teamId: 'team-1', ruleId: 'team' });
    expect(second?.userId).toBe('m2');
  });

  it('falls through when a team has nobody eligible', async () => {
    const { service, rules } = build(
      [rule({ id: 'team', strategy: 'TEAM_ROUND_ROBIN', targetTeamId: 't' })],
      { teamMembers: [] },
    );
    await expect(service.assignOnCreate('leads', {})).resolves.toBeNull();
    expect(rules[0].lastFailureReason).toMatch(/no active members/);
  });

  it('does not advance the cursor or counters on a dry run', async () => {
    const { service, rules, db } = build(
      [
        rule({
          id: 'rr',
          strategy: 'USER_ROUND_ROBIN',
          candidateUserIds: ['a', 'b'],
          roundRobinCursor: 1,
        }),
      ],
      { activeUsers: ['a', 'b'] },
    );
    const preview = await service.assignOnCreate('leads', {}, undefined, {
      dryRun: true,
    });
    expect(preview?.userId).toBe('b');
    expect(rules[0].roundRobinCursor).toBe(1);
    expect(rules[0].matchCount).toBe(0);
    expect(db.recordAssignmentRule.update).not.toHaveBeenCalled();
  });

  it('never throws: a failing lookup yields null', async () => {
    const { service, db } = build([]);
    db.recordAssignmentRule.findMany.mockRejectedValueOnce(new Error('down'));
    await expect(service.assignOnCreate('leads', {})).resolves.toBeNull();
  });

  it('audits an assignment without throwing when the audit write fails', async () => {
    const { service, audit } = build([]);
    audit.log.mockRejectedValueOnce(new Error('audit down'));
    await expect(
      service.recordAssigned('leads', 'lead-1', { userId: 'a', ruleId: 'r' }),
    ).resolves.toBeUndefined();
  });
});
