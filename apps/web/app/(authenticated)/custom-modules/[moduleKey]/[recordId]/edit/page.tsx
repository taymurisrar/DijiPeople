import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  loadCustomModuleDefinition,
  loadCustomModuleRecord,
} from "@/lib/runtime/custom-modules/custom-module-api";
import {
  buildCustomModuleRuntime,
  resolveCustomModuleRecordTitle,
} from "@/lib/runtime/custom-modules/custom-module-runtime";
import { resolveStandardActiveForm } from "@/lib/runtime/modules/standard-module-route-helpers";
import { CustomModuleUnavailable } from "../../../_components/custom-module-unavailable";

/* Edit screen of a published custom module, from its published form (BUG-3494). */

type PageProps = {
  params: Promise<{ moduleKey: string; recordId: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function EditCustomModuleRecordPage({
  params,
  searchParams,
}: PageProps) {
  const [{ moduleKey, recordId }, resolvedSearchParams, sessionUser] =
    await Promise.all([
      params,
      searchParams ?? Promise.resolve({} as { formId?: string }),
      getSessionUser(),
    ]);
  const [definitionLoad, recordLoad] = await Promise.all([
    loadCustomModuleDefinition(moduleKey),
    loadCustomModuleRecord(moduleKey, recordId),
  ]);
  if (definitionLoad.status !== "ok") {
    return <CustomModuleUnavailable status={definitionLoad.status} />;
  }
  if (recordLoad.status !== "ok") {
    return <CustomModuleUnavailable status={recordLoad.status} />;
  }

  const definition = definitionLoad.data;
  /* Cosmetic, as on the create route: the PATCH is refused server-side too. */
  if (definition.capabilities.update !== true) {
    return <CustomModuleUnavailable status="forbidden" />;
  }

  const record = recordLoad.data;
  const { spec, runtime } = buildCustomModuleRuntime({
    definition,
    pageKind: "edit",
    recordId: record.id,
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
        mode="edit"
        record={record}
        recordId={record.id}
        runtime={runtime}
        spec={spec}
        title={resolveCustomModuleRecordTitle(definition, record)}
      />
    </div>
  );
}
