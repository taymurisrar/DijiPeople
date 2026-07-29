import { unstable_noStore as noStore } from "next/cache";
import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollCalendarRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../../../_components/payroll-layout-shell";

type Props = {
  params: Promise<{ calendarId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function EditPayrollCalendarPage({
  params,
  searchParams,
}: Props) {
  noStore();

  const [{ calendarId }, user, query] = await Promise.all([
    params,
    getSessionUser(),
    searchParams,
  ]);
  const record = await apiRequestJson<Record<string, unknown>>(
    `/payroll/calendars/${encodeURIComponent(calendarId)}`,
  );
  const runtime = buildStandardRouteRuntime({
    pageKind: "edit",
    recordId: calendarId,
    sessionUser: user,
    spec: payrollCalendarRuntimeSpec,
  });

  return (
    <PayrollLayoutShell
      title={
        typeof record.name === "string" && record.name.trim()
          ? `Edit ${record.name}`
          : "Edit Payroll Calendar"
      }
      description="Update the payroll calendar definition."
    >
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(
          runtime.metadata.forms,
          first(query?.formId),
          "main",
        )}
        mode="edit"
        record={withDisplayFields(record)}
        recordId={calendarId}
        runtime={runtime}
        spec={payrollCalendarRuntimeSpec}
      />
    </PayrollLayoutShell>
  );
}

function withDisplayFields(record: Record<string, unknown>) {
  return {
    ...record,
    businessUnitName: isRecord(record.businessUnit)
      ? stringValue(record.businessUnit.name)
      : stringValue(record.businessUnitName),
    status: record.isActive === false ? "INACTIVE" : "ACTIVE",
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
