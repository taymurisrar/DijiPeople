import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasPermission, isSelfServiceUser } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { Button } from "@/app/components/ui/button";
import { EmployeeListResponse } from "./types";
import { TenantResolvedSettingsResponse } from "../settings/types";
import { EmployeesTable } from "./_components/employees-table";
import { EmployeesFilterBar } from "./_components/employees-filter-bar";

type EmployeesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EmployeesPage({
  searchParams,
}: EmployeesPageProps) {
  const user = await getSessionUser();
  const canCreateEmployee = hasPermission(user?.permissionKeys, "employees.create");

  if (user && isSelfServiceUser(user.permissionKeys)) {
    redirect("/dashboard/profile");
  }

  const params = await searchParams;
  const search = getSearchParam(params.search);
  const employmentStatus = getSearchParam(params.employmentStatus);
  const reportingManagerEmployeeId = getSearchParam(
    params.reportingManagerEmployeeId,
  );
  const page = getPositiveNumberParam(params.page, 1);
  const pageSize = getPositiveNumberParam(params.pageSize, 10);

  const query = new URLSearchParams();
  if (search) {
    query.set("search", search);
  }
  if (employmentStatus) {
    query.set("employmentStatus", employmentStatus);
  }
  if (reportingManagerEmployeeId) {
    query.set("reportingManagerEmployeeId", reportingManagerEmployeeId);
  }
  query.set("page", String(page));
  query.set("pageSize", String(pageSize));

  const [employees, managers, resolvedSettings] = await Promise.all([
    apiRequestJson<EmployeeListResponse>(`/employees?${query.toString()}`),
    apiRequestJson<EmployeeListResponse>("/employees?page=1&pageSize=100"),
    apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved").catch(
      () => null,
    ),
  ]);

  const formatting = {
    dateFormat: resolvedSettings?.system.dateFormat || "MM/dd/yyyy",
    locale: resolvedSettings?.system.locale || "en-US",
    timezone:
      resolvedSettings?.organization.timezone ||
      resolvedSettings?.system.defaultTimezone ||
      "UTC",
  };

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(234,248,244,0.88))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Employee Management
          </p>
          <h3 className="font-serif text-4xl text-foreground">
            Manage{" "}
            {resolvedSettings?.organization.companyDisplayName || "your tenant"}{" "}
            workforce from one place.
          </h3>
          <p className="max-w-3xl text-muted">
            This is the first operational HR module in DijiPeople. It is
            tenant-aware, permission-guarded, and ready to expand into leave,
            attendance, and payroll dependencies.
          </p>
        </div>
        {canCreateEmployee ? (
          <Button href="/dashboard/employees/new" variant="primary" size="lg">
            Add employee
          </Button>
        ) : null}
      </section>

      <EmployeesFilterBar managerOptions={managers.items} />

      {employees.items.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            No employees found
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            Your employee directory is empty for this filter set.
          </h4>
          <p className="mt-3 text-muted">
            Start by creating the first employee record, or widen your filters
            to see more results.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {canCreateEmployee ? (
              <Link
                className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
                href="/dashboard/employees/new"
              >
                Create employee
              </Link>
            ) : null}
            <Link
              className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
              href="/dashboard/employees"
            >
              Reset filters
            </Link>
          </div>
        </section>
      ) : (
        <EmployeesTable
          employees={employees.items}
          formatting={formatting}
          pagination={{
            page: employees.meta?.page ?? page,
            pageSize: employees.meta?.pageSize ?? pageSize,
            totalItems: employees.meta?.total ?? employees.items.length,
            pathname: "/dashboard/employees",
            searchParams: {
              search,
              employmentStatus,
              reportingManagerEmployeeId,
            },
          }}
        />
      )}
    </main>
  );
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function getPositiveNumberParam(
  value: string | string[] | undefined,
  fallback: number,
) {
  const resolved = Array.isArray(value) ? value[0] : value;
  const parsed = Number(resolved);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}