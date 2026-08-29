import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { employeeBankAccountRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";

export default async function EmployeeBankAccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ formId?: string }>;
}) {
  const { id } = await params;
  const requestedFormId = (await searchParams)?.formId ?? "";
  const [record, user] = await Promise.all([
    apiRequestJson<Record<string, unknown>>(`/employee-bank-accounts/${id}`),
    getSessionUser(),
  ]);
  const runtime = buildStandardRouteRuntime({
    pageKind: "detail",
    recordId: id,
    sessionUser: user,
    spec: employeeBankAccountRuntimeSpec,
  });

  return (
    <div className="grid gap-6">
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(
          runtime.metadata.forms,
          requestedFormId,
        )}
        mode="read"
        record={record}
        recordId={id}
        runtime={runtime}
        spec={employeeBankAccountRuntimeSpec}
        title={
          typeof record.accountTitle === "string"
            ? record.accountTitle
            : "Employee Bank Account"
        }
      />
    </div>
  );
}
