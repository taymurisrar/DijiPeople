import { unstable_noStore as noStore } from "next/cache";
import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../../../_components/payroll-layout-shell";
import {
  asCompensationPayComponents,
  asPayComponents,
  buildEmployeeCompensationSpec,
  type PayComponentRecord,
} from "../../compensation-runtime";

type Props = {
  params: Promise<{ compensationId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function EditEmployeeCompensationPage({
  params,
  searchParams,
}: Props) {
  noStore();

  const [{ compensationId }, user, query] = await Promise.all([
    params,
    getSessionUser(),
    searchParams,
  ]);
  const [record, payComponents] = await Promise.all([
    apiRequestJson<Record<string, unknown>>(
      `/payroll/compensations/${encodeURIComponent(compensationId)}`,
    ),
    apiRequestJson<PayComponentRecord[]>("/pay-components?isActive=true"),
  ]);
  const spec = buildEmployeeCompensationSpec(
    asCompensationPayComponents(record, asPayComponents(payComponents)),
  );
  const runtime = buildStandardRouteRuntime({
    pageKind: "edit",
    recordId: compensationId,
    sessionUser: user,
    spec,
  });
  const displayRecord = withDisplayFields(record);

  return (
    <PayrollLayoutShell
      title={`Edit ${stringValue(displayRecord.employeeName) || "Employee Compensation"}`}
      description="Update the employee compensation record."
    >
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(
          runtime.metadata.forms,
          first(query?.formId),
          "main",
        )}
        mode="edit"
        record={displayRecord}
        recordId={compensationId}
        runtime={runtime}
        spec={spec}
      />
    </PayrollLayoutShell>
  );
}

function withDisplayFields(record: Record<string, unknown>) {
  const employee = isRecord(record.employee) ? record.employee : {};
  return {
    ...record,
    employeeName: stringValue(record.employeeName) || stringValue(employee.fullName),
    employeeCode: stringValue(record.employeeCode) || stringValue(employee.employeeCode),
    workEmail: stringValue(record.workEmail) || stringValue(employee.workEmail),
  };
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
