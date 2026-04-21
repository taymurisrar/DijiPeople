import { Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class DocumentTypeLinkDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  documentTypeId?: string;
}
