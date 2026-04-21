import { Transform } from 'class-transformer';
import { IsDateString, IsOptional } from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class TerminateEmployeeDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  terminationDate?: string;
}
