import { PayrollRunLineItemCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePayrollAdjustmentDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsUUID()
  payComponentId?: string;

  @IsString()
  @MaxLength(160)
  label!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;

  @IsString()
  @MaxLength(3)
  currencyCode!: string;

  @IsOptional()
  @IsEnum(PayrollRunLineItemCategory)
  category?: PayrollRunLineItemCategory;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sourceReference?: string;
}

export class UpdatePayrollAdjustmentDto {
  @IsOptional()
  @IsUUID()
  payComponentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @IsOptional()
  @IsEnum(PayrollRunLineItemCategory)
  category?: PayrollRunLineItemCategory;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sourceReference?: string | null;
}

export class PayrollAdjustmentDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class PayrollExceptionActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
