import {
  AttendanceEntrySource,
  AttendanceEntryStatus,
  AttendanceMode,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class AttendanceQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(AttendanceEntryStatus)
  status?: AttendanceEntryStatus;

  @IsOptional()
  @IsEnum(AttendanceMode)
  attendanceMode?: AttendanceMode;

  @IsOptional()
  @IsEnum(AttendanceEntrySource)
  source?: AttendanceEntrySource;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  officeLocationId?: string;

  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  view?: 'day' | 'week' | 'month';

  @IsOptional()
  @IsIn(['all', 'team'])
  scope?: 'all' | 'team';

  @IsOptional()
  @IsIn(['date', 'employeeName', 'checkIn', 'checkOut', 'status'])
  sortField?: 'date' | 'employeeName' | 'checkIn' | 'checkOut' | 'status';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';

  @IsOptional()
  @IsString()
  orderBy?: string;

  @IsOptional()
  @IsString()
  employeeFilter?: string;

  @IsOptional()
  @IsString()
  employeeFilterOperator?: string;

  @IsOptional()
  @IsString()
  attendanceDateFilter?: string;

  @IsOptional()
  @IsString()
  attendanceDateFilterOperator?: string;

  @IsOptional()
  @IsString()
  attendanceDateFilterTo?: string;

  @IsOptional()
  @IsString()
  attendanceModeFilter?: string;

  @IsOptional()
  @IsString()
  statusFilter?: string;

  @IsOptional()
  @IsString()
  locationFilter?: string;

  @IsOptional()
  @IsString()
  sourceFilter?: string;

  @IsOptional()
  @IsString()
  detailsFilter?: string;

  @IsOptional()
  @IsString()
  detailsFilterOperator?: string;

  @IsOptional()
  @IsString()
  locationFilterOperator?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  pageSize = 20;
}
