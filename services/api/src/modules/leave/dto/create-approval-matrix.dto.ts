import { ApprovalActorType } from '@prisma/client';
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

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class CreateApprovalMatrixDto {
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

  @IsEnum(ApprovalActorType)
  approverType!: ApprovalActorType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
