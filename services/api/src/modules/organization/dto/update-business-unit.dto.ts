import { BusinessUnitType } from '@prisma/client';
import {
  IsEmail,
  IsBoolean,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const STRUCTURE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const STRUCTURE_SUB_STATUSES = [
  'OPERATIONAL',
  'UNDER_SETUP',
  'PENDING_ACTIVATION',
  'DEACTIVATED',
  'ARCHIVED',
  'MERGED',
  'CLOSED',
] as const;

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
  @IsUUID()
  headEmployeeId?: string | null;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null;

  @IsOptional()
  @IsIn(STRUCTURE_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(STRUCTURE_SUB_STATUSES)
  subStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

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
