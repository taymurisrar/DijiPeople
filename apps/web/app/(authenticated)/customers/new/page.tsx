import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { customerRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";

type PageProps = {
  searchParams?: Promise<{ formId?: string }>;
};

export default async function NewCustomerPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, sessionUser] = await Promise.all([
    searchParams ?? Promise.resolve({} as { formId?: string }),
    getSessionUser(),
  ]);
  const runtime = buildStandardRouteRuntime({
    pageKind: "create",
    sessionUser,
    spec: customerRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );

  return (
    <main className="grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="create"
        record={{ status: "ACTIVE" }}
        runtime={runtime}
        spec={customerRuntimeSpec}
        title="New Customer"
      />
    </main>
  );
}
