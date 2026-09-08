import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApprovalRequestStatus } from '@prisma/client';

function emptyStringToUndefined({ value }: { value: unknown }) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

export class ApprovalDecisionDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/**
 * `GET /approvals` previously took `@Query() query: Record<string, string>` with
 * no DTO at all, and cast `query.status` straight to a Prisma enum — so
 * `?status=FOO` reached the database unvalidated and surfaced as a 500 rather
 * than a 400. Everything the list understands is declared here instead.
 */
export class ListApprovalsQueryDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(64)
  moduleKey?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEnum(ApprovalRequestStatus)
  status?: ApprovalRequestStatus;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEnum(['pending', 'submitted', 'approved', 'rejected', 'escalated'])
  view?: 'pending' | 'submitted' | 'approved' | 'rejected' | 'escalated';
}
