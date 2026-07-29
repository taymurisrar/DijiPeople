import { unstable_noStore as noStore } from "next/cache";
import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollPeriodRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../../../_components/payroll-layout-shell";

type Props = {
  params: Promise<{ periodId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function EditPayrollPeriodPage({
  params,
  searchParams,
}: Props) {
  noStore();

  const [{ periodId }, user, query] = await Promise.all([
    params,
    getSessionUser(),
    searchParams,
  ]);
  const record = await apiRequestJson<Record<string, unknown>>(
    `/payroll/periods/${encodeURIComponent(periodId)}`,
  );
  const runtime = buildStandardRouteRuntime({
    pageKind: "edit",
    recordId: periodId,
    sessionUser: user,
    spec: payrollPeriodRuntimeSpec,
  });

  return (
    <PayrollLayoutShell
      title={
        typeof record.name === "string" && record.name.trim()
          ? `Edit ${record.name}`
          : "Edit Payroll Period"
      }
      description="Update payroll period dates, cutoff, payment schedule, and status."
    >
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(
          runtime.metadata.forms,
          first(query?.formId),
          "main",
        )}
        mode="edit"
        record={withDisplayFields(record)}
        recordId={periodId}
        runtime={runtime}
        spec={payrollPeriodRuntimeSpec}
      />
    </PayrollLayoutShell>
  );
}

function withDisplayFields(record: Record<string, unknown>) {
  return {
    ...record,
    calendarName: isRecord(record.payrollCalendar)
      ? stringValue(record.payrollCalendar.name)
      : stringValue(record.calendarName),
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
