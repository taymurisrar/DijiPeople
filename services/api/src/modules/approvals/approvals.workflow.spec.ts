/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { ForbiddenException } from '@nestjs/common';
import {
  ApprovalAssignmentStatus,
  ApprovalRequestStatus,
  GenericApprovalStepStatus,
} from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ApprovalDecisionRegistry } from './approval-decision.registry';
import { ApprovalsService } from './approvals.service';

const user: AuthenticatedUser = {
  userId: 'approver-1',
  tenantId: 'tenant-1',
  email: 'approver@example.com',
  roleIds: [],
  roleKeys: ['payroll-manager'],
  permissionKeys: ['approvals.readAssigned'],
};

describe('ApprovalsService workflow actions', () => {
  it('refuses actions from users without a pending assignment', async () => {
    const tx = workflowTx({ assignedToUserId: 'another-user' });
    const { service } = createService(tx);

    await expect(
      service.action({
        user,
        approvalRequestId: 'approval-1',
        action: 'APPROVED',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.approvalAssignment.update).not.toHaveBeenCalled();
  });

  it('completes an ANY_ONE final step and supersedes other assignees', async () => {
    const tx = workflowTx({ assignedToUserId: user.userId });
    const { service, auditService } = createService(tx);

    const result = await service.action({
      user,
      approvalRequestId: 'approval-1',
      action: 'APPROVED',
    });

    expect(tx.approvalAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ApprovalAssignmentStatus.SUPERSEDED,
        }),
      }),
    );
    expect(tx.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ApprovalRequestStatus.APPROVED,
          currentStepId: null,
        }),
      }),
    );
    expect(result.status).toBe(ApprovalRequestStatus.APPROVED);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPROVAL_APPROVED',
        entityId: 'approval-1',
      }),
      tx,
    );
  });

  it('keeps an ALL step pending until every assignment approves', async () => {
    const tx = workflowTx({
      assignedToUserId: user.userId,
      approvalMode: 'ALL',
    });
    const { service } = createService(tx);

    await service.action({
      user,
      approvalRequestId: 'approval-1',
      action: 'APPROVED',
    });

    expect(tx.approvalAssignment.updateMany).not.toHaveBeenCalled();
    expect(tx.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ApprovalRequestStatus.PENDING,
          currentStepId: 'step-1',
        }),
      }),
    );
  });

  it('starts the next sequential step after the current step completes', async () => {
    const tx = workflowTx({
      assignedToUserId: user.userId,
      includeNextStep: true,
    });
    const { service } = createService(tx);

    await service.action({
      user,
      approvalRequestId: 'approval-1',
      action: 'APPROVED',
    });

    expect(tx.approvalStep.update).toHaveBeenCalledWith({
      where: { id: 'step-2' },
      data: {
        status: GenericApprovalStepStatus.PENDING,
        startedAtUtc: expect.any(Date),
      },
    });
    expect(tx.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStepId: 'step-2' }),
      }),
    );
  });

  it('cancels pending assignments and records tracker history atomically', async () => {
    const tx = workflowTx({ assignedToUserId: user.userId });
    const { service, auditService } = createService(tx);

    const result = await service.cancel({
      user,
      approvalRequestId: 'approval-1',
      comment: 'Withdrawn',
    });

    expect(tx.approvalAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ApprovalAssignmentStatus.SUPERSEDED,
        }),
      }),
    );
    expect(tx.approvalAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actionType: 'CANCELLED' }),
      }),
    );
    expect(result.status).toBe(ApprovalRequestStatus.CANCELLED);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPROVAL_CANCELLED' }),
      tx,
    );
  });
});

function workflowTx(input: {
  assignedToUserId: string;
  approvalMode?: 'ANY_ONE' | 'ALL';
  includeNextStep?: boolean;
}) {
  const assignments = [
    {
      id: 'assignment-1',
      assignedToUserId: input.assignedToUserId,
      status: ApprovalAssignmentStatus.PENDING,
    },
    {
      id: 'assignment-2',
      assignedToUserId: 'approver-2',
      status: ApprovalAssignmentStatus.PENDING,
    },
  ];
  const steps = [
    {
      id: 'step-1',
      stepOrder: 1,
      status: GenericApprovalStepStatus.PENDING,
      metadata: { approvalMode: input.approvalMode ?? 'ANY_ONE' },
      assignments,
    },
    ...(input.includeNextStep
      ? [
          {
            id: 'step-2',
            stepOrder: 2,
            status: GenericApprovalStepStatus.NOT_STARTED,
            metadata: { approvalMode: 'ANY_ONE' },
            assignments: [],
          },
        ]
      : []),
  ];
  return {
    approvalRequest: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'approval-1',
        moduleKey: 'claim',
        entityType: 'claimRequest',
        entityId: 'claim-1',
        submittedByUserId: user.userId,
        status: ApprovalRequestStatus.PENDING,
        currentStepId: 'step-1',
        steps,
      }),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'approval-1', ...data }),
        ),
    },
    approvalAssignment: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    approvalStep: { update: jest.fn().mockResolvedValue({}) },
    approvalAction: { create: jest.fn().mockResolvedValue({}) },
  };
}

function createService(tx: ReturnType<typeof workflowTx>) {
  const auditService = { log: jest.fn().mockResolvedValue({}) };
  const service = new ApprovalsService(
    {
      $transaction: jest.fn((callback) => callback(tx)),
    } as unknown as PrismaService,
    auditService as never,
    new ApprovalDecisionRegistry(),
  );
  return { service, auditService };
}
