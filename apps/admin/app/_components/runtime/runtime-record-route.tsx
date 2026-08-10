import { RuntimeRecordPage } from "./runtime-record-page";
import { requireSystemAdminUser } from "@/lib/auth";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";
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
  const routeBase = getPlatformModuleDefinition(moduleKey).routeBase;
  const nextPath = recordId
    ? `${routeBase}/${encodeURIComponent(recordId)}`
    : `${routeBase}/new`;
  const user = await requireSystemAdminUser(nextPath);
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
