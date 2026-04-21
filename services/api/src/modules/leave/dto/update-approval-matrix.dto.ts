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

function emptyStringToNull({ value }: { value: unknown }) {
  if (value === '') {
    return null;
  }

  return value;
}

export class UpdateApprovalMatrixDto {
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
  @IsEnum(ApprovalActorType)
  approverType?: ApprovalActorType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
