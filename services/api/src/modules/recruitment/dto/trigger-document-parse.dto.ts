import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TriggerDocumentParseDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  parserKey?: string;
}
