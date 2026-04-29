import { IsUUID } from 'class-validator';

export class LinkUserEmployeeDto {
  @IsUUID()
  employeeId!: string;
}
