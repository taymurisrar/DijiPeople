import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class UpdateEmergencyContactDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  emergencyContactRelationTypeId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  emergencyContactRelation?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(30)
  emergencyContactAlternatePhone?: string;
}
