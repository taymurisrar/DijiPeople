import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { withRouteCustomFields } from "@/lib/runtime/custom-fields-server";
import { projectRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";

type PageProps = {
  searchParams?: Promise<{ formId?: string }>;
};

export default async function NewProjectPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, sessionUser] = await Promise.all([
    searchParams ?? Promise.resolve({} as { formId?: string }),
    getSessionUser(),
  ]);
  /* TASK-0035: the tenant's custom fields on this module. */
  const runtime = await withRouteCustomFields(
    buildStandardRouteRuntime({
      pageKind: "create",
      sessionUser,
      spec: projectRuntimeSpec,
    }),
  );
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );

  return (
    <div className="dp-theme-scope dp-projects-scope grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="create"
        record={{ status: "PLANNING" }}
        runtime={runtime}
        spec={projectRuntimeSpec}
        title="New Project"
      />
    </div>
  );
}
