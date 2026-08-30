import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { employerBankAccountRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";

export default async function EmployerBankAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [record, user] = await Promise.all([
    apiRequestJson<Record<string, unknown>>(
      `/payroll/employer-bank-accounts/${id}`,
    ),
    getSessionUser(),
  ]);
  const runtime = buildStandardRouteRuntime({
    pageKind: "detail",
    recordId: id,
    sessionUser: user,
    spec: employerBankAccountRuntimeSpec,
  });
  return (
    <div className="grid gap-6">
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(runtime.metadata.forms, "")}
        mode="read"
        record={{
          ...record,
          bankName: isRecord(record.bank) ? record.bank.name : undefined,
        }}
        recordId={id}
        runtime={runtime}
        spec={employerBankAccountRuntimeSpec}
        title={
          typeof record.name === "string"
            ? record.name
            : typeof record.accountName === "string"
              ? record.accountName
            : "Employer Bank Account"
        }
      />
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
