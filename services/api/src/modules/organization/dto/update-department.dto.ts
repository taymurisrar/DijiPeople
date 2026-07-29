import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const STRUCTURE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const STRUCTURE_SUB_STATUSES = [
  'OPERATIONAL',
  'UNDER_SETUP',
  'PENDING_ACTIVATION',
  'DEACTIVATED',
  'ARCHIVED',
  'MERGED',
  'CLOSED',
] as const;

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  defaultWorkScheduleId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  headEmployeeId?: string | null;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  ownerUserId?: string | null;

  @IsOptional()
  @IsIn(STRUCTURE_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(STRUCTURE_SUB_STATUSES)
  subStatus?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
