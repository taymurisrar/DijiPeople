import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateTeamMemberDto {
  @IsUUID('4')
  userId!: string;

  @IsOptional()
  @IsBoolean()
  isOwner?: boolean;
}
