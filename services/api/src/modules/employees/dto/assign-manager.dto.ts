import { Transform } from 'class-transformer';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

function emptyStringToNull({ value }: { value: unknown }): unknown {
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  return value;
}

export class AssignManagerDto {
  @Transform(emptyStringToNull)
  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID('4')
  reportingManagerEmployeeId?: string | null;
}
