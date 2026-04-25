import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBusinessUnitDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsUUID()
  parentBusinessUnitId?: string;
}
