import { PayFrequency, PaymentMode, PayrollStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class UpsertEmployeeCompensationDto {
  @Matches(/^\d+(\.\d{1,2})?$/)
  basicSalary!: string;

  @IsEnum(PayFrequency)
  payFrequency!: PayFrequency;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(8)
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
}
