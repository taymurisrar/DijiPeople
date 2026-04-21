import { IsString, MaxLength, MinLength } from 'class-validator';

export class InvitationStatusQueryDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}
