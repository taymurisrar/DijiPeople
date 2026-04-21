import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";

export async function requireSettingsPermissions(
  permissionKeys: readonly string[],
  fallbackHref = "/dashboard/settings/tenant",
) {
  const user = await getSessionUser();

  if (!user || !hasAnyPermission(user.permissionKeys, permissionKeys)) {
    redirect(fallbackHref);
  }

  return user;
}
