"use client";

import { useState } from "react";
import { Dialog } from "@/app/components/ui/dialog";
import { RuntimeMetadataFormRenderer } from "@/app/components/metadata/runtime-metadata-form-renderer";
import type { LookupOption } from "@/app/components/ui/form-control";
import type {
  EntityMetadata,
  FormMetadata,
} from "@/lib/runtime/metadata-runtime.types";
import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { RuntimeRecordData } from "./module-runtime-ui.types";
import {
  buildQuickCreateValues,
  filterToFormFields,
} from "@/lib/runtime/related-record-create-values";

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

  /*
   * `contextValues` used to be the parent record in full. BUG-2012 — it is now
   * only the fields the subgrid declared its children inherit, narrowed by the
   * caller. The assembly itself lives in `lib/runtime` so it can be tested.
   */
  const values = buildQuickCreateValues({
    inheritedValues: contextValues,
    record,
    draftValues,
    parentBinding,
  });

  // A modal side sheet that declared neither `role="dialog"` nor `aria-modal`,
  // handled no Escape, and let Tab walk out into the list behind it. BUG-0043.
  return (
    <Dialog
      footer={
        <>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted/20"
            onClick={() => void onSave?.(filterToFormFields(values, form), false)}
            type="button"
          >
            Save
          </button>
          <button
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            onClick={() => void onSave?.(filterToFormFields(values, form), true)}
            type="button"
          >
            Save &amp; Close
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="xl"
      title={title ?? "Quick Create"}
      variant="panel"
    >
      <div className="grid gap-4">
        {error ? (
          <p
            className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger"
            role="alert"
          >
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
      </div>
    </Dialog>
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
