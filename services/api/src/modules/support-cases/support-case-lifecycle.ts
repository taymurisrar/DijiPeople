import { SupportCaseStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { userHasPlatformPermission } from '../platform-auth/platform-permissions';

/*
 * The support case lifecycle (WS11).
 *
 * Until this existed a case's status was a free field: `PATCH :id` accepted any
 * status from any status, so a CLOSED case could be moved straight back to NEW
 * with no reason recorded, a RESOLVED case could carry no resolution at all, and
 * a merged duplicate could be reopened and worked in parallel with the case it
 * had been merged into. Every status change now passes through
 * `planSupportCaseTransition`, whichever endpoint asked for it.
 *
 * The admin console derives each command's `states` from this same table,
 * and neither workspace can import the other's source, so the table is mirrored
 * in `support-case-transitions.contract.json`. The lifecycle spec fails when the
 * two differ, and the admin spec reads the JSON — the same arrangement as
 * `platform-runtime/record-actions.contract.json`.
 */

type TransitionTable = Readonly<
  Record<SupportCaseStatus, readonly SupportCaseStatus[]>
>;

const S = SupportCaseStatus;

/** From → allowed to. A merged case has no transitions at all, whatever this says. */
export const SUPPORT_CASE_TRANSITIONS: TransitionTable = {
  NEW: [
    S.TRIAGED,
    S.ASSIGNED,
    S.INVESTIGATING,
    S.WAITING_ON_CUSTOMER,
    S.RESOLVED,
    S.CANCELLED,
  ],
  TRIAGED: [
    S.ASSIGNED,
    S.INVESTIGATING,
    S.WAITING_ON_CUSTOMER,
    S.WAITING_ON_INTERNAL_TEAM,
    S.RESOLVED,
    S.CANCELLED,
  ],
  ASSIGNED: [
    S.INVESTIGATING,
    S.WAITING_ON_CUSTOMER,
    S.WAITING_ON_INTERNAL_TEAM,
    S.FIX_IN_PROGRESS,
    S.RESOLVED,
    S.CANCELLED,
  ],
  INVESTIGATING: [
    S.ASSIGNED,
    S.WAITING_ON_CUSTOMER,
    S.WAITING_ON_INTERNAL_TEAM,
    S.FIX_IN_PROGRESS,
    S.MONITORING,
    S.RESOLVED,
    S.CANCELLED,
  ],
  WAITING_ON_CUSTOMER: [
    S.ASSIGNED,
    S.INVESTIGATING,
    S.WAITING_ON_INTERNAL_TEAM,
    S.FIX_IN_PROGRESS,
    S.RESOLVED,
    S.CANCELLED,
  ],
  WAITING_ON_INTERNAL_TEAM: [
    S.ASSIGNED,
    S.INVESTIGATING,
    S.WAITING_ON_CUSTOMER,
    S.FIX_IN_PROGRESS,
    S.RESOLVED,
    S.CANCELLED,
  ],
  FIX_IN_PROGRESS: [
    S.INVESTIGATING,
    S.WAITING_ON_CUSTOMER,
    S.WAITING_ON_INTERNAL_TEAM,
    S.MONITORING,
    S.RESOLVED,
    S.CANCELLED,
  ],
  MONITORING: [
    S.INVESTIGATING,
    S.WAITING_ON_CUSTOMER,
    S.FIX_IN_PROGRESS,
    S.RESOLVED,
    S.CANCELLED,
  ],
  REOPENED: [
    S.TRIAGED,
    S.ASSIGNED,
    S.INVESTIGATING,
    S.WAITING_ON_CUSTOMER,
    S.WAITING_ON_INTERNAL_TEAM,
    S.FIX_IN_PROGRESS,
    S.RESOLVED,
    S.CANCELLED,
  ],
  // A resolution is either accepted (Close) or disputed (Reopen); nothing else.
  RESOLVED: [S.CLOSED, S.REOPENED],
  /*
   * No reopen window exists in support settings today, so a closed case may
   * always be reopened. If one is added, it is enforced in the service, not by
   * removing this edge.
   */
  CLOSED: [S.REOPENED],
  CANCELLED: [S.REOPENED],
};

export const SUPPORT_CASE_LOCKED_STATUSES: readonly SupportCaseStatus[] = [
  SupportCaseStatus.CLOSED,
  SupportCaseStatus.CANCELLED,
];

/** Statuses in which work is no longer being done on the case. */
export const SUPPORT_CASE_INACTIVE_STATUSES: readonly SupportCaseStatus[] = [
  SupportCaseStatus.RESOLVED,
  SupportCaseStatus.CLOSED,
  SupportCaseStatus.CANCELLED,
];

export const MAX_ESCALATION_LEVEL = 10;

export type SupportCaseLifecycleErrorCode =
  | 'SUPPORT_CASE_MERGED_READ_ONLY'
  | 'SUPPORT_CASE_LOCKED'
  | 'SUPPORT_CASE_TRANSITION_NOT_ALLOWED'
  | 'SUPPORT_CASE_TRANSITION_REQUIRES_INFO'
  | 'SUPPORT_CASE_CLOSURE_CONFIRMATION_REQUIRED'
  | 'SUPPORT_CASE_ESCALATION_LIMIT';

/**
 * A lifecycle rule refused the request. The service turns it into a 400 with
 * this code; kept free of Nest so the rules can be unit tested as plain data.
 */
export class SupportCaseLifecycleError extends Error {
  constructor(
    readonly code: SupportCaseLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SupportCaseLifecycleError';
  }
}

export type SupportCaseLifecycleState = {
  status: SupportCaseStatus;
  mergedIntoCaseId?: string | null;
  assignedTeamId?: string | null;
  assignedToUserId?: string | null;
  closureConfirmedAt?: Date | null;
  firstRespondedAt?: Date | null;
  escalationLevel?: number | null;
};

export type SupportCaseTransitionInput = {
  toStatus: SupportCaseStatus;
  reason?: string | null;
  resolutionSummary?: string | null;
  resolutionCategory?: string | null;
  rootCause?: string | null;
  customerMessage?: string | null;
  assignedTeamId?: string | null;
  confirmClosure?: boolean | null;
};

export type SupportCaseLifecycleSettings = {
  closureConfirmationRequired?: boolean;
};

/** The columns a transition writes, plus what the caller must do around it. */
export type SupportCaseTransitionPlan = {
  fromStatus: SupportCaseStatus;
  toStatus: SupportCaseStatus;
  data: {
    status: SupportCaseStatus;
    resolvedAt?: Date | null;
    closedAt?: Date | null;
    closureConfirmedAt?: Date | null;
    firstRespondedAt?: Date;
    reopenedCount?: { increment: number };
    resolutionSummary?: string;
    resolutionCategory?: string;
    rootCause?: string;
  };
  /** Trimmed reason, when one was given — recorded on the timeline and audit. */
  reason: string | null;
  /** Customer-facing message to record as a communication, when one is due. */
  customerMessage: string | null;
};

function text(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function isMergedCase(
  state: Pick<SupportCaseLifecycleState, 'mergedIntoCaseId'>,
) {
  return Boolean(state.mergedIntoCaseId);
}

export function canTransition(
  from: SupportCaseStatus,
  to: SupportCaseStatus,
): boolean {
  return SUPPORT_CASE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Refuses edits to a case that is finished with. Reopen is the one way back,
 * and it goes through `planSupportCaseTransition`, not through here.
 */
export function assertSupportCaseEditable(
  state: Pick<SupportCaseLifecycleState, 'status' | 'mergedIntoCaseId'>,
) {
  if (isMergedCase(state))
    throw new SupportCaseLifecycleError(
      'SUPPORT_CASE_MERGED_READ_ONLY',
      'This case was merged into another case and is read-only. Work the case it was merged into.',
    );
  if (SUPPORT_CASE_LOCKED_STATUSES.includes(state.status))
    throw new SupportCaseLifecycleError(
      'SUPPORT_CASE_LOCKED',
      `A ${humanStatus(state.status)} case cannot be edited. Reopen it first.`,
    );
}

/**
 * Validates one status change and returns exactly what to write.
 *
 * Required information is checked here rather than in DTOs because what is
 * required depends on the destination: a resolution needs a summary and a
 * category, a cancellation needs a reason, and "waiting on internal team" is
 * meaningless without a team. The DTO only knows the shape.
 */
export function planSupportCaseTransition(
  current: SupportCaseLifecycleState,
  input: SupportCaseTransitionInput,
  settings: SupportCaseLifecycleSettings = {},
  now: Date = new Date(),
): SupportCaseTransitionPlan {
  const from = current.status;
  const to = input.toStatus;
  if (isMergedCase(current))
    throw new SupportCaseLifecycleError(
      'SUPPORT_CASE_MERGED_READ_ONLY',
      'This case was merged into another case; its status can no longer change.',
    );
  if (!canTransition(from, to))
    throw new SupportCaseLifecycleError(
      'SUPPORT_CASE_TRANSITION_NOT_ALLOWED',
      `A ${humanStatus(from)} case cannot move to ${humanStatus(to)}.`,
    );

  const reason = text(input.reason);
  const customerMessage = text(input.customerMessage);
  const data: SupportCaseTransitionPlan['data'] = { status: to };
  const missing = (what: string) =>
    new SupportCaseLifecycleError(
      'SUPPORT_CASE_TRANSITION_REQUIRES_INFO',
      `Moving a case to ${humanStatus(to)} requires ${what}.`,
    );

  switch (to) {
    case SupportCaseStatus.RESOLVED: {
      const summary = text(input.resolutionSummary);
      const category = text(input.resolutionCategory);
      if (!summary || !category)
        throw missing('a resolution summary and a resolution category');
      data.resolutionSummary = summary;
      data.resolutionCategory = category;
      const rootCause = text(input.rootCause);
      if (rootCause) data.rootCause = rootCause;
      data.resolvedAt = now;
      break;
    }
    case SupportCaseStatus.WAITING_ON_CUSTOMER:
      if (!customerMessage)
        throw missing('a message to the customer saying what is needed');
      break;
    case SupportCaseStatus.WAITING_ON_INTERNAL_TEAM:
      if (!text(input.assignedTeamId) && !current.assignedTeamId)
        throw missing('the internal team it is waiting on');
      break;
    case SupportCaseStatus.CANCELLED:
      if (!reason) throw missing('a reason');
      break;
    case SupportCaseStatus.REOPENED:
      if (!reason) throw missing('a reason');
      data.reopenedCount = { increment: 1 };
      /*
       * Both dates go: a reopened case is neither resolved nor closed, and the
       * SLA and metrics queries read `resolvedAt` as "the SLA was met". The
       * closure confirmation belonged to the resolution being undone.
       */
      data.resolvedAt = null;
      data.closedAt = null;
      data.closureConfirmedAt = null;
      break;
    case SupportCaseStatus.CLOSED:
      if (
        settings.closureConfirmationRequired &&
        !current.closureConfirmedAt &&
        input.confirmClosure !== true
      )
        throw new SupportCaseLifecycleError(
          'SUPPORT_CASE_CLOSURE_CONFIRMATION_REQUIRED',
          'Support settings require closure to be confirmed before a case is closed. Confirm that the customer accepted the resolution.',
        );
      if (input.confirmClosure === true && !current.closureConfirmedAt)
        data.closureConfirmedAt = now;
      data.closedAt = now;
      break;
    default:
      break;
  }

  // Any move off NEW is the first response, whoever made it.
  if (!current.firstRespondedAt && from === SupportCaseStatus.NEW)
    data.firstRespondedAt = now;

  return { fromStatus: from, toStatus: to, data, reason, customerMessage };
}

/*
 * Named as the admin console names its commands, so the two can be compared
 * directly. The `-case` suffix exists because `cancel` and `assign` already
 * mean something else to the console's generic record handler.
 */
export type SupportCaseActionKey =
  | 'triage-case'
  | 'assign-case'
  | 'escalate-case'
  | 'request-info'
  | 'resolve-case'
  | 'close-case'
  | 'reopen-case'
  | 'cancel-case'
  | 'link-case'
  | 'merge-case';

/** The transition each status-changing command performs. */
export const SUPPORT_CASE_ACTION_TARGETS: Partial<
  Record<SupportCaseActionKey, SupportCaseStatus>
> = {
  'triage-case': SupportCaseStatus.TRIAGED,
  'request-info': SupportCaseStatus.WAITING_ON_CUSTOMER,
  'resolve-case': SupportCaseStatus.RESOLVED,
  'close-case': SupportCaseStatus.CLOSED,
  'reopen-case': SupportCaseStatus.REOPENED,
  'cancel-case': SupportCaseStatus.CANCELLED,
};

/**
 * The commands a user may run on a case right now — the server's answer to the
 * question the admin command bar answers from `states`. Returned on every case
 * read so a client that wants certainty can use it instead of re-deriving it.
 */
export function availableActions(
  state: SupportCaseLifecycleState,
  user: AuthenticatedUser | null,
): SupportCaseActionKey[] {
  if (!user || !userHasPlatformPermission(user, 'support.manage')) return [];
  if (isMergedCase(state)) return [];
  const actions: SupportCaseActionKey[] = [];
  for (const [key, target] of Object.entries(
    SUPPORT_CASE_ACTION_TARGETS,
  ) as Array<[SupportCaseActionKey, SupportCaseStatus]>)
    if (canTransition(state.status, target)) actions.push(key);
  const working = !SUPPORT_CASE_INACTIVE_STATUSES.includes(state.status);
  if (working) actions.push('assign-case');
  if (working && (state.escalationLevel ?? 0) < MAX_ESCALATION_LEVEL)
    actions.push('escalate-case');
  if (!SUPPORT_CASE_LOCKED_STATUSES.includes(state.status))
    actions.push('link-case', 'merge-case');
  return actions;
}

export function humanStatus(status: string) {
  return String(status).toLowerCase().replaceAll('_', ' ');
}
