import { requireSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import { MyWorkManager } from "./_components/my-work-manager";
import {
  buildItemsQuery,
  type WorkItemPage,
  type WorkQueue,
} from "./_lib/work-items";

export default async function MyWorkPage() {
  const user = await requireSessionUser("/work");
  if (!hasPermission(user.permissionKeys, PERMISSION_KEYS.WORK_ITEMS_READ)) {
    return <AccessDeniedState />;
  }

  const canReadQueues = hasPermission(
    user.permissionKeys,
    PERMISSION_KEYS.WORK_QUEUES_READ,
  );
  const [page, queues] = await Promise.all([
    apiRequestJson<WorkItemPage>(
      `/work-items?${buildItemsQuery({ mine: true })}`,
    ),
    // Queue names are a nicety for the Queue column; the screen works without.
    canReadQueues
      ? apiRequestJson<WorkQueue[]>("/work-queues").catch((): WorkQueue[] => [])
      : Promise.resolve<WorkQueue[]>([]),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Work
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          My work
        </h2>
      </section>
      <MyWorkManager
        canWrite={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.WORK_ITEMS_WRITE,
        )}
        initialItems={page.items ?? []}
        queues={queues}
      />
    </div>
  );
}
