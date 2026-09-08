import { Injectable, OnModuleInit } from '@nestjs/common';
import { SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  ApprovalDecisionRegistry,
  type ApprovalDecisionDelegate,
  type ApprovalDecisionInput,
} from '../approvals/approval-decision.registry';
import { AttendanceService } from './attendance.service';

/**
 * How an attendance correction is decided from the generic approvals inbox.
 *
 * `approveCorrectionRequest` accepts optional `requestedCheckInAtUtc` /
 * `requestedCheckOutAtUtc` overrides, letting an approver rewrite the times
 * being approved. Nothing is passed for them here: the inbox shows a single
 * row and an approver who wants to change the times has not seen them, so this
 * path approves exactly what was requested. Amending a correction stays on the
 * correction record, which is what the "Open source record" link is for.
 *
 * There is no `cancel`: attendance corrections have no withdraw endpoint at all
 * — `attendance.correction.cancel` is granted to the Employee role and wired to
 * nothing, the `defined-but-unwired-permission` pattern. Leaving `cancel` out of
 * `requirements` makes the inbox say so rather than offering a button that 404s.
 */
@Injectable()
export class AttendanceApprovalDelegate
  implements ApprovalDecisionDelegate, OnModuleInit
{
  readonly moduleKey = 'attendance';
  readonly entityTypes = ['attendanceCorrectionRequest'];
  readonly requirements = {
    approve: {
      legacyKeys: ['attendance.correction.approve'],
      rbac: [
        {
          entityKey: ENTITY_KEYS.ATTENDANCE,
          privilege: SecurityPrivilege.APPROVE,
        },
      ],
    },
    reject: {
      legacyKeys: ['attendance.correction.reject'],
      rbac: [
        {
          entityKey: ENTITY_KEYS.ATTENDANCE,
          privilege: SecurityPrivilege.REJECT,
        },
      ],
    },
  } as const;

  constructor(
    private readonly registry: ApprovalDecisionRegistry,
    private readonly attendanceService: AttendanceService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async execute({ action, user, entityId, comment }: ApprovalDecisionInput) {
    if (action === 'approve') {
      return this.attendanceService.approveCorrectionRequest(user, entityId, {
        comment,
      });
    }
    if (action === 'reject') {
      return this.attendanceService.rejectCorrectionRequest(user, entityId, {
        comment,
      });
    }
    /*
     * Unreachable: `ApprovalsService.decide` refuses an action absent from
     * `requirements` before it calls this. Kept explicit so adding `cancel` to
     * `requirements` without wiring it here fails loudly rather than silently
     * doing nothing.
     */
    throw new Error(
      `Attendance corrections do not support the "${action}" decision.`,
    );
  }
}
