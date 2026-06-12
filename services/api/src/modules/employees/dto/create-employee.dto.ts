import {
  EmployeeContractType,
  EmployeeEmploymentStatus,
  EmployeeGender,
  EmployeeMaritalStatus,
  EmployeeRecordType,
  EmployeeType,
  EmployeeWorkMode,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

const RECORD_STATUS_VALUES = [
  'ACTIVE',
  'INACTIVE',
  'DRAFT',
  'ARCHIVED',
] as const;
const RECORD_SUB_STATUS_VALUES = [
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'INACTIVE',
  'SUSPENDED',
  'DRAFT',
  'PENDING_REVIEW',
  'ARCHIVED',
  'RETIRED',
] as const;

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class CreateEmployeeDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(40)
  employeeCode?: string;

  @IsOptional()
  @IsIn(RECORD_STATUS_VALUES)
  status?: (typeof RECORD_STATUS_VALUES)[number];

  @IsOptional()
  @IsIn(RECORD_SUB_STATUS_VALUES)
  subStatus?: (typeof RECORD_SUB_STATUS_VALUES)[number];

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  ownerUserId?: string;

  @IsOptional()
  @IsEnum(EmployeeRecordType)
  recordType?: EmployeeRecordType;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(60)
  middleName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(60)
  preferredName?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEmail()
  @MaxLength(320)
  workEmail?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEmail()
  @MaxLength(320)
  personalEmail?: string;

  @IsString()
  @MinLength(7)
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(30)
  alternatePhone?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender;

  @IsOptional()
  @IsEnum(EmployeeMaritalStatus)
  maritalStatus?: EmployeeMaritalStatus;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  nationalityCountryId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(32)
  cnic?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(10)
  bloodGroup?: string;

  @IsEnum(EmployeeEmploymentStatus)
  employmentStatus!: EmployeeEmploymentStatus;

  @IsOptional()
  @IsEnum(EmployeeType)
  employeeType?: EmployeeType;

  @IsOptional()
  @IsEnum(EmployeeWorkMode)
  workMode?: EmployeeWorkMode;

  @IsOptional()
  @IsEnum(EmployeeContractType)
  contractType?: EmployeeContractType;

  @IsDateString()
  hireDate!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  confirmationDate?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  probationEndDate?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  terminationDate?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(255)
  addressLine1?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  stateProvinceId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  stateProvince?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(30)
  postalCode?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  emergencyContactRelationTypeId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  emergencyContactRelation?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(30)
  emergencyContactAlternatePhone?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  reportingManagerEmployeeId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  userId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  employeeLevelId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  defaultWorkScheduleId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  officialJoiningLocationId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(64)
  taxIdentifier?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  noticePeriodDays?: number;

  @IsOptional()
  @IsBoolean()
  provisionSystemAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  sendInvitationNow?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  initialRoleIds?: string[];
}
