import { BusinessUnitType } from '@prisma/client';
import { IsEmail, IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBusinessUnitDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsUUID()
  parentBusinessUnitId?: string;

  @IsOptional()
  @IsEnum(BusinessUnitType)
  type?: BusinessUnitType;

  @IsOptional()
  @IsObject()
  settingsJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  payrollContactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  payrollContactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  payrollContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  approvalContactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  approvalContactEmail?: string;
}
