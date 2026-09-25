import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * BUG-3564. The filters a platform operator actually asks for when
 * investigating a change: who did it, what action, which record, when, and —
 * because the usual starting point is a "Reference: req_…" toast or a
 * monitoring incident, not a person's name — the trace/request id the action
 * happened under. `search` is separate from `traceId`: it is a free-text
 * match over `action`/`entityType` for "what changed", not an exact
 * correlation lookup.
 */
export class PlatformAuditLogQueryDto {
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
  @IsString()
  entityId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  actorUserId?: string;

  /*
   * Matches either `traceId` or `requestId` — a support ticket rarely says
   * which one it is, and BUG-3227 fills both from the same ambient value on
   * most rows anyway.
   */
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(200)
  traceId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(200)
  search?: string;

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
