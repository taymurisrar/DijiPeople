import { requireSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { TeamUpdatesManager } from "../_components/team-updates-manager";
import {
  buildUpdatesQuery,
  dateInputFor,
  type DailyUpdatePage,
} from "../_lib/daily-updates";

export default async function TeamUpdatesPage() {
  const user = await requireSessionUser("/work/daily-updates");
  if (!hasPermission(user.permissionKeys, PERMISSION_KEYS.DAILY_UPDATES_READ)) {
    return <AccessDeniedState />;
  }

  const from = new Date();
  from.setDate(from.getDate() - 6);
  const page = await apiRequestJson<DailyUpdatePage>(
    `/daily-updates?${buildUpdatesQuery({
      from: dateInputFor(from),
      to: dateInputFor(),
    })}`,
  );

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Work
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Team updates
        </h2>
      </section>
      <TeamUpdatesManager
        canAcknowledge={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.DAILY_UPDATES_ACKNOWLEDGE,
        )}
        initialUpdates={page.items ?? []}
      />
    </div>
  );
}
