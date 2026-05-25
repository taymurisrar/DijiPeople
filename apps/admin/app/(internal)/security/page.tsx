import {
  AdminKeyValueGrid,
  AdminPageHeader,
  AdminSectionCard,
  AdminWorkspace,
} from "@/app/_components/admin-ui";
import { requireSystemAdminUser } from "@/lib/auth";

export default async function SecurityPage() {
  const user = await requireSystemAdminUser("/security");

  return (
    <AdminWorkspace>
      <AdminPageHeader
        eyebrow="Security"
        title="Security"
        description="Security and access details available from the authenticated session."
      />
      <AdminSectionCard title="Access summary">
        <AdminKeyValueGrid
          items={[
            { label: "Email", value: user.email },
            { label: "Tenant", value: user.tenantName },
            { label: "Roles", value: user.roleKeys?.join(", ") },
            {
              label: "Permissions",
              value: `${user.permissionKeys.length} permission(s)`,
            },
          ]}
        />
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
          Password and session management controls are disabled because no
          admin-facing account security mutation API is currently exposed.
        </div>
      </AdminSectionCard>
    </AdminWorkspace>
  );
}
