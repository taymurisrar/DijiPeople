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
import { CustomModuleUnavailable } from "../../_components/custom-module-unavailable";

/*
 * Record screen of a published custom module (BUG-3494), rendered through the
 * shared record shell. The record comes from `GET /data/<moduleKey>/<id>`,
 * which applies tenant, table and READ row scope; a record outside them is
 * not-found, the same answer as one that never existed.
 */

type PageProps = {
  params: Promise<{ moduleKey: string; recordId: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function CustomModuleRecordDetailPage({
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
  const record = recordLoad.data;
  const { spec, runtime } = buildCustomModuleRuntime({
    definition,
    pageKind: "detail",
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
        mode="read"
        record={record}
        recordId={record.id}
        runtime={runtime}
        spec={spec}
        title={resolveCustomModuleRecordTitle(definition, record)}
      />
    </div>
  );
}
