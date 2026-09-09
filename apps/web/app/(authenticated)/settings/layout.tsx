import { ReactNode } from "react";
import { AuthenticatedAccessBoundary } from "../_components/authenticated-shell-provider";
import { requireSettingsPermissions } from "./_lib/require-settings-permission";
import { SettingsEntitlementBoundary } from "./_components/settings-entitlement-boundary";

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
      {/*
        Inside the access boundary, so permission is settled before plan is. A
        user without `settings.read` should be told they lack access rather
        than told their plan is missing something: they would not see the page
        either way, and only one of those two answers is theirs to act on.
      */}
      <SettingsEntitlementBoundary>{children}</SettingsEntitlementBoundary>
    </AuthenticatedAccessBoundary>
  );
}
