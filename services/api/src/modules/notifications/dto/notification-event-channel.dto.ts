import { IsBoolean, IsIn } from 'class-validator';
import {
  EVENT_SETTINGS_CHANNELS,
  type EventSettingsChannel,
} from '../notification-event-delivery';

/*
 * ITEM-0180. One toggle on the notification events page: one channel of one
 * event, on or off. The event is the path parameter, not a body field, so a
 * client cannot aim a body at a different event than the URL names. Only
 * IN_APP and EMAIL — the channels a code path delivers — are accepted; PUSH
 * and SMS have no sender and would be a toggle that does nothing.
 * `notification-event-channel-dto-contract.spec.ts` runs the web page's real
 * payload through this class.
 */
export class UpdateNotificationEventChannelDto {
  @IsIn([...EVENT_SETTINGS_CHANNELS])
  channel!: EventSettingsChannel;

  @IsBoolean()
  enabled!: boolean;
}
