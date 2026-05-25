import { AdminShell } from "@/app/_components/admin-shell";
import { PlatformDefaultsProvider } from "@/app/_components/platform-defaults-provider";
import { ToastProvider } from "@/app/_components/ui/toast-provider";
import { ErrorProvider } from "@/components/errors/error-provider";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

export default async function InternalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireSystemAdminUser("/tenants");
  const settings = await apiRequestJson<{
    platformDefaults?: Record<string, string>;
  }>("/super-admin/platform-settings").catch(() => ({ platformDefaults: {} }));

  return (
    <ErrorProvider user={{ role: user.role, roleKeys: user.roleKeys }}>
      <ToastProvider>
        <PlatformDefaultsProvider defaults={settings.platformDefaults ?? {}}>
          <AdminShell
            user={{
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              roleKeys: user.roleKeys,
            }}
          >
            {children}
          </AdminShell>
        </PlatformDefaultsProvider>
      </ToastProvider>
    </ErrorProvider>
  );
}
