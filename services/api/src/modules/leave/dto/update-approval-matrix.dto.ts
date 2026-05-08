import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type {
  ApprovalMatrixActorType,
  ApprovalMatrixMode,
  ApprovalMatrixModuleKey,
  ApprovalMatrixScopeType,
} from './create-approval-matrix.dto';

function emptyStringToNull({ value }: { value: unknown }) {
  if (value === '') {
    return null;
  }

  return value;
}

export class UpdateApprovalMatrixDto {
  @IsOptional()
  @IsEnum({
    LEAVE_REQUEST: 'LEAVE_REQUEST',
    TIMESHEET: 'TIMESHEET',
    CLAIM_REQUEST: 'CLAIM_REQUEST',
    BUSINESS_TRIP: 'BUSINESS_TRIP',
    RESOURCE_REQUEST: 'RESOURCE_REQUEST',
    PAYROLL_RUN: 'PAYROLL_RUN',
  } as const)
  moduleKey?: ApprovalMatrixModuleKey;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsUUID()
  leaveTypeId?: string | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsUUID()
  leavePolicyId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;

  @IsOptional()
  @IsEnum({
    LINE_MANAGER: 'LINE_MANAGER',
    ROLE: 'ROLE',
    USER: 'USER',
    DEPARTMENT_HEAD: 'DEPARTMENT_HEAD',
    BUSINESS_UNIT_HEAD: 'BUSINESS_UNIT_HEAD',
    POLICY_OWNER: 'POLICY_OWNER',
    REQUEST_OWNER_MANAGER: 'REQUEST_OWNER_MANAGER',
  } as const)
  approverType?: ApprovalMatrixActorType;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsUUID()
  approverRoleId?: string | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsUUID()
  approverUserId?: string | null;

  @IsOptional()
  @IsEnum({ ANY_ONE: 'ANY_ONE', ALL: 'ALL' } as const)
  approvalMode?: ApprovalMatrixMode;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsEnum({
    TENANT: 'TENANT',
    ORGANIZATION: 'ORGANIZATION',
    BUSINESS_UNIT: 'BUSINESS_UNIT',
    DEPARTMENT: 'DEPARTMENT',
    EMPLOYEE_LEVEL: 'EMPLOYEE_LEVEL',
    EMPLOYEE: 'EMPLOYEE',
  } as const)
  scopeType?: ApprovalMatrixScopeType | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  scopeId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
