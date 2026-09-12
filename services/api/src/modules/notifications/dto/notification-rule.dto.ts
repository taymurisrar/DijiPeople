import { NotificationChannel, NotificationDisplayMode } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/*
 * BUG-3375. Deliberately narrow. `moduleKey`, `eventKey` and
 * `recipientResolverType` identify which piece of code this rule governs and
 * how recipients are resolved — they are wiring, not tenant configuration,
 * and are not exposed for edit here. `templateKey` is likewise left alone:
 * changing it would point the rule at a different NotificationTemplate
 * without any authoring surface to create one. What an administrator can
 * actually own is whether the event fires at all, on which channels, at what
 * priority/display mode, and whether it demands action.
 */
export class UpdateNotificationRuleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @IsOptional()
  @IsEnum(NotificationDisplayMode)
  displayMode?: NotificationDisplayMode;

  @IsOptional()
  @IsBoolean()
  requiresAction?: boolean;
}
