import { EmployeeGender, EmployeeMaritalStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class UpdatePersonalInfoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(60)
  middleName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName?: string;

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

  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(30)
  phone?: string;

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
}
