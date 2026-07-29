import { BusinessUnitType } from '@prisma/client';
import {
  IsEmail,
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
