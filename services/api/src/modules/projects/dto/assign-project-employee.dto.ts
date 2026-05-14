import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ProjectAllocationType, ProjectResourceStatus } from '@prisma/client';

export class AssignProjectEmployeeDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleOnProject?: string;

  @IsOptional()
  @IsUUID()
  projectRoleId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  allocationPercent?: number;

  @IsOptional()
  @IsNumberString()
  allocationHours?: string;

  @IsOptional()
  @IsEnum(ProjectAllocationType)
  allocationType?: ProjectAllocationType;

  @IsOptional()
  @IsBoolean()
  billableFlag?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  approvalManagerEmployeeId?: string;

  @IsOptional()
  @IsEnum(ProjectResourceStatus)
  status?: ProjectResourceStatus;

  @IsOptional()
  @MaxLength(3)
  currencyCode?: string;
}
