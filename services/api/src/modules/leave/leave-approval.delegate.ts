import { Injectable, OnModuleInit } from '@nestjs/common';
import { SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  ApprovalDecisionRegistry,
  type ApprovalDecisionDelegate,
  type ApprovalDecisionInput,
} from '../approvals/approval-decision.registry';
import { LeaveService } from './leave.service';

/**
 * How a leave approval is decided from the generic approvals inbox.
 *
 * Nothing here touches `ApprovalRequest`. `LeaveApprovalStep` is the
 * authoritative table for leave and the generic rows are a mirror written by
 * `syncGenericLeaveApproval`; deciding the mirror directly would advance the
 * inbox while the leave request stayed PENDING and no balance was consumed. So
 * each action calls the very method `LeaveRequestsController` calls, and the
 * mirror, the audit row, the notifications and the balance all move as they
 * always have.
 *
 * The permission requirements are copied from that controller's decorators.
 * They are checked by `ApprovalsService.decide` through the same function
 * `PermissionsGuard` uses, so approving here demands exactly what approving at
 * `POST /leave-requests/:id/approve` demands — including the BUG-2015 fix that
 * separated approve from read.
 */
@Injectable()
export class LeaveApprovalDelegate
  implements ApprovalDecisionDelegate, OnModuleInit
{
  readonly moduleKey = 'leave';
  readonly entityTypes = ['leaveRequest'];
  readonly requirements = {
    approve: {
      legacyKeys: ['leave-requests.approve'],
      rbac: [
        {
          entityKey: ENTITY_KEYS.LEAVE_REQUESTS,
          privilege: SecurityPrivilege.APPROVE,
        },
      ],
    },
    reject: {
      legacyKeys: ['leave-requests.reject'],
      rbac: [
        {
          entityKey: ENTITY_KEYS.LEAVE_REQUESTS,
          privilege: SecurityPrivilege.REJECT,
        },
      ],
    },
    cancel: {
      legacyKeys: ['leave-requests.cancel'],
      rbac: [
        {
          entityKey: ENTITY_KEYS.LEAVE_REQUESTS,
          privilege: SecurityPrivilege.DELETE,
        },
      ],
    },
  } as const;

  constructor(
    private readonly registry: ApprovalDecisionRegistry,
    private readonly leaveService: LeaveService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async execute({ action, user, entityId, comment }: ApprovalDecisionInput) {
    switch (action) {
      case 'approve':
        return this.leaveService.approveLeaveRequest(user, entityId, {
          comments: comment,
        });
      case 'reject':
        return this.leaveService.rejectLeaveRequest(user, entityId, {
          comments: comment,
        });
      case 'cancel':
        return this.leaveService.cancelLeaveRequest(user, entityId, {
          reason: comment,
        });
    }
  }
}
