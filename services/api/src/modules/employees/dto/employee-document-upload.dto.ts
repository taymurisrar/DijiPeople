import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class EmployeeDocumentUploadDto {
  @Transform(emptyStringToUndefined)
  @IsUUID()
  documentTypeId!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  documentCategoryId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(500)
  description?: string;
}
