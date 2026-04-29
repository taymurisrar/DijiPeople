import { BusinessUnitType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateBusinessUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  parentBusinessUnitId?: string | null;

  @IsOptional()
  @IsEnum(BusinessUnitType)
  type?: BusinessUnitType;

  @IsOptional()
  @IsObject()
  settingsJson?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  payrollContactName?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  payrollContactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  payrollContactPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  approvalContactName?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  approvalContactEmail?: string | null;
}
