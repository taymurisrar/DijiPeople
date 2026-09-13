"use client";

import { usePathname, useRouter } from "next/navigation";
import { SegmentedControl } from "@/app/components/ui/segmented-control";
import {
  DELIVERY_LOG_CHANNEL_OPTIONS,
  deliveryLogChannelHref,
  type DeliveryLogChannel,
} from "../_lib/delivery-log-channel";

/** ITEM-0182 — Email / In-app switch for the Delivery Logs screen. */
export function DeliveryLogChannelSwitch({
  value,
}: {
  readonly value: DeliveryLogChannel;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <SegmentedControl
      label="Channel"
      onChange={(channel) =>
        router.push(deliveryLogChannelHref(pathname, channel))
      }
      options={[...DELIVERY_LOG_CHANNEL_OPTIONS]}
      value={value}
    />
  );
}
