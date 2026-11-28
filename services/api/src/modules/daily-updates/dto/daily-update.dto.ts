import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const DAILY_UPDATE_SECTIONS = [
  'COMPLETED',
  'IN_PROGRESS',
  'NEXT',
  'BLOCKER',
  'UNPLANNED',
  'ACHIEVEMENT',
] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DailyUpdatePolicyDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workingDays?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  deadlineMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  requireAcknowledgement?: boolean;
}

/**
 * A policy for one team or one business unit (exactly one of the two). Anything
 * left out keeps its value on an existing policy, or takes the default on a new one.
 */
export class DailyUpdateScopePolicyDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['WORKING_DAYS', 'PER_SHIFT'])
  cadence?: 'WORKING_DAYS' | 'PER_SHIFT';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workingDays?: number[];

  /** After local midnight (WORKING_DAYS) or after the shift ends (PER_SHIFT). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  deadlineMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  requireAcknowledgement?: boolean;

  /** Minutes after the deadline at which a miss is escalated; null turns it off. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  escalateAfterMinutes?: number | null;
}

export class RunEscalationDto {
  /** Escalate for this day only (YYYY-MM-DD). Defaults to yesterday through tomorrow (UTC). */
  @IsOptional()
  @Matches(DATE)
  date?: string;
}

export class DraftDailyUpdateDto {
  /** The day to report on (YYYY-MM-DD). Defaults to today in the policy zone. */
  @IsOptional()
  @Matches(DATE)
  date?: string;
}

export class DailyUpdateItemDto {
  @IsIn(DAILY_UPDATE_SECTIONS as unknown as string[])
  section!: (typeof DAILY_UPDATE_SECTIONS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;

  @IsOptional()
  @IsUUID()
  contributionEntryId?: string;

  @IsOptional()
  @IsUUID()
  workItemId?: string;
}

export class SaveDailyUpdateDto {
  /**
   * The version the editor loaded. If someone else (the same person in another
   * tab) saved since, the save is refused with 409 instead of overwriting them.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DailyUpdateItemDto)
  items!: DailyUpdateItemDto[];
}

export class ListDailyUpdatesDto {
  @IsOptional()
  @Matches(DATE)
  from?: string;

  @IsOptional()
  @Matches(DATE)
  to?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED'])
  status?: 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED';

  @IsOptional()
  @IsUUID()
  employeeId?: string;

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

export class MissingDailyUpdatesDto {
  @Matches(DATE)
  date!: string;
}
