import { RuntimeModuleList } from "./runtime-module-list";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";
import type { PlatformModuleKey } from "@/lib/runtime/platform-runtime.types";

type PreferenceResponse = {
  defaultViewKey?: string | null;
};

export async function RuntimeModulePage({
  moduleKey,
}: {
  moduleKey: PlatformModuleKey;
}) {
  const definition = getPlatformModuleDefinition(moduleKey);
  const user = await requireSystemAdminUser(definition.routeBase);
  const preference = await apiRequestJson<PreferenceResponse>(
    `/platform-users/me/module-preferences?moduleKey=${encodeURIComponent(moduleKey)}`,
  ).catch((): PreferenceResponse => ({}));

  return (
    <RuntimeModuleList
      moduleKey={moduleKey}
      roleKeys={[user.role, ...(user.roleKeys ?? [])]}
      permissionKeys={user.permissionKeys}
      defaultViewKey={preference.defaultViewKey}
    />
  );
}
