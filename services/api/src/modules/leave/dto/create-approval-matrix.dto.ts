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
export type ApprovalMatrixModuleKey =
  | 'LEAVE_REQUEST'
  | 'TIMESHEET'
  | 'CLAIM_REQUEST'
  | 'BUSINESS_TRIP'
  | 'RESOURCE_REQUEST'
  | 'PAYROLL_RUN';
export type ApprovalMatrixActorType =
  | 'LINE_MANAGER'
  | 'ROLE'
  | 'USER'
  | 'DEPARTMENT_HEAD'
  | 'BUSINESS_UNIT_HEAD'
  | 'POLICY_OWNER'
  | 'REQUEST_OWNER_MANAGER';
export type ApprovalMatrixMode = 'ANY_ONE' | 'ALL';
export type ApprovalMatrixScopeType =
  | 'TENANT'
  | 'ORGANIZATION'
  | 'BUSINESS_UNIT'
  | 'DEPARTMENT'
  | 'EMPLOYEE_LEVEL'
  | 'EMPLOYEE';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class CreateApprovalMatrixDto {
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

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  leaveTypeId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  leavePolicyId?: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsEnum({
    LINE_MANAGER: 'LINE_MANAGER',
    ROLE: 'ROLE',
    USER: 'USER',
    DEPARTMENT_HEAD: 'DEPARTMENT_HEAD',
    BUSINESS_UNIT_HEAD: 'BUSINESS_UNIT_HEAD',
    POLICY_OWNER: 'POLICY_OWNER',
    REQUEST_OWNER_MANAGER: 'REQUEST_OWNER_MANAGER',
  } as const)
  approverType!: ApprovalMatrixActorType;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  approverRoleId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  approverUserId?: string;

  @IsOptional()
  @IsEnum({ ANY_ONE: 'ANY_ONE', ALL: 'ALL' } as const)
  approvalMode?: ApprovalMatrixMode;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEnum({
    TENANT: 'TENANT',
    ORGANIZATION: 'ORGANIZATION',
    BUSINESS_UNIT: 'BUSINESS_UNIT',
    DEPARTMENT: 'DEPARTMENT',
    EMPLOYEE_LEVEL: 'EMPLOYEE_LEVEL',
    EMPLOYEE: 'EMPLOYEE',
  } as const)
  scopeType?: ApprovalMatrixScopeType;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  scopeId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
