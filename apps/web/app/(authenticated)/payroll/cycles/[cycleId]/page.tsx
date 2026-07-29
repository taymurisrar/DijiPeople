import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollCycleRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";
import { PayrollPeriodGenerationAction } from "../../_components/payroll-period-generation-action";

type Props = {
  params: Promise<{ cycleId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PayrollCycleRecordPage({
  params,
  searchParams,
}: Props) {
  const [{ cycleId }, user, query] = await Promise.all([
    params,
    getSessionUser(),
    searchParams,
  ]);
  const record = await apiRequestJson<Record<string, unknown>>(
    `/payroll/cycles/${encodeURIComponent(cycleId)}`,
  );
  const runtime = buildStandardRouteRuntime({
    pageKind: "detail",
    recordId: cycleId,
    sessionUser: user,
    spec: payrollCycleRuntimeSpec,
  });
  const counts = isRecord(record.counts) ? record.counts : {};

  return (
    <PayrollLayoutShell
      title={typeof record.name === "string" ? record.name : "Payroll Cycle"}
      description="View the reusable payroll cycle definition and related defaults."
    >
      <PayrollPeriodGenerationAction
        cycleId={cycleId}
        disabled={!record.payrollCalendarId || record.status === "FINALIZED"}
        existingPeriodCount={typeof counts.periods === "number" ? counts.periods : 0}
      />
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(
          runtime.metadata.forms,
          first(query?.formId),
          "main",
        )}
        mode="read"
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
