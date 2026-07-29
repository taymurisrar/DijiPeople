import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateTeamMemberDto {
  @IsOptional()
  @IsBoolean()
  isOwner?: boolean;
}
