import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { loadCustomModuleDefinition } from "@/lib/runtime/custom-modules/custom-module-api";
import { buildCustomModuleRuntime } from "@/lib/runtime/custom-modules/custom-module-runtime";
import { resolveStandardActiveForm } from "@/lib/runtime/modules/standard-module-route-helpers";
import { CustomModuleUnavailable } from "../../_components/custom-module-unavailable";

/* Create screen of a published custom module, from its published form (BUG-3494). */

type PageProps = {
  params: Promise<{ moduleKey: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function NewCustomModuleRecordPage({
  params,
  searchParams,
}: PageProps) {
  const [{ moduleKey }, resolvedSearchParams, sessionUser] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { formId?: string }),
    getSessionUser(),
  ]);
  const definitionLoad = await loadCustomModuleDefinition(moduleKey);
  if (definitionLoad.status !== "ok") {
    return <CustomModuleUnavailable status={definitionLoad.status} />;
  }

  const definition = definitionLoad.data;
  /*
   * Cosmetic: the API refuses the POST without `custom-records.create` either
   * way. Saying so up front beats a form whose Save can only fail.
   */
  if (definition.capabilities.create !== true) {
    return <CustomModuleUnavailable status="forbidden" />;
  }

  const { spec, runtime } = buildCustomModuleRuntime({
    definition,
    pageKind: "create",
    sessionUser,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );

  return (
    <div className="dp-theme-scope grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="create"
        record={{}}
        runtime={runtime}
        spec={spec}
        title={`New ${definition.displayName}`}
      />
    </div>
  );
}
