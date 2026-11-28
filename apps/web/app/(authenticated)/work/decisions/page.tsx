import { requireSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { DecisionsManager } from "../_components/decisions-manager";
import {
  buildDecisionsQuery,
  type Decision,
  type Page,
} from "../_lib/decisions";
import { loadPeopleWithSelf } from "../_lib/people-with-self";
import { loadProjectOptions } from "../_lib/project-options";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    open?: string;
    workItemId?: string;
    blockerId?: string;
    projectId?: string;
  }>;
}) {
  const user = await requireSessionUser("/work/decisions");
  if (!hasPermission(user.permissionKeys, PERMISSION_KEYS.WORK_ITEMS_READ)) {
    return <AccessDeniedState />;
  }

  const params = (await searchParams) ?? {};
  const link = {
    ...(params.workItemId?.trim() ? { workItemId: params.workItemId.trim() } : {}),
    ...(params.blockerId?.trim() ? { blockerId: params.blockerId.trim() } : {}),
    ...(params.projectId?.trim() ? { projectId: params.projectId.trim() } : {}),
  };
  const openId = params.open && UUID.test(params.open) ? params.open : undefined;
  const [page, people, projects] = await Promise.all([
    apiRequestJson<Page<Decision>>(`/work-decisions?${buildDecisionsQuery(link)}`),
    loadPeopleWithSelf(),
    loadProjectOptions(),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Work
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Decisions
        </h2>
      </section>
      <DecisionsManager
        canWrite={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.WORK_ITEMS_WRITE,
        )}
        initialPage={page}
        link={link}
        openId={openId}
        people={people}
        projects={projects}
      />
    </div>
  );
}
