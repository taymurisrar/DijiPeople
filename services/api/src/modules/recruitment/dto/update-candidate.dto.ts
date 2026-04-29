import {
  EmployeeGender,
  EmployeeWorkMode,
  RecruitmentStage,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CandidateEducationDto,
  CandidateExperienceDto,
} from './create-candidate.dto';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeStringArray({ value }: { value: unknown }) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

export class UpdateCandidateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  middleName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEmail()
  @MaxLength(255)
  personalEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(40)
  alternatePhone?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  source?: string;

  @IsOptional()
  @IsEnum(RecruitmentStage)
  currentStatus?: RecruitmentStage;

  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  nationalityCountryId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  currentCountryId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  currentStateProvinceId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  currentCityId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(255)
  addressArea?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(4000)
  profileSummary?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(160)
  currentEmployer?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(160)
  currentDesignation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  totalYearsExperience?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  relevantYearsExperience?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  currentSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  expectedSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  noticePeriodDays?: number;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  earliestJoiningDate?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(1500)
  reasonForLeavingCurrentEmployer?: string;

  @IsOptional()
  @IsEnum(EmployeeWorkMode)
  preferredWorkMode?: EmployeeWorkMode;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(160)
  preferredLocation?: string;

  @IsOptional()
  @IsBoolean()
  willingToRelocate?: boolean;

  @IsOptional()
  @Transform(normalizeStringArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  skills?: string[];

  @IsOptional()
  @Transform(normalizeStringArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  certifications?: string[];

  @IsOptional()
  @Transform(normalizeStringArray)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  interests?: string[];

  @IsOptional()
  @Transform(normalizeStringArray)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  hobbies?: string[];

  @IsOptional()
  @Transform(normalizeStringArray)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  strengths?: string[];

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(2000)
  concerns?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(2000)
  recruiterNotes?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(2000)
  hrNotes?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  portfolioUrl?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  linkedInUrl?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  otherProfileUrl?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(255)
  resumeDocumentReference?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CandidateEducationDto)
  @IsArray()
  educationRecords?: CandidateEducationDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CandidateExperienceDto)
  @IsArray()
  experienceRecords?: CandidateExperienceDto[];
}
