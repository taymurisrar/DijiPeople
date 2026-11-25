import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const CONTRIBUTION_WORK_KINDS = [
  'TASK',
  'TRANSACTION',
  'DUTY',
  'OUTPUT',
  'SERVICE',
  'EVENT',
  'CONTRIBUTION',
] as const;
export const CONTRIBUTION_CATEGORIES = [
  'PLANNED',
  'UNPLANNED',
  'SUPPORT',
  'MENTORING',
  'KNOWLEDGE',
  'QUALITY',
  'SALES',
  'ADMIN',
  'TRAINING',
  'COVER',
  'DOWNTIME',
  'BLOCKED',
] as const;
export const CONTRIBUTION_MEASURES = [
  'INTERVAL',
  'QUANTITY',
  'OCCURRENCE',
] as const;

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/*
 * What a client may say about an entry. Deliberately absent: tenantId, source,
 * verification, revision, state and every reviewer field. Provenance and review
 * are decided by the server from who is calling, never taken from the payload.
 */
export class ContributionBodyDto {
  @IsOptional()
  @IsIn(CONTRIBUTION_CATEGORIES)
  category?: (typeof CONTRIBUTION_CATEGORIES)[number];

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  /** Event time for a quantity or an occurrence. */
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  @MaxLength(24)
  quantity?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{0,63}$/)
  unitKey?: string;

  @IsOptional()
  @IsUUID()
  workItemId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{1,63}$/)
  workTypeKey?: string;

  @IsOptional()
  @IsUUID()
  workProfileVersionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateContributionDto extends ContributionBodyDto {
  @IsIn(CONTRIBUTION_WORK_KINDS)
  workKind!: (typeof CONTRIBUTION_WORK_KINDS)[number];

  @IsIn(CONTRIBUTION_MEASURES)
  measure!: (typeof CONTRIBUTION_MEASURES)[number];

  /** Whose contribution this is. Defaults to the caller. */
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  /** A client-generated id so a retried or offline upload is one entry. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  clientRequestId?: string;

  @IsOptional()
  @IsBoolean()
  capturedOffline?: boolean;

  /** The device clock at capture, for an offline entry. */
  @IsOptional()
  @IsDateString()
  capturedAt?: string;
}

export class CorrectContributionDto extends ContributionBodyDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

export class ReviewContributionDto {
  @IsIn(['VERIFIED', 'REJECTED', 'DISPUTED'])
  decision!: 'VERIFIED' | 'REJECTED' | 'DISPUTED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ReasonDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

export class ListContributionsDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['UNVERIFIED', 'VERIFIED', 'DISPUTED', 'REJECTED'])
  verification?: 'UNVERIFIED' | 'VERIFIED' | 'DISPUTED' | 'REJECTED';

  @IsOptional()
  @IsIn(CONTRIBUTION_WORK_KINDS)
  workKind?: (typeof CONTRIBUTION_WORK_KINDS)[number];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeHistory?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export class SummaryContributionsDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
