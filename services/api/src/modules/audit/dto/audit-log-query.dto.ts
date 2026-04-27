import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class AuditLogQueryDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  action?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  entityType?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
