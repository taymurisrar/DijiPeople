import { ReactNode } from "react";
import { AuthenticatedAccessBoundary } from "../_components/authenticated-shell-provider";
import { requireSettingsPermissions } from "./_lib/require-settings-permission";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireSettingsPermissions(
    ["settings.read"],
    "/my-profile",
  );

  return (
    <AuthenticatedAccessBoundary
      fallbackUser={{
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        permissionKeys: user.permissionKeys,
        profileHref: "/my-profile",
        roleLabel: user.roles[0]?.name ?? user.roleKeys[0] ?? "Tenant User",
        roleKeys: user.roleKeys,
        tenantId: user.tenantId,
        tenantSlug: user.tenantSlug,
      }}
    >
      {children}
    </AuthenticatedAccessBoundary>
  );
}
