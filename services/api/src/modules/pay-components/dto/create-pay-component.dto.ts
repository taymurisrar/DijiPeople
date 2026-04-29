import {
  PayComponentCalculationMethod,
  PayComponentType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePayComponentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_]+$/, {
    message: 'code may only contain letters, numbers, and underscores.',
  })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(140)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(PayComponentType)
  componentType!: PayComponentType;

  @IsEnum(PayComponentCalculationMethod)
  calculationMethod!: PayComponentCalculationMethod;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  affectsGrossPay?: boolean;

  @IsOptional()
  @IsBoolean()
  affectsNetPay?: boolean;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  displayOnPayslip?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
