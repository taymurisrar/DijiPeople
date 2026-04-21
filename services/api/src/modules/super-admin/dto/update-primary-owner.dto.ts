import { IsUUID } from 'class-validator';

export class UpdatePrimaryOwnerDto {
  @IsUUID()
  userId!: string;
}
