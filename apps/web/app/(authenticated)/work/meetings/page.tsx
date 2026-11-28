import { requireSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { MeetingsManager } from "../_components/meetings-manager";
import { loadProjectOptions } from "../_lib/project-options";
import {
  buildMeetingsQuery,
  type Meeting,
  type Page,
} from "../_lib/decisions";
import { loadPeopleWithSelf } from "../_lib/people-with-self";

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    workItemId?: string;
    blockerId?: string;
    projectId?: string;
  }>;
}) {
  const user = await requireSessionUser("/work/meetings");
  if (!hasPermission(user.permissionKeys, PERMISSION_KEYS.WORK_ITEMS_READ)) {
    return <AccessDeniedState />;
  }

  const params = (await searchParams) ?? {};
  const link = {
    ...(params.workItemId?.trim() ? { workItemId: params.workItemId.trim() } : {}),
    ...(params.blockerId?.trim() ? { blockerId: params.blockerId.trim() } : {}),
    ...(params.projectId?.trim() ? { projectId: params.projectId.trim() } : {}),
  };
  const [page, people, projects] = await Promise.all([
    apiRequestJson<Page<Meeting>>(`/work-meetings?${buildMeetingsQuery(link)}`),
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
          Meetings
        </h2>
      </section>
      <MeetingsManager
        canWrite={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.WORK_ITEMS_WRITE,
        )}
        initialPage={page}
        link={link}
        people={people}
        projects={projects}
      />
    </div>
  );
}
