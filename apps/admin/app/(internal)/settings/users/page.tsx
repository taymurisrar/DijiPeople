import { PageHeader } from "@/app/_components/ui/page-header";
import { SettingsUsersClient } from "@/app/_components/settings-users-client";
import { ACCESS_DENIED_ROUTE } from "@/lib/auth-config";
import { getSessionUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { redirect } from "next/navigation";

type PlatformUser = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "SUPER_ADMIN" | "MEMBER";
  status: "ACTIVE" | "INVITED" | "DISABLED";
  lastActiveAt?: string | null;
};

export default async function SettingsUsersPage() {
  const currentUser = await getSessionUser();

  if (currentUser?.role !== "SUPER_ADMIN") {
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
