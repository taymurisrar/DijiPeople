import { ApplicationReleaseChannel } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';

/**
 * Sets a tenant's desktop-agent rollout (TASK-0027): whether the agent is
 * enabled for them and which release channel their agents update from.
 */
export class SetAgentAssignmentDto {
  @IsBoolean()
  isEnabled!: boolean;

  @IsEnum(ApplicationReleaseChannel)
  channel!: ApplicationReleaseChannel;
}
