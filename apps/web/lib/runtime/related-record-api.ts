import type {
  RelatedRecordMutationInput,
  RelatedRecordsInput,
} from "./module-data-adapter.types";

type RelatedInput = RelatedRecordsInput | RelatedRecordMutationInput;

export function relatedRecordPaths(input: RelatedInput) {
  const configured = input.subgrid.api;
  const relatedEntity = input.subgrid.relatedEntityLogicalName;
  const parentId = encodeURIComponent(input.parentRecordId);
  const lookupField = input.parentLookupField
    ? `&lookupField=${encodeURIComponent(input.parentLookupField)}`
    : "";
  const fallback = relatedEntity
    ? `/api/data/${encodeURIComponent(relatedEntity)}?parentEntity=${encodeURIComponent(input.subgrid.entityLogicalName)}&parentId=${parentId}&relationship=${encodeURIComponent(input.subgrid.relationshipName)}${lookupField}`
    : undefined;
  const list = configured?.listPath ?? fallback;
  const create = configured ? configured.createPath : list;
  return {
    list: list ? interpolate(list, input.parentRecordId) : undefined,
    create: create ? interpolate(create, input.parentRecordId) : undefined,
    /*
     * BUG-2011 — whether the create endpoint already carries the parent id.
     *
     * A related-list "New" dialog is opened from a parent record and offers no
     * field for the foreign key, so the runtime has to supply it. There are two
     * places it can go: the path, when the template names `{parentId}`, or the
     * body. The adapter used to choose between them by asking whether the
     * subgrid declared an `api` block at all — which is not the same question,
     * and is the wrong answer for the seven subgrids that declare one with a
     * *flat* create path. Those posted with no parent id anywhere: six 400d
     * naming a field the dialog has no control for, and Department > Teams
     * returned 201 having created a team with `departmentId = null`.
     *
     * So ask the real question. Checked against the raw template rather than
     * the interpolated path, because after interpolation the token is gone by
     * definition and the answer would always be false.
     */
    createConsumedParentId: create ? create.includes("{parentId}") : false,
    bulkDelete: configured ? undefined : fallback,
    record: (recordId: string, operation: "update" | "delete") => {
      const template =
        operation === "update" ? configured?.updatePath : configured?.deletePath;
      if (template) return interpolate(template, input.parentRecordId, recordId);
      if (!fallback) return undefined;
      return `/api/data/${encodeURIComponent(relatedEntity!)}/${encodeURIComponent(recordId)}?parentEntity=${encodeURIComponent(input.subgrid.entityLogicalName)}&parentId=${parentId}&relationship=${encodeURIComponent(input.subgrid.relationshipName)}${lookupField}`;
    },
  };
}

function interpolate(template: string, parentId: string, recordId?: string) {
  return template
    .replaceAll("{parentId}", encodeURIComponent(parentId))
    .replaceAll("{recordId}", encodeURIComponent(recordId ?? ""));
}
