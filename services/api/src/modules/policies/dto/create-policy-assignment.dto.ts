import { PolicyAssignmentScopeType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreatePolicyAssignmentDto {
  @IsUUID()
  policyId!: string;

  @IsEnum(PolicyAssignmentScopeType)
  scopeType!: PolicyAssignmentScopeType;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
