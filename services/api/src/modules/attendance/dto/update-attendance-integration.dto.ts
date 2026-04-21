import { AttendanceIntegrationType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdateAttendanceIntegrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(AttendanceIntegrationType)
  integrationType?: AttendanceIntegrationType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  endpointUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  configJson?: string;
}
