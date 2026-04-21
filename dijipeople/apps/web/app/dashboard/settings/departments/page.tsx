import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { DepartmentRecord } from "../types";

export default async function DepartmentsPage() {
  const departments = await apiRequestJson<DepartmentRecord[]>("/departments");

  return (
    <SettingsShell
      description="Departments anchor employee records today and future workflow routing, reporting, and policy rules later."
      eyebrow="Organization Settings"
      title="Departments"
    >
      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Department Catalog
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Department master data
            </h3>
          </div>
          <Link
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/dashboard/settings/departments/new"
          >
            Add department
          </Link>
        </div>

        {departments.length === 0 ? (
          <EmptyState
            actionHref="/dashboard/settings/departments/new"
            actionLabel="Create first department"
            description="Departments can be linked to employees and used later for org-level reporting and approvals."
            title="No departments yet"
          />
        ) : (
          <table className="w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th className="px-4">Name</th>
                <th className="px-4">Code</th>
                <th className="px-4">Status</th>
                <th className="px-4">Updated</th>
                <th className="px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => (
                <tr
                  key={department.id}
                  className="rounded-2xl border border-border bg-white shadow-sm"
                >
                  <td className="rounded-l-2xl px-4 py-4">
                    <p className="font-medium text-foreground">
                      {department.name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {department.description || "No description"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {department.code || "Not set"}
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {department.isActive ? "Active" : "Inactive"}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted">
                    {new Date(department.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="rounded-r-2xl px-4 py-4">
                    <Link
                      className="text-sm font-medium text-accent transition hover:text-accent-strong"
                      href={`/dashboard/settings/departments/${department.id}/edit`}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </SettingsShell>
  );
}

function EmptyState({
  actionHref,
  actionLabel,
  description,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-border bg-white/80 p-10 text-center">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">{title}</p>
      <p className="mt-3 text-muted">{description}</p>
      <Link
        className="mt-6 inline-flex rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
        href={actionHref}
      >
        {actionLabel}
      </Link>
    </div>
  );
}
