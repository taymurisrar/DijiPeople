import type { Metadata } from "next";
import {
  AdminKeyValueGrid,
  AdminPageHeader,
  AdminSectionCard,
  AdminWorkspace,
} from "@/app/_components/admin-ui";
import { requireSystemAdminUser } from "@/lib/auth";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Profile",
};


export default async function ProfilePage() {
  const user = await requireSystemAdminUser("/profile");
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email;
  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() ||
    user.email[0]?.toUpperCase() ||
    "A";

  return (
    <AdminWorkspace>
      <AdminPageHeader
        eyebrow="My profile"
        metadata={[
          { label: "Tenant", value: user.tenantName },
          { label: "Account", value: user.email },
        ]}
        title={displayName}
      />
      <AdminSectionCard title="Profile">
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xl font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <AdminKeyValueGrid
              items={[
                { label: "First name", value: user.firstName },
                { label: "Last name", value: user.lastName },
                { label: "Email", value: user.email },
                { label: "Tenant", value: user.tenantName },
                { label: "Roles", value: user.roleKeys?.join(", ") },
                {
                  label: "Permissions",
                  value: `${user.permissionKeys.length} permission(s)`,
                },
              ]}
            />
            <p className="mt-4 text-sm text-slate-600">
              Profile editing is read-only until a profile update API is
              available for admin users.
            </p>
          </div>
        </div>
      </AdminSectionCard>
    </AdminWorkspace>
  );
}
