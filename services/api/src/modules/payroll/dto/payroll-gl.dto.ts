import {
  PayrollGlAccountType,
  PayrollRunLineItemCategory,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePayrollGlAccountDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsEnum(PayrollGlAccountType)
  accountType!: PayrollGlAccountType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePayrollGlAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsEnum(PayrollGlAccountType)
  accountType?: PayrollGlAccountType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePayrollPostingRuleDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsEnum(PayrollRunLineItemCategory)
  sourceCategory!: PayrollRunLineItemCategory;

  @IsOptional()
  @IsUUID()
  payComponentId?: string | null;

  @IsOptional()
  @IsUUID()
  taxRuleId?: string | null;

  @IsOptional()
  @IsUUID()
  debitAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  creditAccountId?: string | null;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePayrollPostingRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsEnum(PayrollRunLineItemCategory)
  sourceCategory?: PayrollRunLineItemCategory;

  @IsOptional()
  @IsUUID()
  payComponentId?: string | null;

  @IsOptional()
  @IsUUID()
  taxRuleId?: string | null;

  @IsOptional()
  @IsUUID()
  debitAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  creditAccountId?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
