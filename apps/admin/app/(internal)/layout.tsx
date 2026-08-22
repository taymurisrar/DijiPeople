import { AdminShell } from "@/app/_components/admin-shell";
import { ConsolePreferencesApplier } from "@/app/_components/console-preferences-applier";
import { PlatformDefaultsProvider } from "@/app/_components/platform-defaults-provider";
import { ToastProvider } from "@/app/_components/ui/toast-provider";
import { ErrorProvider } from "@/components/errors/error-provider";
import { requireSystemAdminUser } from "@/lib/auth";
import {
  DEFAULT_PREFERENCES,
  type ConsolePreferences,
} from "@/lib/console-preferences";
import { apiRequestJson } from "@/lib/server-api";
import { cookies } from "next/headers";
import { REMEMBER_ME_COOKIE } from "@/lib/auth-config";

export default async function InternalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireSystemAdminUser("/tenants");
  const cookieStore = await cookies();
  const rememberSession = cookieStore.get(REMEMBER_ME_COOKIE)?.value === "true";
  const settings = await apiRequestJson<{
    platformDefaults?: Record<string, string>;
    branding?: Record<string, string>;
  }>("/super-admin/platform-settings").catch(() => ({
    platformDefaults: {},
    branding: {},
  }));

  /*
   * Read on the server so theme and density are applied on the first render of
   * every page, not only while the preferences screen is open. A failed read
   * falls back to the defaults rather than blocking the console — an operator
   * locked out of admin because a preference lookup timed out would be a far
   * worse outcome than a session in Comfortable.
   */
  const preferences = await apiRequestJson<ConsolePreferences>(
    "/platform-users/me/preferences",
  ).catch(() => DEFAULT_PREFERENCES);

  return (
    <ErrorProvider user={{ role: user.role, roleKeys: user.roleKeys }}>
      <ConsolePreferencesApplier
        preferences={{ ...DEFAULT_PREFERENCES, ...preferences }}
      />
      <ToastProvider>
        <PlatformDefaultsProvider
          defaults={settings.platformDefaults ?? {}}
          appearance={settings.branding ?? {}}
        >
          <AdminShell
            rememberSession={rememberSession}
            user={{
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              roleKeys: user.roleKeys,
              permissionKeys: user.permissionKeys,
              role: user.role,
            }}
          >
            {children}
          </AdminShell>
        </PlatformDefaultsProvider>
      </ToastProvider>
    </ErrorProvider>
  );
}
