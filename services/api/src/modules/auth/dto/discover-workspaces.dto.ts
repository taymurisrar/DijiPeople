import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Credentials for workspace discovery — signing in without naming a workspace.
 *
 * Deliberately **not** an email-only DTO. An endpoint that takes an address and
 * answers which workspaces it reaches is a customer-enumeration oracle no
 * amount of rate limiting fixes: feed it a list of company addresses and the
 * answers map DijiPeople's customer base. Requiring the password means the only
 * caller who learns anything is the person the answer is about.
 */
export class DiscoverWorkspacesDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
