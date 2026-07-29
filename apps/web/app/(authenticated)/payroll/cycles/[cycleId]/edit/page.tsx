import { unstable_noStore as noStore } from "next/cache";
import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollCycleRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../../../_components/payroll-layout-shell";

type Props = {
  params: Promise<{ cycleId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function EditPayrollCyclePage({
  params,
  searchParams,
}: Props) {
  noStore();

  const [{ cycleId }, user, query] = await Promise.all([
    params,
    getSessionUser(),
    searchParams,
  ]);
  const record = await apiRequestJson<Record<string, unknown>>(
    `/payroll/cycles/${encodeURIComponent(cycleId)}`,
  );
  const runtime = buildStandardRouteRuntime({
    pageKind: "edit",
    recordId: cycleId,
    sessionUser: user,
    spec: payrollCycleRuntimeSpec,
  });

  return (
    <PayrollLayoutShell
      title={
        typeof record.name === "string" && record.name.trim()
          ? `Edit ${record.name}`
          : "Edit Payroll Cycle"
      }
      description="Update the payroll cycle definition and generation defaults."
    >
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(
          runtime.metadata.forms,
          first(query?.formId),
          "main",
        )}
        mode="edit"
        record={record}
        recordId={cycleId}
        runtime={runtime}
        spec={payrollCycleRuntimeSpec}
      />
    </PayrollLayoutShell>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
