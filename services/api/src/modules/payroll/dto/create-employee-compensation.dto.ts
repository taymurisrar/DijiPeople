import { PayFrequency, PaymentMode, PayrollStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeMonetaryAmount({ value }: { value: unknown }) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
}

export class CreateEmployeeCompensationDto {
  @IsUUID()
  employeeId!: string;

  @Transform(normalizeMonetaryAmount)
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'basicSalary must be a valid monetary amount.',
  })
  basicSalary!: string;

  @IsOptional()
  @IsEnum(PayFrequency)
  payFrequency?: PayFrequency;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsEnum(PayrollStatus)
  payrollStatus?: PayrollStatus;

  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  payrollGroup?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  bankAccountTitle?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(64)
  bankAccountNumber?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(64)
  bankIban?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(64)
  bankRoutingNumber?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(64)
  taxIdentifier?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeCompensationComponentInputDto)
  components?: EmployeeCompensationComponentInputDto[];
}

export class EmployeeCompensationComponentInputDto {
  @IsUUID()
  payComponentId!: string;

  @IsOptional()
  @Transform(normalizeMonetaryAmount)
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount?: string;

  @IsOptional()
  @Transform(normalizeMonetaryAmount)
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  overrideAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  overrideReason?: string;

  @IsOptional()
  @Transform(normalizeMonetaryAmount)
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  percentage?: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
