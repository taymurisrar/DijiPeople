import { AdminShell } from "@/app/_components/admin-shell";
import { PlatformDefaultsProvider } from "@/app/_components/platform-defaults-provider";
import { ToastProvider } from "@/app/_components/ui/toast-provider";
import { ErrorProvider } from "@/components/errors/error-provider";
import { requireSystemAdminUser } from "@/lib/auth";
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

  return (
    <ErrorProvider user={{ role: user.role, roleKeys: user.roleKeys }}>
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
