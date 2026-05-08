import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import type { ApprovalMatrixScopeType } from './create-approval-matrix.dto';

const ScopeTypeValues = {
  TENANT: 'TENANT',
  ORGANIZATION: 'ORGANIZATION',
  BUSINESS_UNIT: 'BUSINESS_UNIT',
  DEPARTMENT: 'DEPARTMENT',
  EMPLOYEE_LEVEL: 'EMPLOYEE_LEVEL',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export class CreateLeavePolicyAssignmentDto {
  @IsUUID()
  leavePolicyId!: string;

  @IsEnum(ScopeTypeValues)
  scopeType!: ApprovalMatrixScopeType;

  @IsOptional()
  @IsString()
  scopeId?: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
