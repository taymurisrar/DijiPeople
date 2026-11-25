import { IsUUID } from 'class-validator';

export class AcknowledgeMonitoringPolicyDto {
  /** The policy version being acknowledged; must be the version in force now. */
  @IsUUID()
  versionId!: string;
}
