import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateTenantAccessUserDto {
  @IsString()
  @MaxLength(60)
  firstName!: string;

  @IsString()
  @MaxLength(60)
  lastName!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsIn(['GLOBAL_ADMIN', 'SERVICE_ACCOUNT'])
  accessType!: 'GLOBAL_ADMIN' | 'SERVICE_ACCOUNT';

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;
}

export class UpdateTenantAccessUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
