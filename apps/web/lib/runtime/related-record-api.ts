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
