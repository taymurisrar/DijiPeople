import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SubmitApplicationDto {
  @IsUUID()
  candidateId!: string;

  @IsUUID()
  jobOpeningId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
