import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { customerRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";

type CustomerDetail = Readonly<Record<string, unknown>> & {
  id: string;
  name?: string;
};

type PageProps = {
  params: Promise<{ customerId: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function EditCustomerPage({
  params,
  searchParams,
}: PageProps) {
  const [{ customerId }, resolvedSearchParams, sessionUser] = await Promise.all(
    [
      params,
      searchParams ?? Promise.resolve({} as { formId?: string }),
      getSessionUser(),
    ],
  );
  const customer = await apiRequestJson<CustomerDetail>(
    `/customers/${customerId}`,
  );
  const runtime = buildStandardRouteRuntime({
    pageKind: "edit",
    recordId: customer.id,
    sessionUser,
    spec: customerRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );

  return (
    <div className="grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="edit"
        record={customer}
        recordId={customer.id}
        runtime={runtime}
        spec={customerRuntimeSpec}
        title={`Edit ${customer.name ?? "Customer"}`}
      />
    </div>
  );
}
