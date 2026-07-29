import { IsUUID } from 'class-validator';

export class CreateTeamRoleDto {
  @IsUUID('4')
  roleId!: string;
}
