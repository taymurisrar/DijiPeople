import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const ORGANIZATION_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const ORGANIZATION_SUB_STATUSES = [
  'OPERATIONAL',
  'UNDER_SETUP',
  'PENDING_ACTIVATION',
  'DEACTIVATED',
  'ARCHIVED',
  'MERGED',
  'CLOSED',
] as const;

export class CreateOrganizationDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentOrganizationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  organizationType?: string;

  @IsOptional()
  @IsUUID()
  headEmployeeId?: string | null;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null;

  @IsOptional()
  @IsIn(ORGANIZATION_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(ORGANIZATION_SUB_STATUSES)
  subStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
