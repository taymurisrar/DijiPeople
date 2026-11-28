import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
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

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class ChecklistItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  label!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class CreateDutyTemplateDto {
  /** Stable lowercase key, unique per tenant. */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{1,62}$/, {
    message:
      'key must be 2-63 lowercase letters, digits, dot, dash or underscore',
  })
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays!: number[];

  /** IANA zone; validated against the runtime's zone database in the service. */
  @IsString()
  @MaxLength(64)
  timezone!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  dueMinutes?: number;

  @IsOptional()
  @IsUUID()
  assigneeEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];
}

/** Every field optional; null clears an optional one. The key never changes. */
export class UpdateDutyTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  dueMinutes?: number | null;

  @IsOptional()
  @IsUUID()
  assigneeEmployeeId?: string | null;

  @IsOptional()
  @IsUUID()
  teamId?: string | null;

  /** When present, replaces the checklist for occurrences generated from now on. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];
}

export class ListDutyTemplatesDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export class GenerateDutiesDto {
  /** The local calendar date to generate for, read in each template's own zone. */
  @IsString()
  @Matches(DATE_ONLY, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}

export class ListDutyOccurrencesDto {
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export class CheckNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateDutyHandoverDto {
  /** Exactly one of toEmployeeId or teamId. */
  @IsOptional()
  @IsUUID()
  toEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  note!: string;

  @IsOptional()
  @IsUUID()
  occurrenceId?: string;
}

export class ListDutyHandoversDto {
  /** Defaults to OPEN: an unacknowledged handover must stay in front of people. */
  @IsOptional()
  @IsIn(['OPEN', 'ACKNOWLEDGED'])
  status?: 'OPEN' | 'ACKNOWLEDGED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
