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
