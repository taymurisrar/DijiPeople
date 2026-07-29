"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { RuntimeMetadataFormRenderer } from "@/app/components/metadata/runtime-metadata-form-renderer";
import type { LookupOption } from "@/app/components/ui/form-control";
import type {
  EntityMetadata,
  FormMetadata,
} from "@/lib/runtime/metadata-runtime.types";
import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { RuntimeRecordData } from "./module-runtime-ui.types";

export function ModuleQuickCreatePanel({
  contextValues = {},
  dataAdapter,
  form,
  lookupOptions = {},
  onClose,
  onSave,
  open,
  parentBinding,
  record,
  runtime,
  entity,
  title,
  error,
}: {
  readonly contextValues?: RuntimeRecordData;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly form: FormMetadata | null;
  readonly lookupOptions?: Record<string, readonly LookupOption[]>;
  readonly onClose: () => void;
  readonly onSave?: (
    values: RuntimeRecordData,
    closeAfterSave: boolean,
  ) => void | Promise<void>;
  readonly open: boolean;
  readonly parentBinding?: {
    readonly fieldLogicalName: string;
    readonly recordId: string;
  };
  readonly record: RuntimeRecordData;
  readonly runtime: ModuleRuntimeContext;
  readonly entity?: EntityMetadata;
  readonly title?: string;
  readonly error?: string | null;
}) {
  const [draftValues, setDraftValues] = useState<RuntimeRecordData>({});

  if (!open) return null;

  const values = parentBinding
    ? {
        ...contextValues,
        ...record,
        ...draftValues,
        [parentBinding.fieldLogicalName]: parentBinding.recordId,
      }
    : { ...contextValues, ...record, ...draftValues };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            {title ?? "Quick Create"}
          </h2>
          <button
            aria-label="Close quick create"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-muted/20 hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-4 p-5">
          {error ? (
            <p className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          {form ? (
            <RuntimeMetadataFormRenderer
              entity={entity ?? runtime.metadata.entity}
              form={form}
              dataAdapter={dataAdapter}
              lookupOptions={lookupOptions}
              mode="new"
              onValuesChange={setDraftValues}
              runtime={runtime}
              values={toFieldValueMap(values)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
              Quick Create form metadata is not available yet.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted/20"
              onClick={() => void onSave?.(formValues(values, form), false)}
              type="button"
            >
              Save
            </button>
            <button
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
              onClick={() => void onSave?.(formValues(values, form), true)}
              type="button"
            >
              Save & Close
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function formValues(record: RuntimeRecordData, form: FormMetadata | null) {
  if (!form) return record;

  const fieldNames = new Set(
    form.sections.flatMap((section) =>
      section.fields.map((field) => field.fieldLogicalName),
    ),
  );
  if (!fieldNames.size) return record;

  return Object.fromEntries(
    Object.entries(record).filter(([key]) => fieldNames.has(key)),
  );
}

function toFieldValueMap(record: RuntimeRecordData) {
  const values: Record<
    string,
    string | number | boolean | readonly string[] | null | undefined
  > = {};

  for (const [key, value] of Object.entries(record)) {
    values[key] = isFieldValue(value)
      ? value
      : value == null
        ? null
        : String(value);
  }

  return values;
}

function isFieldValue(
  value: unknown,
): value is string | number | boolean | readonly string[] | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}
