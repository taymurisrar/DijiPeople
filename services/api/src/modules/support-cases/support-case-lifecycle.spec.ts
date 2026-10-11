import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SupportCaseStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  SUPPORT_CASE_TRANSITIONS,
  SupportCaseLifecycleError,
  assertSupportCaseEditable,
  availableActions,
  canTransition,
  planSupportCaseTransition,
  type SupportCaseTransitionInput,
} from './support-case-lifecycle';

const ALL = Object.values(SupportCaseStatus);
const NOW = new Date('2026-10-11T10:00:00.000Z');

/** Everything any destination could require, so only the table decides. */
const FULL_INFO: Omit<SupportCaseTransitionInput, 'toStatus'> = {
  reason: 'Customer asked us to look again.',
  resolutionSummary: 'Rotated the expired certificate.',
  resolutionCategory: 'FIXED',
  customerMessage: 'Please send the failing payroll export.',
  assignedTeamId: 'team-1',
  confirmClosure: true,
};

function refusal(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof SupportCaseLifecycleError) return error.code;
    throw error;
  }
  return null;
}

const manager = {
  userId: 'platform-user',
  permissionKeys: [],
  platform: { id: 'platform-user', role: 'SUPER_ADMIN', status: 'ACTIVE' },
} as unknown as AuthenticatedUser;
const reader = {
  userId: 'reader',
  permissionKeys: ['support.read'],
  // No role: the grant comes only from the explicit read permission.
  platform: { id: 'reader', status: 'ACTIVE' },
} as unknown as AuthenticatedUser;

