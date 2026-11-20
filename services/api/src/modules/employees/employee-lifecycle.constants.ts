import { EmployeeEmploymentStatus } from '@prisma/client';

export const EMPLOYEE_RECORD_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

export const EMPLOYEE_RECORD_SUB_STATUS = {
  DATA_COLLECTION: 'DATA_COLLECTION',
  ONBOARDING: 'ONBOARDING',
  READY_FOR_ACTIVATION: 'READY_FOR_ACTIVATION',
  PENDING_REVIEW: 'PENDING_REVIEW',
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
  RETIRED: 'RETIRED',
} as const;

export const EMPLOYEE_RECORD_STATUS_VALUES = Object.values(
  EMPLOYEE_RECORD_STATUS,
);

export const EMPLOYEE_RECORD_SUB_STATUS_VALUES = Object.values(
  EMPLOYEE_RECORD_SUB_STATUS,
);

export const EMPLOYEE_DRAFT_LIFECYCLE = {
  status: EMPLOYEE_RECORD_STATUS.DRAFT,
  subStatus: EMPLOYEE_RECORD_SUB_STATUS.DATA_COLLECTION,
  employmentStatus: EmployeeEmploymentStatus.INACTIVE,
  isDraftProfile: true,
} as const;

export const EMPLOYEE_READY_FOR_ACTIVATION_LIFECYCLE = {
  status: EMPLOYEE_RECORD_STATUS.DRAFT,
  subStatus: EMPLOYEE_RECORD_SUB_STATUS.READY_FOR_ACTIVATION,
  employmentStatus: EmployeeEmploymentStatus.INACTIVE,
  isDraftProfile: true,
} as const;

/**
 * The record lifecycle as the API publishes it. A draft profile always reads as
 * DRAFT with a draft sub status and an INACTIVE employment status, whatever the
 * stored columns say; any other record reports its stored values. One function
 * so the list/create responses and the profile response cannot disagree.
 */
export function resolveRecordLifecycle(employee: {
  isDraftProfile: boolean;
  status: string;
  subStatus: string;
  employmentStatus: EmployeeEmploymentStatus;
}) {
  if (!employee.isDraftProfile) {
    return {
      status: employee.status,
      subStatus: employee.subStatus,
      employmentStatus: employee.employmentStatus,
    };
  }
  return {
    status: EMPLOYEE_RECORD_STATUS.DRAFT,
    subStatus:
      employee.subStatus === EMPLOYEE_RECORD_SUB_STATUS.READY_FOR_ACTIVATION
        ? EMPLOYEE_RECORD_SUB_STATUS.READY_FOR_ACTIVATION
        : employee.subStatus === EMPLOYEE_RECORD_SUB_STATUS.ONBOARDING
          ? EMPLOYEE_RECORD_SUB_STATUS.ONBOARDING
          : EMPLOYEE_RECORD_SUB_STATUS.DATA_COLLECTION,
    employmentStatus: EmployeeEmploymentStatus.INACTIVE,
  };
}
