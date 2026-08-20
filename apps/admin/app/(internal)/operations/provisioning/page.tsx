import type { Metadata } from "next";

import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { ProvisioningQueue, type ProvisioningQueueRow } from "./provisioning-queue";

export const metadata: Metadata = {
  title: "Provisioning operations",
};

/**
 * The provisioning queue.
 *
 * Provisioning runs and their steps have been recorded for a while and nothing
 * read them across tenants. An operator could open one workspace and see its
 * history, but there was no answer to the only question that matters when
 * somebody has paid and cannot use the product: **is anybody stuck right now.**
 *
 * Every figure on this page comes from a recorded run. Nothing is estimated and
 * nothing is invented — an empty queue renders as empty rather than as zeroes
 * that imply measurement.
 */
export default async function ProvisioningOperationsPage() {
  await requireSystemAdminUser("/operations/provisioning");

  const queue = await apiRequestJson<{
    rows?: ProvisioningQueueRow[];
    counts?: Record<string, number>;
  }>("/platform/tenants/provisioning-queue");

  return (
    <ProvisioningQueue
      rows={queue.rows ?? []}
      counts={queue.counts ?? {}}
    />
  );
}