describe('support case lifecycle (WS11)', () => {
  it('matches the contract file the admin console derives its commands from', () => {
    const contract = JSON.parse(
      readFileSync(
        join(__dirname, 'support-case-transitions.contract.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    const { $comment: _comment, ...table } = contract;
    expect(table).toEqual(
      Object.fromEntries(
        Object.entries(SUPPORT_CASE_TRANSITIONS).map(([from, to]) => [
          from,
          [...to],
        ]),
      ),
    );
    expect(Object.keys(SUPPORT_CASE_TRANSITIONS).sort()).toEqual(
      [...ALL].sort(),
    );
  });

  describe.each(ALL)('from %s', (from) => {
    it.each(ALL)('to %s is allowed exactly when the table says so', (to) => {
      const allowed = SUPPORT_CASE_TRANSITIONS[from].includes(to);
      const code = refusal(() =>
        planSupportCaseTransition(
          { status: from, closureConfirmedAt: null },
          { toStatus: to, ...FULL_INFO },
          { closureConfirmationRequired: true },
          NOW,
        ),
      );
      expect(code).toBe(allowed ? null : 'SUPPORT_CASE_TRANSITION_NOT_ALLOWED');
      expect(canTransition(from, to)).toBe(allowed);
    });
  });

  it('never allows a status to transition to itself', () => {
    for (const status of ALL) expect(canTransition(status, status)).toBe(false);
  });

  it('gives a merged case no transitions at all, not even reopen', () => {
    for (const to of ALL)
      expect(
        refusal(() =>
          planSupportCaseTransition(
            { status: SupportCaseStatus.CLOSED, mergedIntoCaseId: 'target' },
            { toStatus: to, ...FULL_INFO },
          ),
        ),
      ).toBe('SUPPORT_CASE_MERGED_READ_ONLY');
    expect(
      refusal(() =>
        assertSupportCaseEditable({
          status: SupportCaseStatus.CLOSED,
          mergedIntoCaseId: 'target',
        }),
      ),
    ).toBe('SUPPORT_CASE_MERGED_READ_ONLY');
  });

  it('locks closed and cancelled cases against edits but not open ones', () => {
    expect(
      refusal(() =>
        assertSupportCaseEditable({ status: SupportCaseStatus.CLOSED }),
      ),
    ).toBe('SUPPORT_CASE_LOCKED');
    expect(
      refusal(() =>
        assertSupportCaseEditable({ status: SupportCaseStatus.CANCELLED }),
      ),
    ).toBe('SUPPORT_CASE_LOCKED');
    expect(
      refusal(() =>
        assertSupportCaseEditable({ status: SupportCaseStatus.RESOLVED }),
      ),
    ).toBeNull();
  });

  describe('required information', () => {
    const plan = (
      status: SupportCaseStatus,
      input: SupportCaseTransitionInput,
      extra: { assignedTeamId?: string | null } = {},
    ) =>
      refusal(() =>
        planSupportCaseTransition({ status, ...extra }, input, {}, NOW),
      );

    it('RESOLVED needs a summary and a category', () => {
      expect(plan('INVESTIGATING', { toStatus: 'RESOLVED' })).toBe(
        'SUPPORT_CASE_TRANSITION_REQUIRES_INFO',
      );
      expect(
        plan('INVESTIGATING', {
          toStatus: 'RESOLVED',
          resolutionSummary: 'x fixed',
        }),
      ).toBe('SUPPORT_CASE_TRANSITION_REQUIRES_INFO');
      expect(
        plan('INVESTIGATING', {
          toStatus: 'RESOLVED',
          resolutionSummary: '   ',
          resolutionCategory: 'FIXED',
        }),
      ).toBe('SUPPORT_CASE_TRANSITION_REQUIRES_INFO');
      const result = planSupportCaseTransition(
        { status: 'INVESTIGATING' },
        {
          toStatus: 'RESOLVED',
          resolutionSummary: ' Fixed it ',
          resolutionCategory: 'FIXED',
          rootCause: 'Expired cert',
        },
        {},
        NOW,
      );
      expect(result.data).toMatchObject({
        status: 'RESOLVED',
        resolvedAt: NOW,
        resolutionSummary: 'Fixed it',
        resolutionCategory: 'FIXED',
        rootCause: 'Expired cert',
      });
    });

    it('WAITING_ON_CUSTOMER needs a customer-facing message', () => {
      expect(plan('INVESTIGATING', { toStatus: 'WAITING_ON_CUSTOMER' })).toBe(
        'SUPPORT_CASE_TRANSITION_REQUIRES_INFO',
      );
      const result = planSupportCaseTransition(
        { status: 'INVESTIGATING' },
        { toStatus: 'WAITING_ON_CUSTOMER', customerMessage: 'Send logs' },
      );
      expect(result.customerMessage).toBe('Send logs');
    });

    it('WAITING_ON_INTERNAL_TEAM needs a team, given or already owning the case', () => {
      expect(
        plan('INVESTIGATING', { toStatus: 'WAITING_ON_INTERNAL_TEAM' }),
      ).toBe('SUPPORT_CASE_TRANSITION_REQUIRES_INFO');
      expect(
        plan('INVESTIGATING', {
          toStatus: 'WAITING_ON_INTERNAL_TEAM',
          assignedTeamId: 'team-1',
        }),
      ).toBeNull();
      expect(
        plan(
          'INVESTIGATING',
          { toStatus: 'WAITING_ON_INTERNAL_TEAM' },
          { assignedTeamId: 'team-1' },
        ),
      ).toBeNull();
    });

    it('CANCELLED and REOPENED need a reason', () => {
      expect(plan('NEW', { toStatus: 'CANCELLED' })).toBe(
        'SUPPORT_CASE_TRANSITION_REQUIRES_INFO',
      );
      expect(plan('CLOSED', { toStatus: 'REOPENED', reason: ' ' })).toBe(
        'SUPPORT_CASE_TRANSITION_REQUIRES_INFO',
      );
    });
  });

  it('reopen clears resolution and closure dates and counts the reopen', () => {
    const result = planSupportCaseTransition(
      { status: 'CLOSED', closureConfirmedAt: NOW },
      { toStatus: 'REOPENED', reason: 'Still failing' },
    );
    expect(result.data).toEqual({
      status: 'REOPENED',
      reopenedCount: { increment: 1 },
      resolvedAt: null,
      closedAt: null,
      closureConfirmedAt: null,
    });
    expect(result.reason).toBe('Still failing');
  });

  describe('closure confirmation setting', () => {
    it('is not required when the setting is off', () => {
      const result = planSupportCaseTransition(
        { status: 'RESOLVED' },
        { toStatus: 'CLOSED' },
        { closureConfirmationRequired: false },
        NOW,
      );
      expect(result.data).toEqual({ status: 'CLOSED', closedAt: NOW });
    });

    it('refuses an unconfirmed close when the setting is on', () => {
      expect(
        refusal(() =>
          planSupportCaseTransition(
            { status: 'RESOLVED', closureConfirmedAt: null },
            { toStatus: 'CLOSED' },
            { closureConfirmationRequired: true },
          ),
        ),
      ).toBe('SUPPORT_CASE_CLOSURE_CONFIRMATION_REQUIRED');
    });

    it('accepts an explicit confirmation and stamps it', () => {
      const result = planSupportCaseTransition(
        { status: 'RESOLVED', closureConfirmedAt: null },
        { toStatus: 'CLOSED', confirmClosure: true },
        { closureConfirmationRequired: true },
        NOW,
      );
      expect(result.data).toEqual({
        status: 'CLOSED',
        closedAt: NOW,
        closureConfirmedAt: NOW,
      });
    });

    it('accepts an earlier confirmation already on the case', () => {
      const earlier = new Date('2026-10-10T00:00:00.000Z');
      const result = planSupportCaseTransition(
        { status: 'RESOLVED', closureConfirmedAt: earlier },
        { toStatus: 'CLOSED' },
        { closureConfirmationRequired: true },
        NOW,
      );
      expect(result.data.closureConfirmedAt).toBeUndefined();
    });
  });

  it('records the first response on the first move off NEW only', () => {
    expect(
      planSupportCaseTransition(
        { status: 'NEW' },
        { toStatus: 'TRIAGED' },
        {},
        NOW,
      ).data.firstRespondedAt,
    ).toBe(NOW);
    expect(
      planSupportCaseTransition(
        { status: 'TRIAGED' },
        { toStatus: 'INVESTIGATING' },
        {},
        NOW,
      ).data.firstRespondedAt,
    ).toBeUndefined();
  });

  describe('availableActions', () => {
    it('offers nothing to a reader or on a merged case', () => {
      expect(availableActions({ status: 'NEW' }, reader)).toEqual([]);
      expect(
        availableActions({ status: 'NEW', mergedIntoCaseId: 'x' }, manager),
      ).toEqual([]);
    });

    it('follows the table for status commands', () => {
      expect(availableActions({ status: 'NEW' }, manager)).toEqual(
        expect.arrayContaining([
          'triage-case',
          'request-info',
          'resolve-case',
          'cancel-case',
          'assign-case',
          'escalate-case',
          'link-case',
          'merge-case',
        ]),
      );
      expect(availableActions({ status: 'NEW' }, manager)).not.toContain(
        'close-case',
      );
      expect(availableActions({ status: 'RESOLVED' }, manager)).toEqual(
        expect.arrayContaining([
          'close-case',
          'reopen-case',
          'link-case',
          'merge-case',
        ]),
      );
      expect(availableActions({ status: 'RESOLVED' }, manager)).not.toContain(
        'escalate-case',
      );
      expect(availableActions({ status: 'CLOSED' }, manager)).toEqual([
        'reopen-case',
      ]);
    });

    it('stops offering Escalate at the cap', () => {
      expect(
        availableActions(
          { status: 'INVESTIGATING', escalationLevel: 10 },
          manager,
        ),
      ).not.toContain('escalate-case');
    });
  });
});
