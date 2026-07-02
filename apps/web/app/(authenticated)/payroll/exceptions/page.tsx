import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollExceptionRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PayrollExceptionCenter({ searchParams }: Props) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);
  if (!user || !hasPermission(user.permissionKeys, "payroll-exceptions.read")) {
    return <AccessDeniedState title="Access denied" description="Payroll exception access is required." />;
  }
  const query = new URLSearchParams();
  for (const key of ["runId", "severity", "category", "search", "sort"] as const) {
    const value = first(params[key]);
    if (value) query.set(key, value);
  }
  const records = await apiRequestJson<Readonly<Record<string, unknown>>[]>(
    `/payroll/operations/exceptions${query.size ? `?${query}` : ""}`,
  );
  const runtime = buildStandardRouteRuntime({ pageKind: "list", sessionUser: user, spec: payrollExceptionRuntimeSpec });
  const activeView = runtime.metadata.views.find((view) => view.isDefault) ?? runtime.metadata.views[0] ?? null;
  return (
    <PayrollLayoutShell title="Payroll Exception Center" description="Resolve readiness blockers without duplicating payroll validation logic.">
      <StandardModuleListPage
        activeView={activeView}
        pagination={{ page: 1, pageSize: Math.max(records.length, 20), totalItems: records.length, pathname: "/payroll/exceptions", searchParams: Object.fromEntries(query) }}
        records={records}
        runtime={runtime}
        spec={payrollExceptionRuntimeSpec}
        title="Payroll Exceptions"
      />
    </PayrollLayoutShell>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
