import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class UpdateTeamRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
