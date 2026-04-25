import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateBusinessUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  parentBusinessUnitId?: string | null;
}
