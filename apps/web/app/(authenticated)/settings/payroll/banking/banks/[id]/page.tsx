import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { bankRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PayrollBankRecordPage({
  params,
  searchParams,
}: Props) {
  const [{ id }, user, query] = await Promise.all([
    params,
    getSessionUser(),
    searchParams,
  ]);
  const record = await apiRequestJson<Record<string, unknown>>(
    `/banks/${encodeURIComponent(id)}`,
  );
  const runtime = buildStandardRouteRuntime({
    pageKind: "detail",
    recordId: id,
    sessionUser: user,
    spec: bankRuntimeSpec,
  });

  return (
    <StandardModuleRecordPage
      activeForm={resolveStandardActiveForm(
        runtime.metadata.forms,
        first(query?.formId),
        "main",
      )}
      mode="read"
      record={record}
      recordId={id}
      runtime={runtime}
      spec={bankRuntimeSpec}
      title={typeof record.name === "string" ? record.name : "Bank"}
    />
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
