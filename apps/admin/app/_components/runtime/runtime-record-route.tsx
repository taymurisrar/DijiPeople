import { RuntimeRecordPage } from "./runtime-record-page";
import { requireSystemAdminUser } from "@/lib/auth";
import type { PlatformModuleKey } from "@/lib/runtime/platform-runtime.types";

export async function RuntimeRecordRoute({
  moduleKey,
  recordId,
  initialValues,
}: {
  moduleKey: PlatformModuleKey;
  recordId?: string;
  initialValues?: Record<string, unknown>;
}) {
  const user = await requireSystemAdminUser();
  return (
    <RuntimeRecordPage
      moduleKey={moduleKey}
      recordId={recordId}
      initialValues={initialValues}
      roleKeys={[user.role, ...(user.roleKeys ?? [])]}
      permissionKeys={user.permissionKeys}
    />
  );
}
