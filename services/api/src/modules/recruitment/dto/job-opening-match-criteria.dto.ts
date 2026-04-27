import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

function normalizeStringArray({ value }: { value: unknown }) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

export class JobOpeningMatchWeightsDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  skillMatch!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  experienceFit!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  educationFit!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  locationFit!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  availabilityFit!: number;
}

export class JobOpeningKnockoutRulesDto {
  @IsOptional()
  @IsBoolean()
  requireAllMandatorySkills?: boolean;

  @IsOptional()
  @IsBoolean()
  rejectIfExperienceBelowMinimum?: boolean;

  @IsOptional()
  @IsBoolean()
  rejectIfWorkModeMismatch?: boolean;

  @IsOptional()
  @IsBoolean()
  rejectIfLocationMismatch?: boolean;
}

export class JobOpeningMatchCriteriaDto {
  @Transform(normalizeStringArray)
  @IsArray()
  @ArrayMaxSize(120)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  requiredSkills: string[] = [];

  @Transform(normalizeStringArray)
  @IsArray()
  @ArrayMaxSize(120)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  preferredSkills: string[] = [];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumYearsExperience?: number | null;

  @Transform(normalizeStringArray)
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  educationLevels: string[] = [];

  @Transform(normalizeStringArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  allowedWorkModes: string[] = [];

  @Transform(normalizeStringArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  allowedLocations: string[] = [];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  noticePeriodDays?: number | null;

  @ValidateNested()
  @Type(() => JobOpeningMatchWeightsDto)
  weights!: JobOpeningMatchWeightsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => JobOpeningKnockoutRulesDto)
  knockoutRules?: JobOpeningKnockoutRulesDto;
}
