import { requireSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { BlockersManager } from "../_components/blockers-manager";
import {
  buildBlockersQuery,
  type BlockerPage,
} from "../_lib/blockers";
import { loadEmployeeOptions } from "../_lib/employee-options";

export default async function BlockersPage({
  searchParams,
}: {
  searchParams?: Promise<{ projectId?: string }>;
}) {
  const user = await requireSessionUser("/work/blockers");
  if (!hasPermission(user.permissionKeys, PERMISSION_KEYS.WORK_ITEMS_READ)) {
    return <AccessDeniedState />;
  }

  const projectId = (await searchParams)?.projectId?.trim() || undefined;
  const [page, people] = await Promise.all([
    apiRequestJson<BlockerPage>(
      `/work-blockers?${buildBlockersQuery({ status: "OPEN", projectId })}`,
    ),
    loadEmployeeOptions(),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Work
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Blockers
        </h2>
      </section>
      <BlockersManager
        canWrite={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.WORK_ITEMS_WRITE,
        )}
        initialPage={page}
        people={people}
        projectId={projectId}
      />
    </div>
  );
}
