import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class TenantSignupDto {
  @IsString()
  @MaxLength(120)
  companyName!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must use lowercase letters, numbers, and hyphens only.',
  })
  @MaxLength(64)
  slug!: string;

  @IsString()
  @MaxLength(60)
  adminFirstName!: string;

  @IsString()
  @MaxLength(60)
  adminLastName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
