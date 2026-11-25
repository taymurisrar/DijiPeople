import { requireSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { WorkQueuesManager } from "../_components/work-queues-manager";
import type { WorkQueue } from "../_lib/work-items";

export default async function WorkQueuesPage() {
  const user = await requireSessionUser("/work/queues");
  if (!hasPermission(user.permissionKeys, PERMISSION_KEYS.WORK_QUEUES_READ)) {
    return <AccessDeniedState />;
  }

  const queues = await apiRequestJson<WorkQueue[]>("/work-queues");

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Work
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Work queues
        </h2>
      </section>
      <WorkQueuesManager
        canClaimOrAssign={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.WORK_ITEMS_WRITE,
        )}
        canManage={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.WORK_QUEUES_MANAGE,
        )}
        initialQueues={queues}
      />
    </div>
  );
}
