import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

function emptyStringToNull({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class UpdateDocumentDto {
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsUUID()
  documentTypeId?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsUUID()
  documentCategoryId?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}
