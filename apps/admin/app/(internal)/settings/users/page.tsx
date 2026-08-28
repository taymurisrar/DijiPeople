import { PageHeader } from "@/app/_components/ui/page-header";
import { SettingsUsersClient } from "@/app/_components/settings-users-client";
import { ACCESS_DENIED_ROUTE } from "@/lib/auth-config";
import { getSessionUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { redirect } from "next/navigation";
import { isPlatformSuperAdmin, type PlatformRole } from "@/lib/platform-rbac";
import type { Metadata } from "next";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Users",
};


type PlatformUser = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  /*
   * The full role union, not "SUPER_ADMIN" | "MEMBER".
   *
   * The platform defines sixteen roles and the API returns any of them. Typing
   * two meant every other role arrived as a type error waiting to happen, and
   * the client that renders this list already expects `PlatformRole`.
   */
  role: PlatformRole;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  lastActiveAt?: string | null;
};

export default async function SettingsUsersPage() {
  const currentUser = await getSessionUser();

  /*
   * Owner-level access is decided by `isPlatformSuperAdmin`, not by comparing
   * the role string. SUPER_ADMIN is the legacy name for this level — the app's
   * own `formatPlatformRole` renders it as "Platform Owner (legacy Super
   * Admin)" — and the API grants `platform.*` to both. Testing for the literal
   * locked the current PLATFORM_OWNER role out of its own settings pages.
   */
  if (!isPlatformSuperAdmin(currentUser?.role)) {
    redirect(ACCESS_DENIED_ROUTE);
  }

  const users = await apiRequestJson<PlatformUser[]>("/platform-users");

  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Users & access"
        description="Manage platform users separately from tenant users and tenant roles."
      />
      <SettingsUsersClient currentUserId={currentUser?.userId} users={users} />
    </main>
  );
}
