import { requireSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { DailyUpdateEditor } from "../_components/daily-update-editor";

export default async function DailyUpdatePage() {
  const user = await requireSessionUser("/work/daily-update");
  if (!hasPermission(user.permissionKeys, PERMISSION_KEYS.DAILY_UPDATES_READ)) {
    return <AccessDeniedState />;
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Work
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Daily update
        </h2>
      </section>
      <DailyUpdateEditor
        canWrite={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.DAILY_UPDATES_WRITE,
        )}
      />
    </div>
  );
}
