import { EmployerBankAccountPurpose } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateEmployerBankAccountDto {
  @IsString() @MaxLength(160) accountName!: string;
  @IsOptional() @IsUUID() bankId?: string;
  @IsString() @MaxLength(160) accountTitle!: string;
  @IsOptional() @IsString() @MaxLength(80) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) iban?: string;
  @IsOptional() @IsString() @MaxLength(160) branch?: string;
  @IsString() @MaxLength(3) currencyCode!: string;
  @IsOptional()
  @IsEnum(EmployerBankAccountPurpose)
  accountPurpose?: EmployerBankAccountPurpose;
  @IsOptional() @IsBoolean() isDefaultPayrollAccount?: boolean;
  @IsOptional() @IsString() @MaxLength(40) paymentFileFormat?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateEmployerBankAccountDto extends CreateEmployerBankAccountDto {}
