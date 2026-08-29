import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { customerRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";

type CustomerDetail = {
  id: string;
  name: string;
  code: string;
  industry?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  billingEmail?: string | null;
  websiteUrl?: string | null;
  address?: string | null;
  status: string;
  projects?: Array<{ id: string }>;
};

type PageProps = {
  params: Promise<{ customerId: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function CustomerDetailPage({
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
    pageKind: "detail",
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
        mode="read"
        record={{
          ...customer,
          projectCount: customer.projects?.length ?? 0,
        }}
        recordId={customer.id}
        runtime={runtime}
        spec={customerRuntimeSpec}
        title={customer.name}
      />
    </div>
  );
}
