import {
  ApprovalActorType,
  ApprovalMode,
  ApprovalModuleKey,
  ApprovalScopeType,
} from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function emptyStringToNull({ value }: { value: unknown }) {
  return value === '' ? null : value;
}

export type ApprovalMatrixModuleKey = ApprovalModuleKey;
export type ApprovalMatrixActorType = ApprovalActorType;
export type ApprovalMatrixMode = ApprovalMode;
export type ApprovalMatrixScopeType = ApprovalScopeType;

export class ListApprovalMatricesDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isActive?: boolean;
  @IsOptional() @IsEnum(ApprovalModuleKey) moduleKey?: ApprovalModuleKey;
  @IsOptional() @IsString() @MaxLength(120) recordType?: string;
}

export class CreateApprovalMatrixDto {
  @IsOptional() @IsEnum(ApprovalModuleKey) moduleKey?: ApprovalModuleKey;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  recordType?: string;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  leaveTypeId?: string;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  leavePolicyId?: string;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  claimTypeId?: string;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  loanPolicyId?: string;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(3)
  currencyCode?: string;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  organizationId?: string;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  businessUnitId?: string;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  departmentId?: string;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  employeeLevelId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maximumAmount?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumDuration?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumDuration?: number;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsObject() conditions?: Record<string, unknown>;
  @Type(() => Number) @IsNumber() @Min(1) sequence!: number;
  @IsEnum(ApprovalActorType) approverType!: ApprovalActorType;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  approverRoleId?: string;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  approverUserId?: string;
  @IsOptional() @IsEnum(ApprovalMode) approvalMode?: ApprovalMode;
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEnum(ApprovalScopeType)
  scopeType?: ApprovalScopeType;
  @IsOptional() @Transform(emptyStringToUndefined) @IsString() scopeId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateApprovalMatrixDto {
  @IsOptional() @IsEnum(ApprovalModuleKey) moduleKey?: ApprovalModuleKey;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(120)
  recordType?: string | null;
  @IsOptional() @Transform(emptyStringToNull) @IsUUID() leaveTypeId?:
    | string
    | null;
  @IsOptional() @Transform(emptyStringToNull) @IsUUID() leavePolicyId?:
    | string
    | null;
  @IsOptional() @Transform(emptyStringToNull) @IsUUID() claimTypeId?:
    | string
    | null;
  @IsOptional() @Transform(emptyStringToNull) @IsUUID() loanPolicyId?:
    | string
    | null;
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(3)
  currencyCode?: string | null;
  @IsOptional() @Transform(emptyStringToNull) @IsUUID() organizationId?:
    | string
    | null;
  @IsOptional() @Transform(emptyStringToNull) @IsUUID() businessUnitId?:
    | string
    | null;
  @IsOptional() @Transform(emptyStringToNull) @IsUUID() departmentId?:
    | string
    | null;
  @IsOptional() @Transform(emptyStringToNull) @IsUUID() employeeLevelId?:
    | string
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumAmount?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maximumAmount?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumDuration?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maximumDuration?:
    | number
    | null;
  @IsOptional() @Transform(emptyStringToNull) @IsDateString() effectiveFrom?:
    | string
    | null;
  @IsOptional() @Transform(emptyStringToNull) @IsDateString() effectiveTo?:
    | string
    | null;
  @IsOptional() @IsObject() conditions?: Record<string, unknown> | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) sequence?: number;
  @IsOptional() @IsEnum(ApprovalActorType) approverType?: ApprovalActorType;
  @IsOptional() @Transform(emptyStringToNull) @IsUUID() approverRoleId?:
    | string
    | null;
  @IsOptional() @Transform(emptyStringToNull) @IsUUID() approverUserId?:
    | string
    | null;
  @IsOptional() @IsEnum(ApprovalMode) approvalMode?: ApprovalMode;
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsEnum(ApprovalScopeType)
  scopeType?: ApprovalScopeType | null;
  @IsOptional() @Transform(emptyStringToNull) @IsString() scopeId?:
    | string
    | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
