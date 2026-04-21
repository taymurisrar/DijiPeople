import { AttendanceIntegrationType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateAttendanceIntegrationDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(AttendanceIntegrationType)
  integrationType!: AttendanceIntegrationType;

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
