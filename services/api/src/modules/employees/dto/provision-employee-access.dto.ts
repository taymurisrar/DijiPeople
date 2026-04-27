import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

function emptyArrayToUndefined({ value }: { value: unknown }) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.length === 0 ? undefined : value;
}

export class ProvisionEmployeeAccessDto {
  @IsOptional()
  @IsBoolean()
  provisionSystemAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  sendInvitationNow?: boolean;

  @IsOptional()
  @Transform(emptyArrayToUndefined)
  @IsArray()
  @IsUUID('4', { each: true })
  initialRoleIds?: string[];
}
